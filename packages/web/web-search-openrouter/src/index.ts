/** Register an OpenRouter Responses API web-search provider in `ctx.web`. */
import type { Volatile } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { assertUsableApiKey } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-web'
import { WebError } from '@deepseek-ai/dsh-web'
import {
  OPENROUTER_DEFAULT_MAX_OUTPUT_TOKENS, OPENROUTER_DEFAULT_MAX_RESULTS, OPENROUTER_DEFAULT_MODEL,
  OpenRouterSearchProvider,
} from './provider.ts'

export {
  OPENROUTER_DEFAULT_MAX_OUTPUT_TOKENS, OPENROUTER_DEFAULT_MAX_RESULTS, OPENROUTER_DEFAULT_MODEL,
  OPENROUTER_RESPONSES_URL, OPENROUTER_SEARCH_PROVIDER_ID, OpenRouterSearchProvider, mapResponsesResult,
} from './provider.ts'
export type { OpenRouterSearchOptions } from './provider.ts'

/** Cordis plugin name. */
export const name = 'web-search-openrouter'

/** The web capability this provider registers with. */
export const inject = ['web']

/** Settings for the OpenRouter search request. */
export interface Config {
  /** Credential reference for the OpenRouter API key. */
  apiKeyEnv: Volatile<string>
  /** OpenRouter model ID used for auxiliary search. */
  model: Volatile<string>
  /** Upper bound sent to the web-search server tool. */
  maxResults: Volatile<number>
  /** Maximum generated answer tokens in the Responses request. */
  maxOutputTokens: Volatile<number>
}

export const Config = z.object({
  apiKeyEnv: z.string().role('credential-ref').default('OPENROUTER_API_KEY').volatile(),
  model: z.string().default(OPENROUTER_DEFAULT_MODEL).volatile(),
  maxResults: z.number().step(1).min(1).default(OPENROUTER_DEFAULT_MAX_RESULTS).volatile(),
  maxOutputTokens: z.number().step(1).min(1).default(OPENROUTER_DEFAULT_MAX_OUTPUT_TOKENS).volatile(),
})

/** Register a provider whose credentials resolve afresh for every search. */
export function apply(ctx: Context, config: Config): void {
  const resolveOptions = () => {
    const apiKeyEnv = credentialRef(config.apiKeyEnv.get())
    return {
      model: config.model.get(),
      maxResults: config.maxResults.get(),
      maxOutputTokens: config.maxOutputTokens.get(),
      credentialAvailable: () => {
        if (ctx.get('credentials') !== undefined) return true
        return (launchEnvironmentOf(ctx).get(apiKeyEnv)?.value.length ?? 0) > 0
      },
      resolveApiKey: () => resolveOpenRouterApiKey(ctx, apiKeyEnv),
      ready: () => isOpenRouterApiKeyConfigured(ctx, apiKeyEnv),
    }
  }
  const provider = new OpenRouterSearchProvider(resolveOptions)
  ctx.web.registerSearchProvider({
    id: provider.id,
    description: provider.description,
    available: () => provider.available(),
    ready: llmProvider => provider.ready(llmProvider),
    search: (request, signal) => provider.search(request, signal),
  })
}

/** Resolve and validate the OpenRouter key through the authoritative credential source. */
async function resolveOpenRouterApiKey(ctx: Context, ref: CredentialRef): Promise<string> {
  const credentials = ctx.get('credentials')
  const raw = credentials === undefined
    ? launchEnvironmentOf(ctx).get(ref)?.value
    : (await credentials.resolve(ref))?.value
  if (raw === undefined || raw.length === 0) {
    throw new WebError(
      `OpenRouter web search has no API key for ${JSON.stringify(ref)}; store it through the credentials service`
      + ' or export it in the launching environment',
      'WEB_PROVIDER_CREDENTIAL_MISSING',
    )
  }
  return assertUsableApiKey(raw, 'web-search-openrouter', ref)
}

/** Check configured-key presence without reading its secret value. */
async function isOpenRouterApiKeyConfigured(ctx: Context, ref: CredentialRef): Promise<boolean> {
  const credentials = ctx.get('credentials')
  return credentials === undefined
    ? (launchEnvironmentOf(ctx).get(ref)?.value.length ?? 0) > 0
    : (await credentials.describe(ref)).configured
}
