---
description: "ctx.web 的可选 OpenRouter 网页搜索提供方：配置、选择、返回的引用与运行限制。"
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-openrouter

[English](README.md) | 中文

## 概述

`dsh-web-search-openrouter` 为 `ctx.web` 添加可选的 OpenRouter 网页搜索提供方。它使用 OpenRouter Responses API 及其 `openrouter:web_search` 服务端工具，并返回助手文本与唯一的 HTTP(S) URL 引用。该提供方不会更改对话模型路由，已发布的默认项仍为 `deepseek-search-api`。OpenRouter 服务端工具处于 beta 阶段，模型推理与网页搜索可能产生费用；不能假设搜索免费。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制](#known-limitations)
- [进一步探索](#further-exploration)

-----

<a id="use-this-package"></a>
## 使用本包

将本提供方与现有 web 服务一同挂载。它注册的搜索提供方 ID 为 `openrouter-web-search`。用户可在现有的 Web search provider 下拉菜单中选择它，也可在组合配置中设置 `web.searchProvider: openrouter-web-search`。仅仅挂载它不会改变现有的 `deepseek-search-api` 默认项。

### 配置

在 `cordis.patch.yml` 中配置插件 profile；以下示例挂载提供方，但不更改基础组合的搜索提供方选择：

```yaml
plugins:
  - name: '@deepseek-ai/dsh-web-search-openrouter'
    config:
      apiKeyEnv: OPENROUTER_API_KEY
      model: openrouter/auto
      maxResults: 10
      maxOutputTokens: 2048
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `apiKeyEnv` | `OPENROUTER_API_KEY` | 凭据引用，通过 `ctx.credentials` 或启动环境解析。不提供字面量密钥设置。 |
| `model` | `openrouter/auto` | 搜索请求所用的 OpenRouter 模型选择。 |
| `maxResults` | `10` | 请求搜索结果的上限。 |
| `maxOutputTokens` | `2048` | Responses 请求的最大输出 token 数。 |

就绪状态取决于凭据是否存在。缺少凭据时提供方未就绪，并会隐藏 `web_search`；就绪检查不验证凭据是否有效。

### 搜索结果与错误

提供方将助手的 `output_text` 作为内容返回。来源是去重后的 `url_citation` 注解，包含 HTTP(S) URL 和可选标题。缺少凭据会使提供方未就绪；取消报告为 `WEB_ABORTED`；传输、API 与响应故障报告为 `WEB_PROVIDER_ERROR`。重定向会被拒绝。

-----

<a id="model-experience"></a>
## 模型体验

搜索提供方向 OpenRouter Responses API `https://openrouter.ai/api/v1/responses` 发送请求，使用已配置模型、`tool_choice: 'required'` 和 `openrouter:web_search` 服务端工具。请求中的 `max_total_results` 受配置的 `maxResults` 限制；输出受 `maxOutputTokens` 限制。对话模型通过现有网页搜索工具路径接收返回的助手文本和引用来源。

OpenRouter 将服务端工具标为 beta。搜索请求涉及模型推理和网页搜索，具体取决于所选模型与服务使用情况，可能产生费用。

## 已知限制

- **服务端工具处于 beta 阶段：** OpenRouter 的服务端工具行为与可用性可能变化。
- **可能产生费用：** 模型推理与网页搜索可能收费；本提供方不承诺免费使用。
- **来源基于引用注解：** 来源仅包括响应中唯一的 HTTP(S) `url_citation` 注解；提供方不会从未引用的文本推断来源。
- **提供方职责范围：** 本包仅注册 `ctx.web` 搜索提供方，不会更改对话模型路由，也不会将自身设为默认项。

## 进一步探索

- [web 包映射](../README.zh.md)——web 能力家族与提供方职责。
- [OpenRouter Responses API](https://openrouter.ai/docs/api-reference/responses/create)——官方 API 参考。
- [OpenRouter 网页搜索](https://openrouter.ai/docs/guides/features/web-search)——官方网页搜索指南。
