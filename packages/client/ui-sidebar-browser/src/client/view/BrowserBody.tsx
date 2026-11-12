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
    if (window.__dshDesignCleanup) window.__dshDesignCleanup();
    const cur = document.getElementById('__dsh_design_root__');
    if (cur && cur.parentNode) cur.parentNode.removeChild(cur);
    if (document.body) document.body.style.cursor = '';
  } catch {}
})();
`

const INSPECT_SCRIPT = `
(() => {
  try {
    if (window.__dshDesignCleanup) window.__dshDesignCleanup();

    const ROOT_ID = '__dsh_design_root__';
    const oldRoot = document.getElementById(ROOT_ID);
    if (oldRoot && oldRoot.parentNode) oldRoot.parentNode.removeChild(oldRoot);

    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;user-select:none;font-family:system-ui,-apple-system,sans-serif;';

    const snipCanvas = document.createElement('canvas');
    snipCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    root.appendChild(snipCanvas);

    const doodleCanvas = document.createElement('canvas');
    doodleCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    root.appendChild(doodleCanvas);

    function resizeCanvases() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (snipCanvas.width !== w || snipCanvas.height !== h) {
        snipCanvas.width = w;
        snipCanvas.height = h;
      }
      if (doodleCanvas.width !== w || doodleCanvas.height !== h) {
        const temp = document.createElement('canvas');
        temp.width = doodleCanvas.width;
        temp.height = doodleCanvas.height;
        const tctx = temp.getContext('2d');
        if (tctx && doodleCanvas.width > 0) tctx.drawImage(doodleCanvas, 0, 0);
        doodleCanvas.width = w;
        doodleCanvas.height = h;
        const dctx = doodleCanvas.getContext('2d');
        if (dctx && temp.width > 0) dctx.drawImage(temp, 0, 0);
      }
    }
    resizeCanvases();

    const badge = document.createElement('div');
    badge.style.cssText = 'position:absolute;display:none;background:#0f172a;color:#f8fafc;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.4);border:1px solid #3b82f6;pointer-events:none;z-index:10;';
    root.appendChild(badge);

    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:4px;padding:4px 6px;background:rgba(15,23,42,0.92);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.18);border-radius:9999px;box-shadow:0 4px 18px rgba(0,0,0,0.35);color:#f8fafc;font-size:12px;font-weight:500;pointer-events:auto;z-index:20;';

    const btnStyle = 'background:transparent;border:0;color:#cbd5e1;padding:4px 10px;border-radius:9999px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;font-weight:500;transition:all 0.1s;';
    const btnActiveStyle = 'background:#3b82f6;color:#ffffff;';

    const btnSnip = document.createElement('button');
    btnSnip.type = 'button';
    btnSnip.textContent = '📐 Snip / Element';
    btnSnip.style.cssText = btnStyle + btnActiveStyle;

    const btnDraw = document.createElement('button');
    btnDraw.type = 'button';
    btnDraw.textContent = '✏️ Draw / Coret';
    btnDraw.style.cssText = btnStyle;

    const btnClear = document.createElement('button');
    btnClear.type = 'button';
    btnClear.textContent = '↺ Clear';
    btnClear.style.cssText = btnStyle;

    const btnDone = document.createElement('button');
    btnDone.type = 'button';
    btnDone.textContent = '✔ Done (Enter)';
    btnDone.style.cssText = btnStyle + 'background:#10b981;color:#fff;font-weight:600;margin-left:4px;';

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.textContent = '✕';
    btnCancel.title = 'Cancel (Esc)';
    btnCancel.style.cssText = btnStyle + 'padding:4px 8px;';

    toolbar.appendChild(btnSnip);
    toolbar.appendChild(btnDraw);
    toolbar.appendChild(btnClear);
    toolbar.appendChild(btnDone);
    toolbar.appendChild(btnCancel);
    root.appendChild(toolbar);

    document.documentElement.appendChild(root);

    let mode = 'snip';
    let isMouseDown = false;
    let startX = 0;
    let startY = 0;
    let activeRect = null;
    let hoveredElement = null;
    const doodlePoints = [];
    let hasDoodles = false;

    function setMode(newMode) {
      mode = newMode;
      if (mode === 'snip') {
        btnSnip.style.cssText = btnStyle + btnActiveStyle;
        btnDraw.style.cssText = btnStyle;
        document.body.style.cursor = 'crosshair';
      } else {
        btnSnip.style.cssText = btnStyle;
        btnDraw.style.cssText = btnStyle + btnActiveStyle;
        document.body.style.cursor = 'crosshair';
        badge.style.display = 'none';
        clearSnipCanvas();
      }
    }

    btnSnip.addEventListener('click', (e) => { e.stopPropagation(); setMode('snip'); });
    btnDraw.addEventListener('click', (e) => { e.stopPropagation(); setMode('draw'); });
    btnClear.addEventListener('click', (e) => {
      e.stopPropagation();
      clearSnipCanvas();
      clearDoodleCanvas();
      activeRect = null;
      badge.style.display = 'none';
    });
    btnDone.addEventListener('click', (e) => { e.stopPropagation(); finishCapture(); });
    btnCancel.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('__DSH_INSPECT_CANCEL__');
      cleanup();
    });

    function clearSnipCanvas() {
      const sctx = snipCanvas.getContext('2d');
      if (sctx) sctx.clearRect(0, 0, snipCanvas.width, snipCanvas.height);
    }

    function clearDoodleCanvas() {
      const dctx = doodleCanvas.getContext('2d');
      if (dctx) dctx.clearRect(0, 0, doodleCanvas.width, doodleCanvas.height);
      doodlePoints.length = 0;
      hasDoodles = false;
    }

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

    function renderHoverBox(rect, label) {
      const sctx = snipCanvas.getContext('2d');
      if (!sctx) return;
      sctx.clearRect(0, 0, snipCanvas.width, snipCanvas.height);
      sctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
      sctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      sctx.strokeStyle = '#3b82f6';
      sctx.lineWidth = 2;
      sctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

      badge.style.display = 'block';
      badge.textContent = label;
      badge.style.left = Math.max(8, rect.x) + 'px';
      badge.style.top = (rect.y < 28 ? rect.y + rect.height + 6 : rect.y - 24) + 'px';
    }

    function renderSnipBox(rect) {
      const sctx = snipCanvas.getContext('2d');
      if (!sctx) return;
      sctx.clearRect(0, 0, snipCanvas.width, snipCanvas.height);
      sctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      sctx.fillRect(0, 0, snipCanvas.width, snipCanvas.height);
      sctx.clearRect(rect.x, rect.y, rect.width, rect.height);

      sctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
      sctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      sctx.strokeStyle = '#3b82f6';
      sctx.lineWidth = 2;
      sctx.setLineDash([4, 4]);
      sctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      sctx.setLineDash([]);

      badge.style.display = 'block';
      badge.textContent = Math.round(rect.width) + ' × ' + Math.round(rect.height) + ' px';
      badge.style.left = Math.max(8, rect.x) + 'px';
      badge.style.top = (rect.y < 28 ? rect.y + rect.height + 6 : rect.y - 24) + 'px';
    }

    function onMouseMove(e) {
      resizeCanvases();
      if (toolbar.contains(e.target)) return;

      if (!isMouseDown) {
        if (mode === 'snip' && !activeRect) {
          const el = e.target;
          if (!el || el === document.body || el === document.documentElement || root.contains(el)) {
            badge.style.display = 'none';
            clearSnipCanvas();
            return;
          }
          hoveredElement = el;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          const tag = el.tagName.toLowerCase();
          const cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
          const id = el.id ? '#' + el.id : '';
          const dims = Math.round(rect.width) + ' × ' + Math.round(rect.height);
          renderHoverBox({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }, tag + id + cls + ' (' + dims + ')');
        }
        return;
      }

      if (mode === 'snip') {
        const curX = e.clientX;
        const curY = e.clientY;
        const x = Math.min(startX, curX);
        const y = Math.min(startY, curY);
        const w = Math.abs(curX - startX);
        const h = Math.abs(curY - startY);
        activeRect = { x, y, width: w, height: h };
        renderSnipBox(activeRect);
      } else if (mode === 'draw') {
        const dctx = doodleCanvas.getContext('2d');
        if (dctx) {
          dctx.strokeStyle = '#ef4444';
          dctx.lineWidth = 3;
          dctx.lineCap = 'round';
          dctx.lineJoin = 'round';
          dctx.lineTo(e.clientX, e.clientY);
          dctx.stroke();
          doodlePoints.push({ x: e.clientX, y: e.clientY });
          hasDoodles = true;
        }
      }
    }

    function onMouseDown(e) {
      if (toolbar.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      isMouseDown = true;
      startX = e.clientX;
      startY = e.clientY;

      if (mode === 'draw') {
        const dctx = doodleCanvas.getContext('2d');
        if (dctx) {
          dctx.beginPath();
          dctx.moveTo(startX, startY);
          doodlePoints.push({ x: startX, y: startY });
        }
      }
    }

    function onMouseUp(e) {
      if (toolbar.contains(e.target)) return;
      if (!isMouseDown) return;
      isMouseDown = false;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (mode === 'snip') {
        if (dist < 8) {
          activeRect = null;
          const target = e.target;
          if (target && target !== document.body && target !== document.documentElement && !root.contains(target)) {
            const rect = target.getBoundingClientRect();
            captureSingleElement(target, rect);
          }
        }
      }
    }

    function captureSingleElement(el, rect) {
      const selector = getSelector(el);
      const tag = el.tagName.toLowerCase();
      const text = (el.textContent || '').trim().slice(0, 200);
      const clone = el.cloneNode(false);
      if (text) clone.textContent = text.length > 80 ? text.slice(0, 77) + '...' : text;
      const outerHtml = clone.outerHTML || ('<' + tag + '>');

      sendPayload({
        mode: 'element',
        rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        selector,
        outerHtml,
        text,
        location: window.location.href,
        doodleDataUrl: hasDoodles ? doodleCanvas.toDataURL('image/png') : undefined,
      });
      cleanup();
    }

    function finishCapture() {
      let rect = activeRect;
      if (!rect && hasDoodles && doodlePoints.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pt of doodlePoints) {
          if (pt.x < minX) minX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y > maxY) maxY = pt.y;
        }
        minX = Math.max(0, minX - 24);
        minY = Math.max(0, minY - 24);
        maxX = Math.min(window.innerWidth, maxX + 24);
        maxY = Math.min(window.innerHeight, maxY + 24);
        rect = { x: minX, y: minY, width: Math.max(50, maxX - minX), height: Math.max(50, maxY - minY) };
      }

      if (!rect && hoveredElement) {
        const r = hoveredElement.getBoundingClientRect();
        captureSingleElement(hoveredElement, r);
        return;
      }

      if (!rect) {
        rect = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
      }

      const elementsFound = [];
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const centerEl = document.elementFromPoint(cx, cy);
      if (centerEl && !root.contains(centerEl)) {
        elementsFound.push(getSelector(centerEl));
      }

      sendPayload({
        mode: hasDoodles ? 'draw' : 'snip',
        rect,
        elements: elementsFound,
        location: window.location.href,
        doodleDataUrl: hasDoodles ? doodleCanvas.toDataURL('image/png') : undefined,
      });
      cleanup();
    }

    function sendPayload(data) {
      console.log('__DSH_INSPECT__:' + JSON.stringify(data));
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        console.log('__DSH_INSPECT_CANCEL__');
        cleanup();
      } else if (e.key === 'Enter') {
        finishCapture();
      } else if (e.key === 'd' || e.key === 'D') {
        setMode('draw');
      } else if (e.key === 's' || e.key === 'S') {
        setMode('snip');
      }
    }

    function cleanup() {
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('mouseup', onMouseUp, true);
      window.removeEventListener('keydown', onKeyDown, true);
      const cur = document.getElementById(ROOT_ID);
      if (cur && cur.parentNode) cur.parentNode.removeChild(cur);
      if (document.body) document.body.style.cursor = '';
      window.__dshDesignCleanup = null;
    }

    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.__dshDesignCleanup = cleanup;
    document.body.style.cursor = 'crosshair';
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

