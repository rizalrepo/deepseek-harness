/** Consumer-visible transport and response behavior for OpenRouter Responses search. */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebError, type WebSearchRequest } from '@deepseek-ai/dsh-web'
import { OpenRouterSearchProvider } from '../src/provider.ts'
import type { OpenRouterSearchOptions } from '../src/provider.ts'

const options = (overrides: Partial<OpenRouterSearchOptions> = {}): OpenRouterSearchOptions => ({
  model: 'openrouter/auto',
  maxResults: 8,
  maxOutputTokens: 512,
  credentialAvailable: () => true,
  resolveApiKey: async () => 'or-secret',
  ready: async () => true,
  ...overrides,
})

const provider = (value: OpenRouterSearchOptions = options()): OpenRouterSearchProvider =>
  new OpenRouterSearchProvider(() => value)

const request: WebSearchRequest = { query: 'latest research', maxResults: 3 }

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

function completedResponse(overrides: Record<string, unknown> = {}) {
  return {
    status: 'completed',
    output: [
      { type: 'web_search_call', status: 'completed' },
      { type: 'message', role: 'assistant', content: [{
        type: 'output_text',
        text: '  First answer.  ',
        annotations: [
          { type: 'url_citation', url: 'https://example.test/a', title: 'Example' },
          { type: 'url_citation', url: 'https://example.test/a', title: 'Duplicate' },
          { type: 'url_citation', url: 'https://example.test/b' },
          { type: 'url_citation', url: 'ftp://example.test/file' },
        ],
      }, { type: 'output_text', text: 'Second answer.' }] },
    ],
    ...overrides,
  }
}

async function rejectedWebError(operation: Promise<unknown>): Promise<WebError> {
  try { await operation }
  catch (error: unknown) {
    if (error instanceof WebError) return error
    throw error
  }
  throw new Error('expected operation to reject')
}

afterEach(() => vi.unstubAllGlobals())

describe('OpenRouterSearchProvider', () => {
  it('sends a bounded OpenRouter Responses request with the caller signal', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => jsonResponse(completedResponse()))
    vi.stubGlobal('fetch', fetchMock)

    const result = await provider().search(request, controller.signal)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://openrouter.ai/api/v1/responses')
    expect(init?.method).toBe('POST')
    expect(init?.redirect).toBe('error')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer or-secret')
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
    expect(new Headers(init?.headers).get('accept')).toBe('application/json')
    expect(init?.signal).toBe(controller.signal)
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'openrouter/auto',
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'latest research' }] }],
      tools: [{ type: 'openrouter:web_search', parameters: { max_uses: 1, max_total_results: 3 } }],
      tool_choice: 'required',
      max_output_tokens: 512,
    })
    expect(result.content).toBe('First answer.\n\nSecond answer.')
  })

  it('maps answer text and deduplicates valid HTTP citation URLs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(completedResponse())))
    await expect(provider().search(request)).resolves.toEqual({
      content: 'First answer.\n\nSecond answer.',
      sources: [
        { url: 'https://example.test/a', title: 'Example' },
        { url: 'https://example.test/b' },
      ],
      truncated: false,
    })
  })

  it.each([
    ['missing completed status', { status: 'in_progress', output: [] }],
    ['missing output', { status: 'completed' }],
    ['missing completed web search', { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [] }] }],
    ['incomplete web search', { status: 'completed', output: [{ type: 'web_search_call', status: 'in_progress' }] }],
    ['malformed assistant message', { status: 'completed', output: [{ type: 'web_search_call', status: 'completed' }, { type: 'message', role: 'assistant' }] }],
    ['malformed output text', { status: 'completed', output: [{ type: 'web_search_call', status: 'completed' }, { type: 'message', role: 'assistant', content: [{ type: 'output_text' }] }] }],
    ['malformed URL citation', { status: 'completed', output: [{ type: 'web_search_call', status: 'completed' }, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'x', annotations: [{ type: 'url_citation', url: 'not a URL' }] }] }] }],
  ])('rejects %s responses', async (_name, payload) => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(payload)))
    const error = await rejectedWebError(provider().search(request))
    expect(error.code).toBe('WEB_PROVIDER_ERROR')
    expect(error.message).toContain('invalid or incomplete web-search response')
  })

  it('reports HTTP API errors and their server message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { message: 'rate limit reached' } }, { status: 429 })))
    const error = await rejectedWebError(provider().search(request))
    expect(error.message).toContain('HTTP 429')
    expect(error.message).toContain('rate limit reached')
  })

  it('reports credential resolution errors without calling fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const error = await rejectedWebError(provider(options({ resolveApiKey: async () => { throw new Error('secret store offline') } })).search(request))
    expect(error.message).toContain('API key resolution failed')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports empty credentials and exposes availability/readiness', async () => {
    const emptyKeyProvider = provider(options({ resolveApiKey: async () => '' }))
    const error = await rejectedWebError(emptyKeyProvider.search(request))
    expect(error.message).toContain('API key resolution failed')

    expect(provider(options()).available()).toBe(true)
    expect(provider(options({ credentialAvailable: () => false })).available()).toBe(false)
    expect(provider(options({ model: '  ' })).available()).toBe(false)
    expect(provider(options({ maxResults: 0 })).available()).toBe(false)
    expect(provider(options({ maxOutputTokens: 0 })).available()).toBe(false)
    await expect(provider(options({ ready: async () => true })).ready(undefined)).resolves.toBe(true)
    await expect(provider(options({ ready: async () => { throw new Error('not ready') } })).ready(undefined)).resolves.toBe(false)
  })

  it('preserves cancellation and passes signal to fetch', async () => {
    const controller = new AbortController()
    const fetchStarted = Promise.withResolvers<undefined>()
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      fetchStarted.resolve(undefined)
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const pending = provider().search(request, controller.signal)
    await fetchStarted.promise
    controller.abort()
    const error = await rejectedWebError(pending)
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
    expect(error.code).toBe('WEB_ABORTED')
  })

  it('rejects cross-origin redirects without contacting the redirect target', async () => {
    let targetRequests = 0
    const target = createServer((_incoming, response) => { targetRequests++; response.end('unexpected') })
    await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve))
    const targetAddress = target.address() as AddressInfo
    const source = createServer((_incoming, response) => {
      response.writeHead(302, { location: `http://127.0.0.1:${targetAddress.port}/stolen` })
      response.end()
    })
    await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve))
    const sourceAddress = source.address() as AddressInfo
    const realFetch = globalThis.fetch
    vi.stubGlobal('fetch', (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://openrouter.ai/api/v1/responses')
      return realFetch(`http://127.0.0.1:${sourceAddress.port}/`, init)
    })
    try {
      const error = await rejectedWebError(provider().search(request))
      expect(error.message).toContain('request failed')
      expect(targetRequests).toBe(0)
    } finally {
      await Promise.all([source, target].map(server => new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve())
      })))
    }
  })
})
