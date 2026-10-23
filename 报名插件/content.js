/* 问卷自动填写 · 扩展内容脚本（Chrome / Edge）
 * 依赖同目录 engine.js（manifest 中先于本文件注入）。
 */
(() => {
  if (window.__AF_LOADED__) return;
  window.__AF_LOADED__ = true;

  const K = { PROFILE: 'af_profile', SETTINGS: 'af_settings', PENDING: 'af_pending' };
  const MAX_AGE = 15 * 60 * 1000;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let state = { profile: {}, settings: {}, pending: null };
  let lastCount = 0;

  function run(silent, autoSubmit) {
    if (typeof window.AFFILL_ENGINE !== 'function') return { count: 0, report: [] };
    try {
      return window.AFFILL_ENGINE(state.profile, { silent: !!silent, autoSubmit: !!autoSubmit });
    } catch (e) {
      console.warn('[问卷自动填写] 引擎异常', e);
      return { count: 0, report: [] };
    }
  }

  function toast(text) {
    try {
      if (window.top !== window) return;
      const old = document.getElementById('__af_toast');
      if (old) old.remove();
      const box = document.createElement('div');
      box.id = '__af_toast';
      box.textContent = text;
      box.style.cssText = 'position:fixed;z-index:2147483647;top:16px;right:16px;padding:10px 16px;' +
        'border-radius:10px;font:600 13px/1.2 system-ui,sans-serif;background:#111827;color:#fff;' +
        'box-shadow:0 8px 24px rgba(0,0,0,.25);pointer-events:none';
      document.documentElement.appendChild(box);
      setTimeout(() => box.remove(), 2600);
    } catch (e) {}
  }

  /* ---------------- 未开放自动刷新 ---------------- */

  function watchOpenWindow() {
    if (window.top !== window) return;
    if (!state.settings.autoReload) return;
    if (sessionStorage.getItem('af_filled') === '1') return;

    const fields = document.querySelectorAll('input:not([type=hidden]), textarea, select');
    if (fields.length > 1) return;

    const body = document.body ? document.body.innerText : '';
    if (!/未开放|将于|请到时|暂未开始|尚未开始|还未开始|未开始/.test(body)) return;

    const m = body.match(/(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})日?\s*(\d{1,2})[:：](\d{2})/);
    if (m) {
      const target = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0).getTime();
      const wait = target - Date.now() + 300;
      if (wait > 0 && wait < 24 * 3600 * 1000) {
        toast('问卷将于 ' + String(m[4]).padStart(2, '0') + ':' + m[5] + ' 开放，已定时刷新');
        setTimeout(() => location.reload(), wait);
        return;
      }
    }

    const n = Number(sessionStorage.getItem('af_reloads') || 0);
    if (n >= 400) return;
    sessionStorage.setItem('af_reloads', String(n + 1));
    setTimeout(() => location.reload(), 2500 + Math.random() * 2000);
  }

  /* ---------------- 调度 ---------------- */

  async function fillLoop() {
    const marks = [0, 300, 900, 1800, 3000, 5000, 8000, 12000, 18000];
    const t0 = Date.now();
    for (const m of marks) {
      const wait = t0 + m - Date.now();
      if (wait > 0) await sleep(wait);
      const r = run(false, state.settings.autoSubmit);
      if (r.count > 0) {
        lastCount = r.count;
        sessionStorage.setItem('af_filled', '1');
        return;
      }
    }
  }

  function observeLateFields() {
    let timer = null;
    const mo = new MutationObserver(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        const r = run(true, false);
        if (r.count > lastCount) {
          lastCount = r.count;
          toast(`已自动填写 ${r.count} 项`);
        }
      }, 400);
    });
    try {
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
    setTimeout(() => mo.disconnect(), 90000);
  }

  const isFresh = (p) => p && p.armedAt && Date.now() - p.armedAt < MAX_AGE;

  function normalizePath(u) {
    try {
      const x = new URL(u, location.href);
      return (x.host + x.pathname).replace(/\/+$/, '').toLowerCase();
    } catch (e) { return ''; }
  }

  function matchesTarget(url, target) {
    const a = normalizePath(url);
    const b = normalizePath(target);
    return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
  }

  async function boot() {
    const d = await chrome.storage.local.get([K.PROFILE, K.SETTINGS, K.PENDING]);
    state.profile = d[K.PROFILE] || {};
    state.settings = Object.assign({ autoReload: true, autoSubmit: false }, d[K.SETTINGS] || {});
    state.pending = d[K.PENDING] || null;

    if (!state.pending || !isFresh(state.pending)) return;
    if (!matchesTarget(location.href, state.pending.url)) return;

    observeLateFields();
    watchOpenWindow();
    fillLoop();
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === 'AF_FILL') {
      const r = run(false, msg.submit);
      sendResponse({ ok: true, count: r.count, report: r.report });
      return true;
    }
    if (msg.type === 'AF_STATUS') {
      const fields = document.querySelectorAll('input, select, textarea').length;
      sendResponse({ ok: true, fields });
    }
  });

  boot().catch(() => {});
})();
