/** Register the HTTP(S) Browser tab type in the right Sidebar. */
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import { BrowserBody, type BrowserBodyProps } from './view/BrowserBody.tsx'
import { BrowserTitle } from './view/BrowserTitle.tsx'
import { createBrowserControllers } from './browser/BrowserController.ts'
import type { BrowserInjected } from './browser/BrowserController.ts'
import { createIframePage } from './pages.ts'
import { createElectronPage } from './electron/pages.ts'
import type { DesktopBrowserBridge } from '../types.ts'
import { browserWorkspace } from './electron/workspace.ts'
import type { BrowserPageFactory } from './browser/BrowserPage.ts'
import { BROWSER_ID, browserDefinition } from './definition.tsx'
import { en, ja, es, fr, de, ru, pt, zh } from './locales.ts'
import { createBrowserStore } from './browser/store.ts'

export type { BrowserBodyProps } from './view/BrowserBody.tsx'
export type { BrowserControllerState, BrowserInjected, BrowserMountRequest } from './browser/BrowserController.ts'
export type { BrowserFrame, BrowserFrameState, BrowserLoadError, BrowserSandboxControl } from './browser/BrowserFrame.ts'
export type { BrowserPage, BrowserPageFactory, BrowserPageOptions } from './browser/BrowserPage.ts'
export type { BrowserPresentation } from './view/BrowserPresentation.ts'
export type { BrowserFailure, BrowserHistoryEntry, BrowserNavigationStatus, BrowserTabState } from './browser/BrowserPersistence.ts'
export type { SidebarBrowserKey } from './locales.ts'
export type { BrowserState } from './browser/store.ts'
export type { BrowserAddressFailure, BrowserAddressResult, BrowserTarget } from './browser/url.ts'

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap {
    /** Optional initial Browser URL. */
    browser: { readonly url?: string }
  }
}

/** Required Browser services. */
export const inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs']

