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

    // 1. Selection & Hover Canvas
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    root.appendChild(overlayCanvas);

    // 2. Freehand Doodle Canvas
    const doodleCanvas = document.createElement('canvas');
    doodleCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    root.appendChild(doodleCanvas);

    function resizeCanvases() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (overlayCanvas.width !== w || overlayCanvas.height !== h) {
        overlayCanvas.width = w;
        overlayCanvas.height = h;
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

    // 3. Docked Top Bar (menempel horizontal penuh di atas)
    const topBar = document.createElement('div');
    topBar.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:38px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:rgba(15,23,42,0.96);backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,0.12);box-shadow:0 2px 10px rgba(0,0,0,0.35);color:#f8fafc;font-size:12px;font-weight:500;pointer-events:auto;z-index:40;box-sizing:border-box;';

    const barLeft = document.createElement('div');
    barLeft.style.cssText = 'display:flex;align-items:center;gap:10px;overflow:hidden;';

    const modeBadge = document.createElement('span');
    modeBadge.style.cssText = 'background:rgba(59,130,246,0.18);color:#60a5fa;border:1px solid rgba(59,130,246,0.4);padding:2px 8px;border-radius:4px;font-weight:600;font-size:11px;letter-spacing:0.3px;white-space:nowrap;';
    modeBadge.textContent = '🎨 Design Mode';

    const guideText = document.createElement('span');
    guideText.style.cssText = 'color:#94a3b8;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    guideText.textContent = 'Klik elemen untuk memilih (multi-select) • Drag mouse untuk coret-coret';

    barLeft.appendChild(modeBadge);
    barLeft.appendChild(guideText);

    const barRight = document.createElement('div');
    barRight.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0;';

    const countBadge = document.createElement('span');
    countBadge.style.cssText = 'color:#cbd5e1;font-size:11px;font-weight:500;padding:2px 8px;background:rgba(255,255,255,0.06);border-radius:4px;border:1px solid rgba(255,255,255,0.08);white-space:nowrap;';
    countBadge.textContent = '0 target';

    const btnReset = document.createElement('button');
    btnReset.type = 'button';
    btnReset.textContent = '↺ Reset';
    btnReset.style.cssText = 'background:transparent;border:1px solid rgba(255,255,255,0.15);color:#cbd5e1;padding:3px 10px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:500;transition:all 0.1s;';

    const btnExit = document.createElement('button');
    btnExit.type = 'button';
    btnExit.textContent = '✕ Keluar (Esc)';
    btnExit.style.cssText = 'background:transparent;border:0;color:#94a3b8;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:500;';

    barRight.appendChild(countBadge);
    barRight.appendChild(btnReset);
    barRight.appendChild(btnExit);

    topBar.appendChild(barLeft);
    topBar.appendChild(barRight);
    root.appendChild(topBar);

    // 4. Floating Chat Card (Automatic Popover with Element Chips)
    const chatBox = document.createElement('div');
    chatBox.style.cssText = 'position:fixed;display:none;width:380px;max-width:calc(100vw - 32px);background:rgba(15,23,42,0.96);backdrop-filter:blur(14px);border:1px solid #3b82f6;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.55);color:#f8fafc;z-index:50;pointer-events:auto;overflow:hidden;box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif;';

    const chatHeader = document.createElement('div');
    chatHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.08);background:rgba(15,23,42,0.6);';

    const headerTitle = document.createElement('div');
    headerTitle.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#60a5fa;';
    headerTitle.textContent = '💬 Kirim ke Chat';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Tutup pop-up (Esc)';
    closeBtn.style.cssText = 'background:transparent;border:0;color:#94a3b8;cursor:pointer;font-size:14px;padding:2px 6px;line-height:1;border-radius:4px;';

    chatHeader.appendChild(headerTitle);
    chatHeader.appendChild(closeBtn);
    chatBox.appendChild(chatHeader);

    const chipsContainer = document.createElement('div');
    chipsContainer.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:8px 12px 0 12px;max-height:80px;overflow-y:auto;';
    chatBox.appendChild(chipsContainer);

    const chatBody = document.createElement('div');
    chatBody.style.cssText = 'padding:8px 12px 10px 12px;';

    const promptInput = document.createElement('textarea');
    promptInput.placeholder = 'Tulis instruksi atau pertanyaan untuk AI... (Enter untuk kirim, Shift+Enter untuk baris baru)';
    promptInput.style.cssText = 'width:100%;min-height:64px;max-height:120px;background:#090d16;color:#f8fafc;border:1px solid #334155;border-radius:6px;padding:8px 10px;font-family:inherit;font-size:13px;resize:vertical;outline:none;box-sizing:border-box;line-height:1.4;';

    chatBody.appendChild(promptInput);
    chatBox.appendChild(chatBody);

    const chatFooter = document.createElement('div');
    chatFooter.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-top:1px solid rgba(255,255,255,0.08);background:rgba(15,23,42,0.4);';

    const hint = document.createElement('span');
    hint.style.cssText = 'font-size:11px;color:#64748b;';
    hint.textContent = 'Enter untuk kirim';

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;align-items:center;gap:6px;';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = '📋 Copy';
    copyBtn.style.cssText = 'background:#1e293b;border:1px solid #334155;color:#cbd5e1;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;';

    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.textContent = '🚀 Kirim ke Chat ⏎';
    sendBtn.style.cssText = 'background:#2563eb;border:0;color:#ffffff;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;display:flex;align-items:center;gap:4px;';

    actions.appendChild(copyBtn);
    actions.appendChild(sendBtn);
    chatFooter.appendChild(hint);
    chatFooter.appendChild(actions);
    chatBox.appendChild(chatFooter);

    root.appendChild(chatBox);
    document.documentElement.appendChild(root);

    // State
    const selectedElements = [];
    const doodlePoints = [];
    let hasDoodles = false;
    let isMouseDown = false;
    let isDrawing = false;
    let startX = 0;
    let startY = 0;
    let hoveredElement = null;

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

    function redrawOverlays() {
      const sctx = overlayCanvas.getContext('2d');
      if (!sctx) return;
      sctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

      selectedElements.forEach((item, index) => {
        const r = item.el.getBoundingClientRect();
        item.rect = { x: r.left, y: r.top, width: r.width, height: r.height };

        sctx.fillStyle = 'rgba(59, 130, 246, 0.16)';
        sctx.fillRect(r.left, r.top, r.width, r.height);
        sctx.strokeStyle = '#3b82f6';
        sctx.lineWidth = 2;
        sctx.strokeRect(r.left, r.top, r.width, r.height);

        const badgeText = '#' + (index + 1) + ' ' + item.selector;
        sctx.font = '600 11px ui-monospace, Menlo, monospace';
        const tw = sctx.measureText(badgeText).width;
        const bx = Math.max(8, r.left);
        const by = r.top < 44 ? r.top + r.height + 4 : r.top - 20;

        sctx.fillStyle = '#0f172a';
        sctx.fillRect(bx - 2, by, tw + 12, 18);
        sctx.strokeStyle = '#3b82f6';
        sctx.lineWidth = 1;
        sctx.strokeRect(bx - 2, by, tw + 12, 18);
        sctx.fillStyle = '#60a5fa';
        sctx.fillText(badgeText, bx + 4, by + 13);
      });

      if (hoveredElement && !selectedElements.some(item => item.el === hoveredElement)) {
        const hr = hoveredElement.getBoundingClientRect();
        sctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
        sctx.lineWidth = 1.5;
        sctx.setLineDash([4, 4]);
        sctx.strokeRect(hr.left, hr.top, hr.width, hr.height);
        sctx.setLineDash([]);
      }
    }

    function updateCounterAndChips() {
      const count = selectedElements.length + (hasDoodles ? 1 : 0);
      countBadge.textContent = count + ' target';

      chipsContainer.innerHTML = '';
      selectedElements.forEach((item, index) => {
        const chip = document.createElement('div');
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:4px;background:#1e293b;border:1px solid #334155;color:#93c5fd;font-size:11px;font-family:ui-monospace,Menlo,monospace;padding:2px 8px;border-radius:9999px;max-width:180px;';

        const label = document.createElement('span');
        label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        label.textContent = '#' + (index + 1) + ' ' + item.selector;

        const del = document.createElement('span');
        del.textContent = '✕';
        del.style.cssText = 'cursor:pointer;color:#94a3b8;font-size:10px;margin-left:2px;';
        del.onclick = (e) => {
          e.stopPropagation();
          selectedElements.splice(index, 1);
          redrawOverlays();
          updateCounterAndChips();
          if (selectedElements.length === 0 && !hasDoodles) {
            chatBox.style.display = 'none';
          }
        };

        chip.appendChild(label);
        chip.appendChild(del);
        chipsContainer.appendChild(chip);
      });

      if (hasDoodles) {
        const dChip = document.createElement('div');
        dChip.style.cssText = 'display:inline-flex;align-items:center;gap:4px;background:#1e293b;border:1px solid #ef4444;color:#fca5a5;font-size:11px;padding:2px 8px;border-radius:9999px;';
        dChip.textContent = '✏️ Coretan';
        const dDel = document.createElement('span');
        dDel.textContent = '✕';
        dDel.style.cssText = 'cursor:pointer;color:#94a3b8;font-size:10px;margin-left:2px;';
        dDel.onclick = (e) => {
          e.stopPropagation();
          clearDoodles();
          updateCounterAndChips();
          if (selectedElements.length === 0 && !hasDoodles) {
            chatBox.style.display = 'none';
          }
        };
        dChip.appendChild(dDel);
        chipsContainer.appendChild(dChip);
      }
    }

    function showOrUpdateChatBox(anchorRect) {
      updateCounterAndChips();
      if (selectedElements.length === 0 && !hasDoodles) return;

      const pad = 14;
      const boxW = Math.min(380, window.innerWidth - pad * 2);
      let left = anchorRect ? anchorRect.x : window.innerWidth - boxW - pad;
      if (left + boxW > window.innerWidth - pad) {
        left = window.innerWidth - boxW - pad;
      }
      left = Math.max(pad, left);

      let top = anchorRect ? anchorRect.y + anchorRect.height + 10 : 50;
      if (top + 220 > window.innerHeight - pad) {
        top = anchorRect ? anchorRect.y - 210 : window.innerHeight - 230;
      }
      top = Math.max(44, top);

      chatBox.style.width = boxW + 'px';
      chatBox.style.left = Math.round(left) + 'px';
      chatBox.style.top = Math.round(top) + 'px';
      chatBox.style.display = 'block';

      setTimeout(() => { promptInput.focus(); }, 40);
    }

    function clearDoodles() {
      const dctx = doodleCanvas.getContext('2d');
      if (dctx) dctx.clearRect(0, 0, doodleCanvas.width, doodleCanvas.height);
      doodlePoints.length = 0;
      hasDoodles = false;
    }

    function resetAll() {
      selectedElements.length = 0;
      clearDoodles();
      redrawOverlays();
      updateCounterAndChips();
      chatBox.style.display = 'none';
    }

    btnReset.addEventListener('click', (e) => { e.stopPropagation(); resetAll(); });
    btnExit.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('__DSH_INSPECT_CANCEL__');
      cleanup();
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chatBox.style.display = 'none';
    });

    function submitChat(isCopyOnly) {
      if (selectedElements.length === 0 && !hasDoodles) return;
      const userPrompt = (promptInput.value || '').trim();

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const item of selectedElements) {
        const r = item.el.getBoundingClientRect();
        minX = Math.min(minX, r.left);
        minY = Math.min(minY, r.top);
        maxX = Math.max(maxX, r.right);
        maxY = Math.max(maxY, r.bottom);
      }
      for (const pt of doodlePoints) {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      }
      if (!isFinite(minX)) {
        minX = 0; minY = 0; maxX = window.innerWidth; maxY = window.innerHeight;
      } else {
        minX = Math.max(0, minX - 16);
        minY = Math.max(0, minY - 16);
        maxX = Math.min(window.innerWidth, maxX + 16);
        maxY = Math.min(window.innerHeight, maxY + 16);
      }
      const unionRect = {
        x: Math.round(minX),
        y: Math.round(minY),
        width: Math.max(50, Math.round(maxX - minX)),
        height: Math.max(50, Math.round(maxY - minY)),
      };

      const payload = {
        mode: hasDoodles ? 'draw' : 'element',
        rect: unionRect,
        selectedElements: selectedElements.map(item => ({
          selector: item.selector,
          outerHtml: item.outerHtml,
          text: item.text,
          rect: item.rect,
        })),
        location: window.location.href,
        userPrompt: userPrompt || undefined,
        isCopyOnly: isCopyOnly === true,
        doodleDataUrl: hasDoodles ? doodleCanvas.toDataURL('image/png') : undefined,
      };

      console.log('__DSH_INSPECT__:' + JSON.stringify(payload));
      cleanup();
    }

    sendBtn.addEventListener('click', (e) => { e.stopPropagation(); submitChat(false); });
    copyBtn.addEventListener('click', (e) => { e.stopPropagation(); submitChat(true); });

    promptInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitChat(false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        chatBox.style.display = 'none';
      }
    });

    function onMouseMove(e) {
      resizeCanvases();
      if (topBar.contains(e.target) || chatBox.contains(e.target)) return;

      if (!isMouseDown) {
        const el = e.target;
        if (!el || el === document.body || el === document.documentElement || root.contains(el)) {
          hoveredElement = null;
        } else {
          hoveredElement = el;
        }
        redrawOverlays();
        return;
      }

      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (dist > 5 || isDrawing) {
        isDrawing = true;
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
      if (topBar.contains(e.target) || chatBox.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      isMouseDown = true;
      isDrawing = false;
      startX = e.clientX;
      startY = e.clientY;

      const dctx = doodleCanvas.getContext('2d');
      if (dctx) {
        dctx.beginPath();
        dctx.moveTo(startX, startY);
      }
    }

    function onMouseUp(e) {
      if (topBar.contains(e.target) || chatBox.contains(e.target)) return;
      if (!isMouseDown) return;
      isMouseDown = false;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      let anchorRect = null;

      if (dist <= 5 && !isDrawing) {
        const target = e.target;
        if (target && target !== document.body && target !== document.documentElement && !root.contains(target)) {
          const existingIdx = selectedElements.findIndex(item => item.el === target);
          if (existingIdx !== -1) {
            selectedElements.splice(existingIdx, 1);
          } else {
            const r = target.getBoundingClientRect();
            const selector = getSelector(target);
            const tag = target.tagName.toLowerCase();
            const text = (target.textContent || '').trim().slice(0, 200);
            const clone = target.cloneNode(false);
            if (text) clone.textContent = text.length > 80 ? text.slice(0, 77) + '...' : text;
            const outerHtml = clone.outerHTML || ('<' + tag + '>');
            const itemRect = { x: r.left, y: r.top, width: r.width, height: r.height };
            selectedElements.push({ el: target, selector, outerHtml, text, rect: itemRect });
            anchorRect = itemRect;
          }
          redrawOverlays();
        }
      } else if (isDrawing && hasDoodles) {
        anchorRect = { x: e.clientX, y: e.clientY, width: 40, height: 40 };
      }

      if (selectedElements.length > 0 || hasDoodles) {
        showOrUpdateChatBox(anchorRect);
      }
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        if (chatBox.style.display !== 'none') {
          chatBox.style.display = 'none';
        } else {
          console.log('__DSH_INSPECT_CANCEL__');
          cleanup();
        }
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

interface InspectElementItem {
  readonly selector: string
  readonly outerHtml: string
  readonly text?: string
  readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
}

interface InspectPayload {
  readonly mode?: string
  readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly selectedElements?: readonly InspectElementItem[]
  readonly selector?: string
  readonly outerHtml?: string
  readonly text?: string
  readonly elements?: readonly string[]
  readonly doodleDataUrl?: string
  readonly location?: string
  readonly userPrompt?: string
  readonly isCopyOnly?: boolean
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
  const lines: string[] = []
  if (payload.userPrompt) {
    lines.push(payload.userPrompt, '', '---', '**Design Context**:')
  } else {
    lines.push('Please inspect and modify these selected design elements:')
  }
  if (payload.selectedElements && payload.selectedElements.length > 0) {
    lines.push(`- **Selected Elements (${String(payload.selectedElements.length)})**:`)
    payload.selectedElements.forEach((item, index) => {
      lines.push(`  ${String(index + 1)}. \`${item.selector}\` (${String(Math.round(item.rect.width))} × ${String(Math.round(item.rect.height))} px)`)
      if (item.text) lines.push(`     - Text: "${item.text}"`)
      if (item.outerHtml) lines.push(`     - HTML: \`${item.outerHtml}\``)
    })
  } else {
    if (payload.selector) {
      lines.push(`- **Selected Element**: \`${payload.selector}\``)
    }
    if (payload.outerHtml) {
      lines.push(`- **Element HTML**: \`${payload.outerHtml}\``)
    }
    if (payload.text) {
      lines.push(`- **Text Content**: "${payload.text}"`)
    }
  }
  if (payload.elements && payload.elements.length > 0 && (!payload.selectedElements || payload.selectedElements.length === 0)) {
    lines.push('- **Elements in Region**:')
    for (const el of payload.elements.slice(0, 5)) {
      lines.push(`  - \`${el}\``)
    }
  }
  lines.push(`- **Captured Region**: ${String(Math.round(payload.rect.width))} × ${String(Math.round(payload.rect.height))} px`)
  if (payload.location) {
    lines.push(`- **Page URL**: ${payload.location}`)
  }
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
  const { mount, loadUrl, restore, goBack, goForward, reload, setSandbox, sendToChat, useBrowserState, useStore, useTabInfo, t } = props
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

              // 1. Send directly to active conversation chat FIRST
              let sentDirectly = false
              if (raw.isCopyOnly !== true) {
                if (typeof sendToChat === 'function') {
                  try {
                    sentDirectly = await sendToChat(prompt, imageBlob, true)
                  } catch (err) {
                    console.warn('sendToChat invocation error', err)
                  }
                }
                // Fallback: If not sent via service, populate active composer in DOM
                if (!sentDirectly) {
                  try {
                    const card = document.querySelector('[data-composer-card]')
                    const editor = card?.querySelector('[contenteditable="true"]') as HTMLElement | null
                    if (editor) {
                      editor.focus()
                      editor.textContent = prompt
                      editor.dispatchEvent(new Event('input', { bubbles: true }))
                      const sendBtn = card?.querySelector('button[aria-label="Send"], button[aria-label="Kirim"], button[aria-label="发送"]') as HTMLButtonElement | null
                      if (sendBtn && !sendBtn.disabled) {
                        sendBtn.click()
                        sentDirectly = true
                      }
                    }
                  } catch {}
                }
              }

              // 2. Safe non-throwing clipboard copy
              try {
                if (typeof window !== 'undefined' && typeof window.focus === 'function') {
                  window.focus()
                }
                await navigator.clipboard.write([new ClipboardItem(clipboardItems)])
              } catch {
                try {
                  await navigator.clipboard.writeText(prompt)
                } catch {
                  // Ignore clipboard focus errors so sending to chat is never blocked
                }
              }

              // 3. Save draft to localStorage as fallback
              try {
                if (typeof localStorage !== 'undefined' && props.sessionId) {
                  localStorage.setItem(`dsh.conversation.${props.sessionId}`, JSON.stringify({ text: prompt, references: [] }))
                }
              } catch {}

              // 4. Toast notification
              if (sentDirectly) {
                setToast(t('inspect.sentToChat'))
              } else {
                setToast(imageBlob !== undefined ? t('inspect.copiedWithImage') : t('inspect.copied'))
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
  }, [inspecting, viewportId, mountEpoch, sendToChat, props.sessionId, t])

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
