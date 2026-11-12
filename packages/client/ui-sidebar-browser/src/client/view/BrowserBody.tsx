/** Common browser chrome; a presentation adapter attaches the page inside its content container. */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  Button,
  IconChevronLeftOutlineRegular,
  IconChevronRightOutlineRegular,
  IconInspectOutlineRegular,
  IconLinkOutlineRegular,
  IconRefreshOutlineRegular, Tooltip,
  IconRightUpOutlineRegular,
  SHIELD_OUTLINE_PATH,
  ICON_REGULAR_STROKE,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { BrowserInjected } from '../browser/BrowserController.ts'
import { emptyBrowserFrame } from '../browser/BrowserFrame.ts'
import { currentBrowserTarget } from '../browser/BrowserPersistence.ts'
import type { BrowserStore } from '../browser/store.ts'
import css from './Browser.module.css'

const EMPTY_FRAME = emptyBrowserFrame()

const INSPECT_CLEANUP_SCRIPT = `
(() => {
  try {
    if (window.__dshInspectCleanup) window.__dshInspectCleanup();
    const old = document.getElementById('__dsh_inspect_overlay__');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (document.body) document.body.style.cursor = '';
  } catch {}
})();
`

const INSPECT_SCRIPT = `
(() => {
  try {
    if (window.__dshInspectCleanup) window.__dshInspectCleanup();

    const OVERLAY_ID = '__dsh_inspect_overlay__';
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      overlay.style.cssText = 'position:fixed;display:none;pointer-events:none;z-index:2147483647;border:2px solid #3b82f6;background:rgba(59,130,246,0.12);box-sizing:border-box;border-radius:2px;';
      const badge = document.createElement('div');
      badge.style.cssText = 'position:absolute;top:-24px;left:-2px;background:#0f172a;color:#f8fafc;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:1px solid #3b82f6;pointer-events:none;';
      overlay.appendChild(badge);
      document.documentElement.appendChild(overlay);
    }

    const badge = overlay.firstElementChild;

    function getSelector(el) {
      if (!el || el === document.body || el === document.documentElement) return el ? el.tagName.toLowerCase() : '';
      const parts = [];
      let curr = el;
      while (curr && curr !== document.documentElement && parts.length < 4) {
        let part = curr.tagName.toLowerCase();
        if (curr.id) {
          part += '#' + curr.id;
          parts.unshift(part);
          break;
        }
        if (curr.classList && curr.classList.length > 0) {
          const cls = Array.from(curr.classList).filter(c => !c.startsWith('__dsh')).slice(0, 2).join('.');
          if (cls) part += '.' + cls;
        }
        parts.unshift(part);
        curr = curr.parentElement;
      }
      return parts.join(' > ');
    }

    function onMouseMove(e) {
      const el = e.target;
      if (!el || el === overlay || overlay.contains(el)) {
        overlay.style.display = 'none';
        return;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        overlay.style.display = 'none';
        return;
      }
      overlay.style.display = 'block';
      overlay.style.top = rect.top + 'px';
      overlay.style.left = rect.left + 'px';
      overlay.style.width = rect.width + 'px';
      overlay.style.height = rect.height + 'px';

      const tag = el.tagName.toLowerCase();
      const cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
      const id = el.id ? '#' + el.id : '';
      const dims = Math.round(rect.width) + ' × ' + Math.round(rect.height);
      badge.textContent = tag + id + cls + ' (' + dims + ')';
      badge.style.top = rect.top < 26 ? '2px' : '-24px';
    }

    function onClick(e) {
      if (e.target === overlay || overlay.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const target = e.target;
      const selector = getSelector(target);
      const tag = target.tagName.toLowerCase();
      const text = (target.textContent || '').trim().slice(0, 200);

      const clone = target.cloneNode(false);
      if (text) clone.textContent = text.length > 80 ? text.slice(0, 77) + '...' : text;
      const outerHtml = clone.outerHTML || ('<' + tag + '>');

      console.log('__DSH_INSPECT__:' + JSON.stringify({
        tag,
        selector,
        text,
        outerHtml,
        location: window.location.href,
      }));

      cleanup();
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        console.log('__DSH_INSPECT_CANCEL__');
        cleanup();
      }
    }

    function cleanup() {
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKeyDown, true);
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (document.body) document.body.style.cursor = '';
      window.__dshInspectCleanup = null;
    }

    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.__dshInspectCleanup = cleanup;
    if (document.body) document.body.style.cursor = 'crosshair';
  } catch {}
})();
`