interface NativeImageLike {
  toDataURL(): string
  isEmpty(): boolean
}

interface ElectronWebviewInspectable extends HTMLElement {
  executeJavaScript(code: string): Promise<unknown>
  capturePage?(rect?: { x: number; y: number; width: number; height: number }): Promise<NativeImageLike>
}

function isInspectableWebview(element: Element | null): element is ElectronWebviewInspectable {
  return element !== null && 'executeJavaScript' in element && typeof element.executeJavaScript === 'function'
}

interface InspectPayload {
  readonly mode?: string
  readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly selector?: string
  readonly outerHtml?: string
  readonly text?: string
  readonly elements?: readonly string[]
  readonly doodleDataUrl?: string
  readonly location?: string
}

function isInspectPayload(data: unknown): data is InspectPayload {
  if (typeof data !== 'object' || data === null) return false
  if (!('rect' in data) || typeof data.rect !== 'object' || data.rect === null) return false
  const r = data.rect
  return 'x' in r && typeof r.x === 'number'
    && 'y' in r && typeof r.y === 'number'
    && 'width' in r && typeof r.width === 'number'
    && 'height' in r && typeof r.height === 'number'
}

function formatInspectPrompt(payload: InspectPayload): string {
  const lines: string[] = ['Please inspect and modify this part of the design:']
  if (payload.selector) {
    lines.push(`- **Selected Element**: \`${payload.selector}\``)
  }
  if (payload.outerHtml) {
    lines.push(`- **Element HTML**: \`${payload.outerHtml}\``)
  }
  if (payload.elements && payload.elements.length > 0) {
    lines.push('- **Elements in Region**:')
    for (const el of payload.elements.slice(0, 5)) {
      lines.push(`  - \`${el}\``)
    }
  }
  if (payload.text) {
    lines.push(`- **Text Content**: "${payload.text}"`)
  }
  lines.push(`- **Region**: ${Math.round(payload.rect.width)} × ${Math.round(payload.rect.height)} px`)
  if (payload.location) {
    lines.push(`- **Page URL**: ${payload.location}`)
  }
  lines.push('\n[Screenshot attached / copied to clipboard — paste with Ctrl+V]')
  return lines.join('\n')
}

