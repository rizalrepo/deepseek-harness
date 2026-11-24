/** Register a free DuckDuckGo HTML/Lite web-search provider in `ctx.web`. */
import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-web'
import {
  DUCKDUCKGO_DEFAULT_MAX_RESULTS,
  DUCKDUCKGO_DEFAULT_REGION,
  DuckDuckGoSearchProvider,
} from './provider.ts'

export {
  DUCKDUCKGO_DEFAULT_MAX_RESULTS,
  DUCKDUCKGO_DEFAULT_REGION,
  DUCKDUCKGO_HTML_URL,
  DUCKDUCKGO_LITE_URL,
  DUCKDUCKGO_SEARCH_PROVIDER_ID,
  DuckDuckGoSearchProvider,
  parseHtmlResults,
  parseLiteResults,
  resolveDuckDuckGoUrl,
} from './provider.ts'
export type { DuckDuckGoSearchOptions } from './provider.ts'

/** Cordis plugin name. */
export const name = 'web-search-duckduckgo'

/** The web capability this provider registers with. */
export const inject = ['web']

/** Settings for the DuckDuckGo search provider. */
export interface Config {
  /** Maximum results returned per search. */
  maxResults: Volatile<number>
  /** DuckDuckGo region parameter (`kl`). */
  region: Volatile<string>
}

export const Config = z.object({
  maxResults: z.number().step(1).min(1).default(DUCKDUCKGO_DEFAULT_MAX_RESULTS).volatile(),
  region: z.string().default(DUCKDUCKGO_DEFAULT_REGION).volatile(),
})

/** Register the DuckDuckGo search provider on `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  const provider = new DuckDuckGoSearchProvider(() => ({
    maxResults: config.maxResults.get(),
    region: config.region.get(),
  }))
  ctx.web.registerSearchProvider({
    id: provider.id,
    description: provider.description,
    available: () => provider.available(),
    ready: llmProvider => provider.ready(llmProvider),
    search: (request, signal) => provider.search(request, signal),
  })
}
