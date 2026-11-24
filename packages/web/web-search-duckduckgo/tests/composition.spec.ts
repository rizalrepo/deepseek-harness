/** Real Loader composition for the DuckDuckGo web-search provider. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { ModuleLoaderV2 } from '@deepseek-ai/cordis-plugin-loader'
import { boot } from '@deepseek-ai/dsh-app-boot'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as duckDuckGoPlugin from '@deepseek-ai/dsh-web-search-duckduckgo'
import { DUCKDUCKGO_HTML_URL } from '../src/provider.ts'

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.unstubAllGlobals()
})

const MODULES: Record<string, unknown> = {
  '@deepseek-ai/dsh-web': WebRuntime,
  '@deepseek-ai/dsh-web-search-duckduckgo': duckDuckGoPlugin,
}

describe('web-search-duckduckgo composition', () => {
  it('registers and executes DuckDuckGo search when selected in ctx.web', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === DUCKDUCKGO_HTML_URL) {
        return new Response(
          '<a class="result__a" href="https://docs.example.com/">Docs</a><a class="result__snippet">Free search</a>',
          { status: 200 },
        )
      }
      throw new Error(`Unexpected composition request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const root = await mkdtemp(join(tmpdir(), 'dsh-web-search-duckduckgo-composition-'))
    cleanups.push(async () => { await rm(root, { recursive: true, force: true }) })
    const previousHome = process.env.DSH_HOME
    process.env.DSH_HOME = root
    cleanups.push(async () => {
      if (previousHome === undefined) Reflect.deleteProperty(process.env, 'DSH_HOME')
      else process.env.DSH_HOME = previousHome
    })

    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, JSON.stringify([
      { id: 'web', name: '@deepseek-ai/dsh-web', config: { searchProvider: 'duckduckgo-web-search' } },
      { id: 'web-search-duckduckgo', name: '@deepseek-ai/dsh-web-search-duckduckgo' },
    ]))

    const ctx: Context = await boot('web-search-duckduckgo-composition', configPath, [], (host) => {
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
    })
    cleanups.push(async () => { await ctx.fiber.dispose() })

    expect(ctx.web.listProviders().search.map(({ id }) => id)).toEqual(['duckduckgo-web-search'])
    await expect(ctx.web.searchReady(undefined)).resolves.toBe(true)

    const result = await ctx.web.search({ query: 'deepseek harness' })
    expect(result).toEqual({
      sources: [{ url: 'https://docs.example.com/', title: 'Docs', snippet: 'Free search' }],
      truncated: false,
    })
  })
})
