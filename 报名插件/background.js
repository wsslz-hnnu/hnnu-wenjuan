/* 问卷自动填写 · background service worker
 * 负责：新标签页加载完成后注入并触发填写。
 */
const K = { PENDING: 'af_pending' };
const MAX_AGE = 15 * 60 * 1000;

function normalizePath(u) {
  try {
    const x = new URL(u);
    return (x.host + x.pathname).replace(/\/+$/, '').toLowerCase();
  } catch (e) {
    return '';
  }
}

function matches(url, target) {
  const a = normalizePath(url);
  const b = normalizePath(target);
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
}

async function handleTab(tabId, url) {
  if (!url || !/^https?:/i.test(url)) return;
  const data = await chrome.storage.local.get(K.PENDING);
  const pending = data[K.PENDING];
  if (!pending || !pending.armedAt || Date.now() - pending.armedAt > MAX_AGE) return;
  if (!matches(url, pending.url)) return;

  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
  } catch (e) {
    /* 页面可能受限（chrome://、商店页），忽略 */
  }
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'AF_FILL' });
  } catch (e) {}
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== 'complete') return;
  handleTab(tabId, tab && tab.url);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['af_profile']).then((d) => {
    if (!d.af_profile) {
      chrome.storage.local.set({
        af_profile: { name: '', phone: '', email: '', gender: '', age: '', grade: '', className: '', major: '', school: '', studentId: '', idcard: '', session: '', campus: '', wechat: '', remark: '', extra: {} },
        af_settings: { autoReload: true, autoSubmit: false, lastUrl: '' }
      });
    }
  });
});