function SandboxPolicyIcon({ sandboxed }: { readonly sandboxed: boolean }): ReactNode {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d={SHIELD_OUTLINE_PATH} stroke="currentColor" strokeWidth={ICON_REGULAR_STROKE} strokeLinejoin="round" />
      {sandboxed
        ? <path d="M12.1654 5.7552L8.9447 9.41475C8.73044 9.65816 8.53628 9.8804 8.35774 10.0423C8.1713 10.2114 7.94235 10.3717 7.64016 10.4254C7.48207 10.4535 7.32 10.4552 7.16151 10.4294C6.85843 10.3801 6.62728 10.2223 6.43836 10.0559C6.25752 9.89653 6.06037 9.67732 5.84264 9.43705L4.72925 8.20897L5.63557 7.38707L6.74897 8.61594C6.98603 8.87755 7.12974 9.03533 7.24673 9.13839C7.31033 9.19443 7.34485 9.21476 7.35823 9.22122C7.38068 9.22484 7.40352 9.22515 7.42593 9.22122C7.40522 9.22502 7.42893 9.23294 7.53583 9.136C7.65132 9.03126 7.79316 8.87139 8.02643 8.60638L11.2479 4.94763L12.1654 5.7552Z" fill="currentColor" />
        : <path d="M10.6074 4.40278L8.00975 6.99973L10.6074 9.59739L9.59736 10.6074L6.9997 8.00978L4.40274 10.6074L3.3927 9.59739L5.98966 6.99973L3.3927 4.40278L4.40274 3.39273L6.9997 5.98969L9.59736 3.39273L10.6074 4.40278Z" fill="currentColor" transform="translate(1.2 0.8)" />}
    </svg>
  )
}

/** Browser body props assembled by the tab seat. */
export type BrowserBodyProps = PropsRuntime<'sidebar.right.pane.tab'>
  & PropsStore<BrowserStore>
  & PropsLocale<'sidebarBrowser'>
  & InjectFace<BrowserInjected>

function useBrowserDraft(url: string | undefined, revision: number): readonly [string, (value: string) => void] {
  const [edit, setEdit] = useState<{ readonly revision: number; readonly value: string }>()
  return [edit?.revision === revision ? edit.value : url ?? '',
    (value) => { setEdit({ revision, value }) }]
}

interface ElectronWebviewInspectable extends HTMLElement {
  executeJavaScript(code: string): Promise<unknown>
}

function isInspectableWebview(element: Element | null): element is ElectronWebviewInspectable {
  return element !== null && 'executeJavaScript' in element && typeof element.executeJavaScript === 'function'
}

interface InspectPayload {
  readonly tag: string
  readonly selector: string
  readonly text?: string
  readonly outerHtml: string
  readonly location?: string
}

function isInspectPayload(data: unknown): data is InspectPayload {
  return typeof data === 'object' && data !== null
    && 'selector' in data && typeof data.selector === 'string'
    && 'outerHtml' in data && typeof data.outerHtml === 'string'
}

