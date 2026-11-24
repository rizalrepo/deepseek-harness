---
description: "Opt-in OpenRouter web-search provider for ctx.web: configuration, selection, returned citations, and operational limits."
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-openrouter

English | [中文](README.zh.md)

## Summary

`dsh-web-search-openrouter` adds an opt-in OpenRouter-backed search provider to `ctx.web`. It uses the OpenRouter Responses API and its `openrouter:web_search` server tool, returning assistant text and unique HTTP(S) URL citations. The provider does not change conversation-model routes, and the shipped default remains `deepseek-search-api`. OpenRouter server tools are beta and model inference plus web search can incur charges; do not assume searches are fee-free.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations](#known-limitations)
- [Further Exploration](#further-exploration)

-----

<a id="use-this-package"></a>
## Use this package

Mount this provider alongside the existing web service. It registers the search-provider ID `openrouter-web-search`. Users can select it in the existing Web search provider dropdown, or a composition can set `web.searchProvider: openrouter-web-search`. Merely mounting it does not change the existing `deepseek-search-api` default.

### Configuration

Configure the plugin profile in `cordis.patch.yml`; the example mounts the provider without changing the base composition's search-provider selection:

```yaml
plugins:
  - name: '@deepseek-ai/dsh-web-search-openrouter'
    config:
      apiKeyEnv: OPENROUTER_API_KEY
      model: openrouter/auto
      maxResults: 10
      maxOutputTokens: 2048
```

| Field | Default | Meaning |
|---|---|---|
| `apiKeyEnv` | `OPENROUTER_API_KEY` | Credential reference, resolved through `ctx.credentials` or the launch environment. No literal-key setting is provided. |
| `model` | `openrouter/auto` | OpenRouter model selection for the search request. |
| `maxResults` | `10` | Upper bound requested for search results. |
| `maxOutputTokens` | `2048` | Maximum output tokens for the Responses request. |

Readiness depends on credential presence. When the credential is missing, the provider is not ready and `web_search` is withheld; readiness does not establish that a credential is valid.

### Search results and errors

The provider returns assistant `output_text` as content. Sources are deduplicated `url_citation` annotations with an HTTP(S) URL and an optional title. Missing credentials make the provider unready; cancellation is reported as `WEB_ABORTED`; transport, API, and response failures are reported as `WEB_PROVIDER_ERROR`. Redirects are rejected.

-----

<a id="model-experience"></a>
## Model Experience

The search provider sends the request to OpenRouter's Responses API at `https://openrouter.ai/api/v1/responses`, using the configured model, `tool_choice: 'required'`, and the `openrouter:web_search` server tool. The request bounds `max_total_results` by the configured `maxResults`; output is bounded by `maxOutputTokens`. The conversation model receives the returned assistant text and cited sources through the existing web-search tool path.

OpenRouter describes server tools as beta. Search requests involve model inference and web search, which can incur charges depending on the selected model and service usage.

## Known Limitations

- **Beta server tool:** OpenRouter's server-tool behavior and availability may change.
- **Potential charges:** Model inference and web search may incur costs; this provider does not promise fee-free use.
- **Citation-based sources:** Sources are only the unique HTTP(S) `url_citation` annotations present in the response; the provider does not infer sources from uncited prose.
- **Provider scope:** This package registers a `ctx.web` search provider only. It does not change conversation-model routes or make itself the default.

## Further Exploration

- [Web package map](../README.md) — the web capability family and provider roles.
- [OpenRouter Responses API](https://openrouter.ai/docs/api-reference/responses/create) — official API reference.
- [OpenRouter web search](https://openrouter.ai/docs/guides/features/web-search) — official guide to web search.