function mergeDoodleOnScreenshot(
  screenshotDataUrl: string,
  doodleDataUrl: string,
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): Promise<Blob> {
  const { promise, resolve } = Promise.withResolvers<Blob>()
  const canvas = document.createElement('canvas')
  canvas.width = rect.width
  canvas.height = rect.height
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    void fetch(screenshotDataUrl).then(r => r.blob()).then(resolve)
    return promise
  }
  const baseImg = new Image()
  baseImg.onload = () => {
    ctx.drawImage(baseImg, 0, 0, rect.width, rect.height)
    const doodleImg = new Image()
    doodleImg.onload = () => {
      ctx.drawImage(doodleImg, -rect.x, -rect.y)
      canvas.toBlob((blob) => {
        resolve(blob ?? new Blob([], { type: 'image/png' }))
      }, 'image/png')
    }
    doodleImg.onerror = () => {
      canvas.toBlob((blob) => {
        resolve(blob ?? new Blob([], { type: 'image/png' }))
      }, 'image/png')
    }
    doodleImg.src = doodleDataUrl
  }
  baseImg.onerror = () => {
    void fetch(screenshotDataUrl).then(r => r.blob()).then(resolve)
  }
  baseImg.src = screenshotDataUrl
  return promise
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
            void (async () => {
              let imageBlob: Blob | undefined
              try {
                if (typeof webview.capturePage === 'function') {
                  const targetRect = {
                    x: Math.max(0, Math.round(raw.rect.x)),
                    y: Math.max(0, Math.round(raw.rect.y)),
                    width: Math.max(1, Math.round(raw.rect.width)),
                    height: Math.max(1, Math.round(raw.rect.height)),
                  }
                  const nativeImg = await webview.capturePage(targetRect)
                  if (!nativeImg.isEmpty()) {
                    if (raw.doodleDataUrl) {
                      imageBlob = await mergeDoodleOnScreenshot(nativeImg.toDataURL(), raw.doodleDataUrl, targetRect)
                    } else {
                      const res = await fetch(nativeImg.toDataURL())
                      imageBlob = await res.blob()
                    }
                  }
                }
              } catch {}

              const prompt = formatInspectPrompt(raw)
              const clipboardItems: Record<string, Blob> = {
                'text/plain': new Blob([prompt], { type: 'text/plain' }),
              }
              if (imageBlob !== undefined) {
                clipboardItems['image/png'] = imageBlob
              }

              try {
                await navigator.clipboard.write([new ClipboardItem(clipboardItems)])
                setToast(imageBlob !== undefined ? t('inspect.copiedWithImage') : t('inspect.copied'))
              } catch {
                await navigator.clipboard.writeText(prompt)
                setToast(t('inspect.copied'))
              }
            })()
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
