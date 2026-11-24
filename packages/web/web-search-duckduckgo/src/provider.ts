/** DuckDuckGo HTML/Lite transport and result parser for web search. */
import { WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'

/** Search registry id. */
export const DUCKDUCKGO_SEARCH_PROVIDER_ID = 'duckduckgo-web-search'

/** Primary DuckDuckGo HTML search endpoint. */
export const DUCKDUCKGO_HTML_URL = 'https://html.duckduckgo.com/html/'

/** Fallback DuckDuckGo Lite search endpoint. */
export const DUCKDUCKGO_LITE_URL = 'https://lite.duckduckgo.com/lite/'

/** Default maximum results returned for one search. */
export const DUCKDUCKGO_DEFAULT_MAX_RESULTS = 10

/** Default DuckDuckGo region code (no region bias). */
export const DUCKDUCKGO_DEFAULT_REGION = 'wt-wt'

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** Settings snapshotted for a DuckDuckGo search operation. */
export interface DuckDuckGoSearchOptions {
  /** Maximum search results returned per query. */
  readonly maxResults: number
  /** DuckDuckGo region parameter (`kl`), e.g. `wt-wt` or `id-id`. */
  readonly region: string
}

/** Search the public web via DuckDuckGo HTML with Lite fallback, requiring no API key. */
export class DuckDuckGoSearchProvider implements WebSearchProvider {
  readonly id = DUCKDUCKGO_SEARCH_PROVIDER_ID
  readonly description: NonNullable<WebSearchProvider['description']> = {
    en: 'Free web search via DuckDuckGo HTML/Lite (no API key or credits required).',
    zh: '通过 DuckDuckGo HTML/Lite 进行免费网页搜索（无需 API 密钥或额度）。',
  }

  constructor(private readonly resolveOptions: () => DuckDuckGoSearchOptions) {}

  available(): boolean {
    const options = this.resolveOptions()
    return isPositiveInteger(options.maxResults) && options.region.trim().length > 0
  }

  async ready(_llmProvider: string | undefined): Promise<boolean> {
    return this.available()
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    throwIfAborted(signal)
    const options = this.resolveOptions()
    if (!isPositiveInteger(options.maxResults)) {
      throw new WebError('DuckDuckGo maxResults must be a positive integer', 'WEB_PROVIDER_ERROR')
    }

    const query = request.query.trim()
    if (query.length === 0) {
      return { sources: [], truncated: false }
    }

    const limit = request.maxResults === undefined
      ? options.maxResults
      : Math.min(options.maxResults, Math.max(1, Math.floor(request.maxResults)))

    const errors: string[] = []

    // Try primary HTML endpoint first; fall back to Lite if blocked or empty.
    for (const endpoint of [
      { url: DUCKDUCKGO_HTML_URL, parser: parseHtmlResults },
      { url: DUCKDUCKGO_LITE_URL, parser: parseLiteResults },
    ] as const) {
      throwIfAborted(signal)
      try {
        const html = await fetchSearchPage(endpoint.url, query, options.region, signal)
        const parsed = endpoint.parser(html)
        if (parsed.length > 0) {
          const truncated = parsed.length > limit
          return {
            sources: truncated ? parsed.slice(0, limit) : parsed,
            truncated,
          }
        }
      } catch (error) {
        if (error instanceof WebError && error.code === 'WEB_ABORTED') {
          throw error
        }
        errors.push(`${endpoint.url}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    if (errors.length > 0) {
      throw new WebError(
        `DuckDuckGo search failed across all endpoints (${errors.join('; ')})`,
        'WEB_PROVIDER_ERROR',
      )
    }

    return { sources: [], truncated: false }
  }
}

async function fetchSearchPage(
  endpointUrl: string,
  query: string,
  region: string,
  signal?: AbortSignal,
): Promise<string> {
  const body = new URLSearchParams({
    q: query,
    kl: region,
  }).toString()

  let response: Response
  try {
    response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': USER_AGENT,
      },
      body,
      redirect: 'manual',
      ...(signal === undefined ? {} : { signal }),
    })
  } catch (error) {
    if (isAbortError(error, signal)) {
      throw new WebError('DuckDuckGo search aborted', 'WEB_ABORTED', { cause: error })
    }
    throw new WebError(
      `DuckDuckGo transport failure: ${error instanceof Error ? error.message : String(error)}`,
      'WEB_PROVIDER_ERROR',
      { cause: error },
    )
  }

  if (response.status >= 300 && response.status < 400) {
    throw new WebError(`DuckDuckGo redirected unexpectedly (HTTP ${response.status})`, 'WEB_PROVIDER_ERROR')
  }
  if (!response.ok) {
    throw new WebError(`DuckDuckGo HTTP ${response.status}`, 'WEB_PROVIDER_ERROR')
  }

  try {
    return await response.text()
  } catch (error) {
    if (isAbortError(error, signal)) {
      throw new WebError('DuckDuckGo search aborted while reading body', 'WEB_ABORTED', { cause: error })
    }
    throw new WebError(
      `Failed reading DuckDuckGo response: ${error instanceof Error ? error.message : String(error)}`,
      'WEB_PROVIDER_ERROR',
      { cause: error },
    )
  }
}

/** Parse result anchors and snippets from `html.duckduckgo.com/html/`. */
export function parseHtmlResults(html: string): WebSearchSource[] {
  return extractSources(
    html,
    /<a[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    /<(?:a|div|span)[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/gi,
  )
}

/** Parse result links and snippets from `lite.duckduckgo.com/lite/`. */
export function parseLiteResults(html: string): WebSearchSource[] {
  return extractSources(
    html,
    /<a[^>]*class="[^"]*\bresult-link\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    /<td[^>]*class="[^"]*\bresult-snippet\b[^"]*"[^>]*>([\s\S]*?)<\/td>/gi,
  )
}

function extractSources(html: string, anchorRe: RegExp, snippetRe: RegExp): WebSearchSource[] {
  const results: WebSearchSource[] = []
  const seen = new Set<string>()

  const anchors: Array<{ url: string; title: string; index: number }> = []
  let match: RegExpExecArray | null
  while ((match = anchorRe.exec(html)) !== null) {
    const rawHref = match[1]
    const rawTitle = match[2]
    if (rawHref === undefined || rawTitle === undefined) continue
    const resolvedUrl = resolveDuckDuckGoUrl(decodeHtmlEntities(rawHref))
    if (!resolvedUrl) continue
    anchors.push({ url: resolvedUrl, title: cleanText(rawTitle), index: match.index })
  }

  const snippets: Array<{ text: string; index: number }> = []
  while ((match = snippetRe.exec(html)) !== null) {
    const rawSnippet = match[1]
    if (rawSnippet === undefined) continue
    snippets.push({ text: cleanText(rawSnippet), index: match.index })
  }

  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i]
    if (!anchor || seen.has(anchor.url)) continue
    seen.add(anchor.url)

    const nextAnchor = anchors[i + 1]
    const nextAnchorIndex = nextAnchor ? nextAnchor.index : Number.POSITIVE_INFINITY
    const snippet = snippets.find(s => s.index > anchor.index && s.index < nextAnchorIndex)?.text

    results.push({
      url: anchor.url,
      ...(anchor.title ? { title: anchor.title } : {}),
      ...(snippet ? { snippet } : {}),
    })
  }

  return results
}

/** Decode DuckDuckGo `/l/?uddg=...` redirect URLs and reject non-HTTP(S) or ad URLs. */
export function resolveDuckDuckGoUrl(rawHref: string): string | undefined {
  const trimmed = rawHref.trim()
  if (!trimmed) return undefined

  let candidate = trimmed
  if (candidate.startsWith('//')) {
    candidate = `https:${candidate}`
  } else if (candidate.startsWith('/')) {
    candidate = `https://duckduckgo.com${candidate}`
  }

  try {
    const parsed = new URL(candidate)
    if (parsed.hostname.endsWith('duckduckgo.com')) {
      if (parsed.pathname === '/l/' || parsed.pathname === '/l') {
        const uddg = parsed.searchParams.get('uddg')
        if (!uddg) return undefined
        const target = new URL(uddg)
        return isHttpUrl(target) ? target.toString() : undefined
      }
      // Reject internal DuckDuckGo links and ad click trackers (e.g. /y.js).
      return undefined
    }
    return isHttpUrl(parsed) ? parsed.toString() : undefined
  } catch {
    return undefined
  }
}

function isHttpUrl(url: URL): boolean {
  return url.protocol === 'http:' || url.protocol === 'https:'
}

function cleanText(htmlFragment: string): string {
  const withoutTags = htmlFragment.replace(/<[^>]+>/g, ' ')
  return decodeHtmlEntities(withoutTags).replace(/\s+/g, ' ').trim()
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 1
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new WebError('DuckDuckGo search aborted', 'WEB_ABORTED', { cause: signal.reason })
  }
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  return error instanceof DOMException && error.name === 'AbortError'
}
