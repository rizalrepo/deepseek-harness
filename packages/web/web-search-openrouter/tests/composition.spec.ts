/** Real Loader composition for the opt-in OpenRouter web-search provider. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { ModuleLoaderV2 } from '@deepseek-ai/cordis-plugin-loader'
import { boot } from '@deepseek-ai/dsh-app-boot'
import type { DeepSeekAccount } from '@deepseek-ai/dsh-deepseek-account'
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as Account from '@deepseek-ai/dsh-llm-deepseek-account'
import * as Official from '@deepseek-ai/dsh-llm-deepseek-api-key'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as webApiPlugin from '@deepseek-ai/dsh-web-deepseek-api'
import * as openRouterPlugin from '@deepseek-ai/dsh-web-search-openrouter'

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.unstubAllGlobals()
})

const MODULES: Record<string, unknown> = {
  '@deepseek-ai/dsh-llm': LlmRuntime,
  '@deepseek-ai/dsh-llm-deepseek-api-key': Official,
  '@deepseek-ai/dsh-llm-deepseek-account': Account,
  '@deepseek-ai/dsh-web': WebRuntime,
  '@deepseek-ai/dsh-web-deepseek-api': webApiPlugin,
  '@deepseek-ai/dsh-web-search-openrouter': openRouterPlugin,
}

/** Boot a temporary cordis.yml composition and capture provider requests. */
async function bootComposition(searchProvider: string, environment: Record<string, string>) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === 'https://openrouter.ai/api/v1/responses') {
      return Response.json({
        status: 'completed',
        output: [
          { type: 'web_search_call', status: 'completed' },
          { type: 'message', role: 'assistant', content: [{
            type: 'output_text', text: 'OpenRouter result',
            annotations: [{ type: 'url_citation', url: 'https://source.example/', title: 'Source' }],
          }] },
        ],
      })
    }
    if (url.endsWith('/search')) {
      return Response.json({ results: [{ url: 'https://deepseek.example/', title: 'DeepSeek source', snippet: 'Search API result', date: null }] })
    }
    throw new Error(`Unexpected composition request: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  const root = await mkdtemp(join(tmpdir(), 'dsh-web-search-openrouter-composition-'))
  cleanups.push(async () => { await rm(root, { recursive: true, force: true }) })
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = root
  cleanups.push(async () => {
    if (previousHome === undefined) Reflect.deleteProperty(process.env, 'DSH_HOME')
    else process.env.DSH_HOME = previousHome
  })
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, JSON.stringify([
    { id: 'llm', name: '@deepseek-ai/dsh-llm' },
    { id: 'llm-deepseek', name: '@deepseek-ai/dsh-llm-deepseek-api-key' },
    { id: 'llm-deepseek-account', name: '@deepseek-ai/dsh-llm-deepseek-account' },
    { id: 'web', name: '@deepseek-ai/dsh-web', config: { searchProvider } },
    { id: 'web-deepseek-api', name: '@deepseek-ai/dsh-web-deepseek-api' },
    { id: 'web-search-openrouter', name: '@deepseek-ai/dsh-web-search-openrouter' },
  ]))
  const ctx: Context = await boot('web-search-openrouter-composition', configPath, [], (host) => {
    const modules: ModuleLoaderV2 = {
      version: 'v2', loadCache: new Map(),
      async import(specifier) {
        if (!(specifier in MODULES)) throw new Error(`Unexpected fixture module ${specifier}`)
        return MODULES[specifier]
      },
      register(): never { throw new Error('Unexpected module hook registration') },
      getOrCreateModuleJob(): never { throw new Error('Unexpected module job creation') },
      resolveSync(): never { throw new Error('Unexpected synchronous module resolution') },
      load(): never { throw new Error('Unexpected module load') },
    }
    host.loader.internal = modules
    host.provide('launchEnvironment', createLaunchEnvironmentSnapshot([{ source: 'process', values: environment }]))
    host.provide('deepseekAccount', { resolveToken: async () => 'account-token' } as Pick<DeepSeekAccount, 'resolveToken'> as DeepSeekAccount)
  })
  cleanups.push(async () => { await ctx.fiber.dispose() })
  return { ctx, fetchMock }
}

describe('web-search-openrouter over the real loader composition', () => {
  it('registers OpenRouter without changing the default DeepSeek Search API selection', async () => {
    const { ctx, fetchMock } = await bootComposition('deepseek-search-api', {
      DEEPSEEK_API_KEY: 'deepseek-key', OPENROUTER_API_KEY: 'openrouter-key',
    })

    expect(ctx.web.listProviders().search.map(({ id }) => id)).toEqual([
      'deepseek-search-api', 'openrouter-web-search',
    ])
    const result = await ctx.web.search({ query: 'default provider' })
    expect(result.sources).toEqual([{
      url: 'https://deepseek.example/', title: 'DeepSeek source', snippet: 'Search API result',
    }])
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['https://api.deepseek.com/v1/tools/search'])
  })

  it('selects and executes OpenRouter when web.searchProvider pins its provider id', async () => {
    const { ctx, fetchMock } = await bootComposition('openrouter-web-search', {
      DEEPSEEK_API_KEY: 'deepseek-key', OPENROUTER_API_KEY: 'openrouter-key',
    })

    expect(ctx.web.listProviders().search.map(({ id }) => id)).toEqual([
      'deepseek-search-api', 'openrouter-web-search',
    ])
    const result = await ctx.web.search({ query: 'OpenRouter query', maxResults: 3 })
    expect(result).toMatchObject({
      content: 'OpenRouter result',
      sources: [{ url: 'https://source.example/', title: 'Source' }],
      truncated: false,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://openrouter.ai/api/v1/responses')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer openrouter-key')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'openrouter/auto',
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'OpenRouter query' }] }],
      tools: [{ type: 'openrouter:web_search', parameters: { max_uses: 1, max_total_results: 3 } }],
      tool_choice: 'required',
    })
  })
})
