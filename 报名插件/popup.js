/* 问卷自动填写 · popup */
const FIELDS = ['name', 'phone', 'gender', 'age', 'grade', 'className', 'major', 'email', 'school', 'studentId', 'idcard', 'session', 'campus', 'wechat', 'remark'];
const K = { PROFILE: 'af_profile', SETTINGS: 'af_settings', PENDING: 'af_pending' };
const DEFAULT_URL = 'https://v.wjx.cn/vm/h4t66uR.aspx';

const $ = (id) => document.getElementById(id);

function setStatus(text, kind) {
  const el = $('status');
  el.textContent = text;
  el.className = kind || '';
  if (kind) {
    clearTimeout(setStatus._t);
    setStatus._t = setTimeout(() => { el.className = ''; el.textContent = '资料只保存在本机浏览器'; }, 3500);
  }
}

async function load() {
  const data = await chrome.storage.local.get([K.PROFILE, K.SETTINGS]);
  const p = data[K.PROFILE] || {};
  const s = data[K.SETTINGS] || {};
  for (const f of FIELDS) {
    const el = document.querySelector(`[data-key="${f}"]`);
    if (el) el.value = p[f] || '';
  }
  const extra = p.extra && Object.keys(p.extra).length ? JSON.stringify(p.extra, null, 2) : '';
  $('extra').value = extra;
  $('optAutoReload').checked = s.autoReload !== false;
  $('optAutoSubmit').checked = !!s.autoSubmit;
  $('url').value = s.lastUrl || DEFAULT_URL;
}

function readForm() {
  const profile = { extra: {} };
  for (const f of FIELDS) {
    const el = document.querySelector(`[data-key="${f}"]`);
    if (el) profile[f] = el.value.trim();
  }
  const raw = $('extra').value.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) profile.extra = parsed;
      else throw new Error('JSON 需要是对象');
    } catch (e) {
      setStatus('自定义字段 JSON 格式有误：' + e.message, 'err');
      throw e;
    }
  }
  const settings = {
    autoReload: $('optAutoReload').checked,
    autoSubmit: $('optAutoSubmit').checked,
    lastUrl: $('url').value.trim()
  };
  return { profile, settings };
}

async function save(silent) {
  let data;
  try { data = readForm(); } catch (e) { return false; }
  await chrome.storage.local.set({ [K.PROFILE]: data.profile, [K.SETTINGS]: data.settings });
  if (!silent) setStatus('资料已保存', 'ok');
  return true;
}

function normalizeUrl(raw) {
  let u = (raw || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

$('open').addEventListener('click', async () => {
  const ok = await save(true);
  if (!ok) return;
  const url = normalizeUrl($('url').value);
  if (!url) { setStatus('请先填入问卷地址', 'err'); return; }
  $('url').value = url;
  await chrome.storage.local.set({ [K.PENDING]: { url, armedAt: Date.now() } });
  await chrome.tabs.create({ url, active: true });
  setStatus('已打开问卷，将自动填写', 'ok');
});

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function inject(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
  } catch (e) { /* 特殊页面忽略 */ }
}

$('fillHere').addEventListener('click', async () => {
  const ok = await save(true);
  if (!ok) return;
  const tab = await currentTab();
  if (!tab || !/^https?:/i.test(tab.url || '')) { setStatus('当前页面不支持填写', 'err'); return; }
  await chrome.storage.local.set({ [K.PENDING]: { url: tab.url, armedAt: Date.now() } });
  await inject(tab.id);
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'AF_FILL', submit: $('optAutoSubmit').checked });
    setStatus(res && res.count ? `已填写 ${res.count} 项` : '没匹配到可填字段，检查资料或题目措辞', res && res.count ? 'ok' : 'err');
  } catch (e) {
    setStatus('填写失败：' + e.message, 'err');
  }
});

$('reloadHere').addEventListener('click', async () => {
  const ok = await save(true);
  if (!ok) return;
  const tab = await currentTab();
  if (!tab || !/^https?:/i.test(tab.url || '')) { setStatus('当前页面不支持', 'err'); return; }
  await chrome.storage.local.set({ [K.PENDING]: { url: tab.url, armedAt: Date.now() } });
  await chrome.tabs.reload(tab.id);
  setStatus('已开始刷新等待问卷开放', 'ok');
});

$('save').addEventListener('click', () => save(false));

['optAutoReload', 'optAutoSubmit'].forEach((id) => {
  $(id).addEventListener('change', () => save(true));
});

// 输入时静默保存，避免忘记点保存；忽略脚本合成事件
document.querySelectorAll('input[data-key], select[data-key], textarea, #url').forEach((el) => {
  let t = null;
  el.addEventListener('input', (e) => {
    if (e && e.isTrusted === false) return;
    clearTimeout(t);
    t = setTimeout(() => save(true), 500);
  });
});

load();
