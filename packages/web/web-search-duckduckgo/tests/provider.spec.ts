/** Unit tests for DuckDuckGo HTML/Lite web-search parsing and transport. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebError } from '@deepseek-ai/dsh-web'
import {
  DUCKDUCKGO_HTML_URL,
  DUCKDUCKGO_LITE_URL,
  DUCKDUCKGO_SEARCH_PROVIDER_ID,
  DuckDuckGoSearchProvider,
  parseHtmlResults,
  parseLiteResults,
  resolveDuckDuckGoUrl,
} from '../src/provider.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

const HTML_FIXTURE = `
<div class="result results_links results_links_deep web-result">
  <h2 class="result__title">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs%3Fa%3D1%26b%3D2&amp;rut=123">Example <b>Docs</b> &amp; Guide</a>
  </h2>
  <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs">Read the <b>full</b> guide &amp; API reference.</a>
</div>
<div class="result results_links">
  <h2 class="result__title">
    <a class="result__a" href="https://duckduckgo.com/y.js?ad_domain=ads.example">Sponsored Ad</a>
  </h2>
</div>
<div class="result results_links">
  <h2 class="result__title">
    <a class="result__a" href="https://second.example.org/post">Second Result</a>
  </h2>
  <div class="result__snippet">Second snippet text.</div>
</div>
`

const LITE_FIXTURE = `
<table>
  <tr>
    <td><a class="result-link" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Flite.example.com%2Fpage">Lite Page</a></td>
  </tr>
  <tr>
    <td class="result-snippet">Lite snippet &quot;quoted&quot;.</td>
  </tr>
</table>
`

describe('DuckDuckGoSearchProvider', () => {
  it('decodes DuckDuckGo redirect URLs and rejects ads/internal links', () => {
    expect(resolveDuckDuckGoUrl('//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs')).toBe('https://example.com/docs')
    expect(resolveDuckDuckGoUrl('https://direct.example.com/path')).toBe('https://direct.example.com/path')
    expect(resolveDuckDuckGoUrl('https://duckduckgo.com/y.js?ad_domain=foo')).toBeUndefined()
    expect(resolveDuckDuckGoUrl('javascript:alert(1)')).toBeUndefined()
  })

  it('parses HTML results, decodes entities, strips tags, and filters ads', () => {
    expect(parseHtmlResults(HTML_FIXTURE)).toEqual([
      {
        url: 'https://example.com/docs?a=1&b=2',
        title: 'Example Docs & Guide',
        snippet: 'Read the full guide & API reference.',
      },
      {
        url: 'https://second.example.org/post',
        title: 'Second Result',
        snippet: 'Second snippet text.',
      },
    ])
  })

  it('parses Lite results', () => {
    expect(parseLiteResults(LITE_FIXTURE)).toEqual([
      {
        url: 'https://lite.example.com/page',
        title: 'Lite Page',
        snippet: 'Lite snippet "quoted".',
      },
    ])
  })

  it('is always available and ready without credentials', async () => {
    const provider = new DuckDuckGoSearchProvider(() => ({ maxResults: 10, region: 'wt-wt' }))
    expect(provider.id).toBe(DUCKDUCKGO_SEARCH_PROVIDER_ID)
    expect(provider.available()).toBe(true)
    await expect(provider.ready(undefined)).resolves.toBe(true)
    await expect(provider.ready('rizal-router')).resolves.toBe(true)
  })

  it('falls back to Lite when HTML endpoint fails or returns empty', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === DUCKDUCKGO_HTML_URL) {
        return new Response('rate limited', { status: 429 })
      }
      if (url === DUCKDUCKGO_LITE_URL) {
        return new Response(LITE_FIXTURE, { status: 200 })
      }
      throw new Error(`Unexpected url: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = new DuckDuckGoSearchProvider(() => ({ maxResults: 10, region: 'wt-wt' }))
    const result = await provider.search({ query: 'typescript' })
    expect(result).toEqual({
      sources: [{
        url: 'https://lite.example.com/page',
        title: 'Lite Page',
        snippet: 'Lite snippet "quoted".',
      }],
      truncated: false,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('truncates results to maxResults', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(HTML_FIXTURE, { status: 200 })))
    const provider = new DuckDuckGoSearchProvider(() => ({ maxResults: 10, region: 'wt-wt' }))
    const result = await provider.search({ query: 'docs', maxResults: 1 })
    expect(result.truncated).toBe(true)
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]?.url).toBe('https://example.com/docs?a=1&b=2')
  })

  it('reports WEB_ABORTED when signal is aborted', async () => {
    const controller = new AbortController()
    controller.abort('user cancelled')
    const provider = new DuckDuckGoSearchProvider(() => ({ maxResults: 10, region: 'wt-wt' }))
    await expect(provider.search({ query: 'test' }, controller.signal)).rejects.toMatchObject({
      code: 'WEB_ABORTED',
    } satisfies Partial<WebError>)
  })

  it('reports WEB_PROVIDER_ERROR when both endpoints fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('blocked', { status: 503 })))
    const provider = new DuckDuckGoSearchProvider(() => ({ maxResults: 10, region: 'wt-wt' }))
    await expect(provider.search({ query: 'test' })).rejects.toMatchObject({
      code: 'WEB_PROVIDER_ERROR',
    } satisfies Partial<WebError>)
  })
})