/** Register the Browser type, localized guide entry, body, and title. */
export function apply(ctx: Context): void {
  const namespace = 'sidebarBrowser'
  const t = ctx.locale.bind(namespace)
  ctx.inject(['shortcuts'], (ctx) => {
    ctx.effect(() => ctx.shortcuts.register({
      id: 'browser.new' as ShortcutCommandId, label: () => t('guide.title'), aliases: ['browser', 'new browser tab'],
      defaults: {
        'desktop:macos': { code: 'KeyT', modifiers: ['primary'] },
        'desktop:windows': { code: 'KeyT', modifiers: ['primary'] },
        'desktop:linux': { code: 'KeyT', modifiers: ['primary'] },
        'web:macos': { code: 'KeyT', modifiers: ['primary', 'alt'] },
        'web:windows': { code: 'KeyT', modifiers: ['primary', 'alt'] },
      },
      // Each tab plugin owns its command's availability, localized refusal, and tab kind.
      /* jscpd:ignore-start */
      regions: ['page', 'editable', 'terminal'], modals: [],
      resolve: ({ target: element }) => {
        const target = ctx.sidebarRight.commandTarget(element)
        if (target === undefined) return { status: 'blocked', reason: t('shortcut.noSession') }
        return { status: 'handled', run: () => { ctx.sidebarRight.openTabFromTarget('browser', target) } }
      },
      /* jscpd:ignore-end */
    }), 'ui-sidebar-browser: shortcut')
  })
  const store = createBrowserStore()
  const openTabs = ctx.sidebarRight.openTabs
  interface DraftItem {
    readonly id: string
  }
  interface ShellTarget {
    setDraft(text: string): void
    addFiles?(references: readonly unknown[], ids: readonly string[]): boolean
    addAttachments?(ids: readonly string[]): boolean
    submit(mode?: string, source?: string): void
    readonly snapshot?: { readonly draft: string }
  }
  interface ConversationTarget {
    createDrafts?(sessionId: string, files: readonly File[], uploadImages: boolean): readonly DraftItem[]
    readonly input?: {
      shell(id: string): ShellTarget
    }
  }

  let activeConversation: ConversationTarget | undefined
  ctx.inject(['conversation'], (convScope) => {
    activeConversation = convScope.get('conversation') as ConversationTarget | undefined
  })
  let activeSessions: ISessions | undefined
  ctx.inject(['sessions'], (sessScope) => {
    activeSessions = sessScope.get('sessions')
  })
  const carrier = (globalThis as typeof globalThis & {
    dshDesktop?: { readonly protocolVersion: number; readonly browser?: DesktopBrowserBridge }
  }).dshDesktop
  const desktop = carrier?.protocolVersion === 1 ? carrier.browser : undefined
  ctx.effect(() => ctx.locale.register(namespace, { zh, en, ja, es, fr, de, ru, pt }), 'ui-sidebar-browser.copy')
  ctx.effect(() => ctx.sidebarRightTabs.register({ ...browserDefinition(t), keepMounted: desktop !== undefined }), 'ui-sidebar-browser.type')
  const installFrames = (scope: Context, factory: (sessionId: BrowserBodyProps['sessionId']) => BrowserPageFactory): void => {
    const controllers = new Map<BrowserBodyProps['sessionId'], BrowserInjected>()
    scope.effect(() => async () => {
      const pending = [...controllers.values()].map(controller => controller.dispose())
      controllers.clear()
      await Promise.all(pending)
    }, 'ui-sidebar-browser.frames')
    scope.effect(() => scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
      name: 'sidebar.right.pane.tab', key: BROWSER_ID, locale: namespace, store,
      inject: (sessionId, actions) => {
        const existing = controllers.get(sessionId)
        if (existing !== undefined) {
          existing.rebind(actions)
          return existing
        }
        const sendToChat = async (prompt: string, imageBlob?: Blob, submit = true): Promise<boolean> => {
          const sessions = activeSessions
            ?? ctx.get('sessions')
            ?? scope.get('sessions')
          const binding = sessionId && sessions ? sessions.binding(sessionId) : undefined

          if (binding?.session) {
            try {
              const parts: Array<
                | { readonly type: 'text'; readonly text: string }
                | { readonly type: 'image'; readonly mediaType: 'image/png'; readonly data: string; readonly name?: string }
              > = [
                { type: 'text', text: prompt },
              ]
              if (imageBlob) {
                const { promise, resolve, reject } = Promise.withResolvers<string>()
                const reader = new FileReader()
                reader.onload = () => {
                  const res = typeof reader.result === 'string' ? reader.result : ''
                  resolve(res.slice(res.indexOf(',') + 1))
                }
                reader.onerror = () => { reject(reader.error ?? new Error('read failed')) }
                reader.readAsDataURL(imageBlob)
                const base64Data = await promise
                if (base64Data) {
                  parts.push({
                    type: 'image',
                    mediaType: 'image/png',
                    data: base64Data,
                    name: 'design-screenshot.png',
                  })
                }
              }
              if (submit) {
                void binding.session.prompt(parts, 'queue')
              }
              return true
            } catch (error) {
              console.warn('ui-sidebar-browser: sendToChat via session.prompt failed', error)
            }
          }

          try {
            const conversation: ConversationTarget | undefined = activeConversation
              ?? (ctx.get('conversation') as ConversationTarget | undefined)
              ?? (scope.get('conversation') as ConversationTarget | undefined)
            if (conversation?.input && sessionId) {
              const shell = conversation.input.shell(sessionId)
              shell.setDraft(prompt)
              if (submit) {
                shell.submit('queue', 'click')
              }
              return true
            }
          } catch (error) {
            console.warn('ui-sidebar-browser: sendToChat via shell failed', error)
          }

          return false
        }
        const controller = createBrowserControllers(actions, factory(sessionId), tabId =>
          openTabs.getSnapshot().some(tab => tab.sessionId === sessionId && tab.tabId === tabId), sendToChat)
        controllers.set(sessionId, controller)
        return controller
      },
    }, BrowserBody)), 'ui-sidebar-browser.body')
  }
  if (desktop === undefined) installFrames(ctx, () => createIframePage)
  else ctx.inject(['workspaces'], (scope) => {
    installFrames(scope, sessionId => options => createElectronPage(options, desktop,
      signal => browserWorkspace(scope.workspaces.list, sessionId, signal)))
  })
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title', key: BROWSER_ID, store,
  }, BrowserTitle)), 'ui-sidebar-browser.title')
}