/** Render provider-neutral navigation state and optional controls. */
export function BrowserBody(props: BrowserBodyProps): ReactNode {
  const { mount, loadUrl, restore, goBack, goForward, reload, setSandbox, useBrowserState, useStore, useTabInfo, t } = props
  const { tab } = useTabInfo()
  useEffect(() => tab.actions.bindCommands({ refresh: () => { reload(tab.id) } }), [tab.actions, tab.id, reload])
  const saved = useStore(state => state.byTab[tab.id])
  const initial = useRef(saved)
  const initialUrl = useRef(tab.navigation.params?.url)
  const viewportId = useId()
  const [mountEpoch, setMountEpoch] = useState(0)
  const state = useBrowserState(tab.id)
  const frame = state?.frame ?? EMPTY_FRAME
  const restoreTarget = state === undefined ? currentBrowserTarget(initial.current) : state.restoreTarget
  const target = frame.target ?? restoreTarget
  const [draft, setDraft] = useBrowserDraft(target?.url ?? initialUrl.current, state?.addressRevision ?? 0)
  const [inspecting, setInspecting] = useState(false)
  const [toast, setToast] = useState<string>()

  useEffect(() => {
    const host = document.getElementById(viewportId)
    const element = host?.querySelector('webview') ?? null
    if (!isInspectableWebview(element)) return
    const webview = element

    if (!inspecting) {
      try { void webview.executeJavaScript(INSPECT_CLEANUP_SCRIPT) } catch {}
      return
    }

    const onConsoleMessage = (event: Event): void => {
      const msg = 'message' in event && typeof event.message === 'string' ? event.message : ''
      if (msg.startsWith('__DSH_INSPECT__:')) {
        try {
          const raw: unknown = JSON.parse(msg.slice(16))
          if (isInspectPayload(raw)) {
            setInspecting(false)
            const prompt = [
              'Please inspect and modify this element:',
              `- **Selector**: \`${raw.selector}\``,
              `- **Element**: \`${raw.outerHtml}\``,
              raw.text ? `- **Text**: "${raw.text}"` : '',
              raw.location ? `- **Page URL**: ${raw.location}` : '',
            ].filter(Boolean).join('\n')

            void navigator.clipboard.writeText(prompt).then(() => {
              setToast(t('inspect.copied'))
            }).catch(() => {
              setToast(t('inspect.copied'))
            })
          }
        } catch {}
      } else if (msg === '__DSH_INSPECT_CANCEL__') {
        setInspecting(false)
      }
    }

    const onNavigated = (): void => {
      setInspecting(false)
    }

    webview.addEventListener('console-message', onConsoleMessage)
    webview.addEventListener('did-navigate', onNavigated)
    try {
      void webview.executeJavaScript(INSPECT_SCRIPT)
    } catch {}

    return () => {
      webview.removeEventListener('console-message', onConsoleMessage)
      webview.removeEventListener('did-navigate', onNavigated)
      try { void webview.executeJavaScript(INSPECT_CLEANUP_SCRIPT) } catch {}
    }
  }, [inspecting, viewportId, mountEpoch, t])

  useEffect(() => {
    if (toast === undefined) return
    const timer = setTimeout(() => { setToast(undefined) }, 3200)
    return () => { clearTimeout(timer) }
  }, [toast])

  useLayoutEffect(() => {
    const hide = mount({
      tabId: tab.id, signal: tab.signal, viewportId, applicationOrigin: window.location.origin,
      initial: initial.current, initialUrl: initialUrl.current,
      openTab: (url) => { tab.actions.openTab('browser', { params: { url }, revealIfOpened: false }) },
    })
    setMountEpoch(value => value + 1)
    return hide
  }, [mount, tab.id, tab.signal, tab.actions, viewportId, props.actions])

  const unknown = frame.address === 'unknown'
  const externalUrl = unknown ? undefined : target?.url
  const sandboxed = frame.sandboxEnabled
  const failure = state?.addressFailure
  const error = frame.error
  const submit = (event: FormEvent): void => { event.preventDefault(); loadUrl(tab.id, draft) }

  return (
    <div className={css.root}>
      <form className={css.toolbar} onSubmit={submit}>
        <button type="button" className={css.tool} aria-label={t('back')} title={t('back')} disabled={!frame.canGoBack} onClick={() => { goBack(tab.id) }}><IconChevronLeftOutlineRegular /></button>
        <button type="button" className={css.tool} aria-label={t('forward')} title={t('forward')} disabled={!frame.canGoForward} onClick={() => { goForward(tab.id) }}><IconChevronRightOutlineRegular /></button>
        <Tooltip label={t('reload')} shortcutKeys={tab.refreshShortcut?.keys} side="bottom" delayMs={500}>
          <button type="button" className={css.tool} aria-label={t('reload')} aria-keyshortcuts={tab.refreshShortcut?.aria} disabled={target === undefined || mountEpoch === 0} onClick={() => { reload(tab.id) }}><IconRefreshOutlineRegular /></button>
        </Tooltip>
        <div className={css.addressBox}>
          <input
            className={[css.address, unknown ? css.addressUnknown : ''].join(' ')}
            value={draft}
            aria-label={t('address.placeholder')}
            placeholder={t('address.placeholder')}
            spellCheck={false}
            onChange={(event) => { setDraft(event.currentTarget.value) }}
          />
          {unknown && <span className={css.addressChanged}>{t('address.changed')}</span>}
          <button type="submit" className={[css.tool, css.addressGo].join(' ')} aria-label={t('go')} title={t('go')}><IconLinkOutlineRegular /></button>
        </div>
        <button type="button" className={css.tool} aria-label={t('external')} title={t('external')} disabled={externalUrl === undefined}
          onClick={externalUrl === undefined ? undefined : () => { window.open(externalUrl, '_blank', 'noopener,noreferrer') }}
        ><IconRightUpOutlineRegular size={14} /></button>
        <Tooltip label={t(inspecting ? 'inspect.disable' : 'inspect.enable')} side="bottom" delayMs={500}>
          <button
            type="button"
            className={[css.tool, inspecting ? css.inspectActive : ''].join(' ')}
            aria-label={t(inspecting ? 'inspect.disable' : 'inspect.enable')}
            title={t(inspecting ? 'inspect.disable' : 'inspect.enable')}
            aria-pressed={inspecting}
            disabled={target === undefined || mountEpoch === 0}
            onClick={() => { setInspecting(prev => !prev) }}
          >
            <IconInspectOutlineRegular size={14} />
          </button>
        </Tooltip>
        {sandboxed !== undefined && <button
          type="button"
          className={[css.tool, sandboxed ? '' : css.sandboxOff].join(' ')}
          aria-label={t(sandboxed ? 'sandbox.disable' : 'sandbox.enable')}
          title={t(sandboxed ? 'sandbox.disable' : 'sandbox.enable')}
          aria-pressed={!sandboxed}
          onClick={() => { setSandbox(tab.id, !sandboxed) }}
        ><SandboxPolicyIcon sandboxed={sandboxed} /></button>}
      </form>
      {sandboxed === false && <div className={css.sandboxWarning} role="status">{t('sandbox.warning')}</div>}
      {error !== undefined && <div className={css.failure} role="status">{error.code !== undefined && error.description !== undefined
        ? t('load.failed.detail', { code: String(error.code), description: error.description })
        : t('load.failed')}</div>}
      {failure !== undefined && <div className={css.failure} role="alert">{t(`error.${failure}`)}</div>}
      {toast !== undefined && (
        <div className={css.toast} role="status">
          {toast}
        </div>
      )}
      <div className={css.content} aria-busy={frame.loading}>
        <div id={viewportId} className={css.viewport} aria-label={t('type.label')} />
        {restoreTarget !== undefined && <section className={css.restore} aria-label={t('restore.previous')}>
          <p className={css.restoreLabel}>{t('restore.previous')}</p>
          <p className={css.restoreTitle}>{restoreTarget.title}</p>
          <p className={css.restoreUrl}>{restoreTarget.url}</p>
          <Button variant="primary" size="sm" disabled={mountEpoch === 0} onClick={() => { restore(tab.id) }}>
            {t('restore.action')}
          </Button>
        </section>}
        {restoreTarget === undefined && (target === undefined || frame.loading) && error === undefined && <div className={css.placeholder}>
          <div className={css.start}>{t(target === undefined ? 'start' : 'loading')}</div>
        </div>}
      </div>
      {unknown && <p className={css.limit}>{t('address.unknown')}</p>}
    </div>
  )
}
