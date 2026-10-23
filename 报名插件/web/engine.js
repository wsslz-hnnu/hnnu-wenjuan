/* 问卷自动填写 · 通用填写引擎
 * 用法：AFFILL_ENGINE(profile, { autoSubmit: false, silent: false })
 * 返回：{ count, report }
 * 不依赖任何库、不访问网络，可直接序列化进书签 / 控制台脚本。
 */
function AFFILL_ENGINE(profile, options) {
  var opts = options || {};
  var data = profile || {};

  var SYNONYMS = {
    name:      ['真实姓名', '观众姓名', '报名人姓名', '姓名', '名字', '中文名', 'name'],
    phone:     ['手机号码', '联系电话', '联系方式', '手机号', '手机', '电话', 'phone', 'mobile', 'tel'],
    email:     ['电子邮箱', '邮箱地址', '电子邮件', '邮箱', 'email', 'e-mail'],
    gender:    ['性别', 'gender', 'sex'],
    age:       ['年龄', 'age'],
    school:    ['学校/单位', '工作单位', '单位名称', '就读学校', '学校', '院校', '学院', '大学', '单位', '公司', 'school'],
    grade:     ['所在年级', '年级', '几年级', '哪一级', 'grade'],
    className: ['所在班级', '班级', '班别', 'classname'],
    major:     ['专业', 'major'],
    studentId: ['学号', '工号', 'studentid'],
    idcard:    ['身份证号码', '身份证号', '证件号码', '身份证', 'idcard'],
    session:   ['观看场次', '演出场次', '选择场次', '参与场次', '场次', '批次', '时段'],
    campus:    ['所在校区', '校区', 'campus'],
    wechat:    ['微信号', '微信', 'wechat'],
    remark:    ['补充说明', '其他说明', '备注', '留言', '说明', 'remark', 'note']
  };

  var norm = function (s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[\s\u3000:：*＊()（）\[\]【】{}?？.。,，、/\\|_\-—~!！"'“”‘’]/g, '');
  };

  /* ---------- 可见性 / 可填性 ---------- */

  function visible(el) {
    if (!el) return false;
    if (el.tagName === 'INPUT' && el.type === 'hidden') return false;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    var r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return true;
    if (el.labels && el.labels.length) {
      for (var i = 0; i < el.labels.length; i++) {
        var lr = el.labels[i].getBoundingClientRect();
        if (lr.width > 0 && lr.height > 0) return true;
      }
    }
    if (el.parentElement) {
      var pr = el.parentElement.getBoundingClientRect();
      if (pr.width > 0 && pr.height > 0) return true;
    }
    return false;
  }

  function fillable(el) {
    if (!el || el.disabled || el.readOnly) return false;
    if (el.tagName === 'INPUT') {
      var t = (el.type || 'text').toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image', 'file', 'range', 'color'].indexOf(t) !== -1) return false;
    }
    return visible(el);
  }

  /* ---------- 题干识别 ---------- */

  function ownHints(el) {
    var out = [];
    var push = function (t) { t = String(t || '').replace(/\s+/g, ' ').trim(); if (t) out.push(t); };
    push(el.getAttribute('aria-label'));
    var lb = el.getAttribute('aria-labelledby');
    if (lb) lb.split(/\s+/).forEach(function (id) {
      var n = document.getElementById(id);
      if (n) push(n.innerText);
    });
    if (el.labels) for (var i = 0; i < el.labels.length; i++) push(el.labels[i].innerText);
    if (el.id) {
      try {
        var l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (l) push(l.innerText);
      } catch (e) {}
    }
    push(el.placeholder);
    push(el.title);
    push(el.getAttribute('name'));
    push(el.id);
    return out.join(' | ');
  }

  function noise(el) {
    if (el.matches('input, select, textarea, button')) return true;
    // 包含其它题目控件的兄弟节点（如资料页里每个 <label> 包一个 input）不能当题干
    if (el.querySelector('input, select, textarea')) return true;
    return false;
  }

  function questionCtx(node) {
    var cur = node;
    var fallback = '';
    for (var d = 0; d < 6 && cur && cur.parentElement && cur !== document.body; d++) {
      var parent = cur.parentElement;
      if (parent === document.body || parent === document.documentElement) break;
      var chunks = [];
      for (var i = 0; i < parent.children.length; i++) {
        var child = parent.children[i];
        if (child === cur || child.contains(cur)) continue;
        if (noise(child)) continue;
        var t = String(child.innerText || '').replace(/\s+/g, ' ').trim();
        if (t) chunks.push(t);
      }
      var joined = chunks.join(' ').trim();
      if (joined.length >= 2 && joined.length <= 120) return joined;
      if (!fallback && joined.length > 120 && joined.length <= 160) fallback = joined;
      cur = parent;
    }
    return fallback;
  }

  function ctxOf(el) {
    return [ownHints(el), questionCtx(el)].filter(Boolean).join(' | ');
  }

  function optionContainer(el) {
    var name = el.name;
    var cur = el.parentElement;
    while (cur && cur !== document.body) {
      var all = cur.querySelectorAll('input[type=radio], input[type=checkbox]');
      var group = [];
      for (var i = 0; i < all.length; i++) {
        if (name ? all[i].name === name : all[i].parentElement === cur) group.push(all[i]);
      }
      if (group.length > 1) return { container: cur, options: group };
      cur = cur.parentElement;
    }
    return { container: el.parentElement || el, options: [el] };
  }

  function optionLabel(el) {
    if (el.labels && el.labels.length) return String(el.labels[0].innerText || '').trim();
    var p = el.parentElement;
    if (p) {
      var t = String(p.innerText || '').replace(/\s+/g, ' ').trim();
      if (t && t.length <= 40) return t;
    }
    return String(el.getAttribute('aria-label') || el.value || '').trim();
  }

  /* ---------- 匹配 ---------- */

  function buildEntries() {
    var list = [];
    Object.keys(SYNONYMS).forEach(function (field) {
      var value = String(data[field] == null ? '' : data[field]).trim();
      if (!value) return;
      list.push({ field: field, keys: SYNONYMS[field].map(norm).filter(Boolean), value: value });
    });
    var extra = data.extra || {};
    Object.keys(extra).forEach(function (label) {
      var v = String(extra[label] == null ? '' : extra[label]).trim();
      if (!v || !label) return;
      list.push({ field: 'extra:' + label, keys: [norm(label)], value: v });
    });
    return list;
  }

  function pick(ctx, list) {
    var c = norm(ctx);
    if (!c) return null;
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      for (var j = 0; j < e.keys.length; j++) {
        var k = e.keys[j];
        if (!k) continue;
        var idx = c.indexOf(k);
        if (idx === -1) continue;
        var score = k.length * 10;
        if (c === k) score += 500;
        if (idx < 12) score += 3;
        if (score > bestScore) { bestScore = score; best = e; }
      }
    }
    return best;
  }

  /* ---------- 写入 ---------- */

  function dispatch(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    try { el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' })); } catch (e) {}
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function setValue(el, value) {
    try {
      var proto = Object.getPrototypeOf(el);
      var desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, value);
      else el.value = value;
    } catch (e) {
      el.value = value;
    }
    dispatch(el);
  }

  function flash(el) {
    if (opts.silent) return;
    try {
      var target = el;
      if (el.tagName === 'INPUT' && (el.type === 'radio' || el.type === 'checkbox') && el.labels && el.labels[0]) target = el.labels[0];
      if (!target || !target.style) return;
      var prev = target.style.outline;
      target.style.outline = '2px solid #10b981';
      target.style.outlineOffset = '2px';
      setTimeout(function () { target.style.outline = prev; target.style.outlineOffset = ''; }, 1800);
    } catch (e) {}
  }

  function toDateValue(raw) {
    var s = String(raw).trim();
    var m = s.match(/(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})/);
    if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
    m = s.match(/(\d{1,2})[-\/月](\d{1,2})/);
    if (m) {
      var y = new Date().getFullYear();
      return y + '-' + String(m[1]).padStart(2, '0') + '-' + String(m[2]).padStart(2, '0');
    }
    return s;
  }

  function fillChoiceGroup(group, entry) {
    var want = String(entry.value).split(/[,，、;；\/]+/).map(norm).filter(Boolean);
    if (!want.length) return false;
    var hit = false;
    for (var i = 0; i < group.options.length; i++) {
      var opt = group.options[i];
      var label = norm(optionLabel(opt));
      if (!label) continue;
      var matched = want.some(function (w) {
        return label === w || label.indexOf(w) !== -1 || (w.length >= 2 && w.indexOf(label) !== -1);
      });
      if (!matched) continue;
      try { opt.click(); } catch (e) {}
      if (!opt.checked) { opt.checked = true; dispatch(opt); }
      flash(opt);
      hit = true;
      if (opt.type === 'radio') break;
    }
    return hit;
  }

  function fillSelect(el, value) {
    var opts2 = [].slice.call(el.options);
    if (!opts2.length) return false;
    var v = norm(value);
    var found = null;
    for (var i = 0; i < opts2.length; i++) {
      if (norm(opts2[i].textContent) === v) { found = opts2[i]; break; }
    }
    if (!found) for (var j = 0; j < opts2.length; j++) if (norm(opts2[j].value) === v) { found = opts2[j]; break; }
    if (!found) for (var k = 0; k < opts2.length; k++) if (norm(opts2[k].textContent).indexOf(v) !== -1) { found = opts2[k]; break; }
    if (!found) for (var n = 0; n < opts2.length; n++) {
      var t = norm(opts2[n].textContent);
      if (t.length >= 2 && v.indexOf(t) !== -1) { found = opts2[n]; break; }
    }
    if (!found) return false;
    try { el.value = found.value; } catch (e) { found.selected = true; }
    dispatch(el);
    return true;
  }

  function fillOne(el, entry) {
    var tag = el.tagName;
    var type = (el.type || '').toLowerCase();

    if (tag === 'SELECT') return fillSelect(el, entry.value);

    if (type === 'radio' || type === 'checkbox') {
      var group = optionContainer(el);
      return fillChoiceGroup(group, entry);
    }

    var value = entry.value;
    if (type === 'date') value = toDateValue(value);
    else if (type === 'time') {
      var tm = String(value).match(/\d{1,2}[:：]\d{2}/);
      value = tm ? tm[0].replace('：', ':') : value;
    } else if (type === 'number') {
      var num = String(value).replace(/[^\d.\-]/g, '');
      if (num) value = num;
    } else if (type === 'tel') {
      value = String(value).replace(/[^\d+\-]/g, '');
    } else if (type === 'email') {
      value = String(value).trim();
    }

    setValue(el, value);
    flash(el);
    return String(el.value || '').length > 0;
  }

  /* ---------- 提示 / 提交 ---------- */

  function toast(text) {
    if (opts.silent) return;
    try {
      if (window.top !== window) return;
      var old = document.getElementById('__af_toast');
      if (old) old.remove();
      var box = document.createElement('div');
      box.id = '__af_toast';
      box.textContent = text;
      box.style.cssText = 'position:fixed;z-index:2147483647;top:16px;right:16px;padding:10px 16px;' +
        'border-radius:10px;font:600 13px/1.2 system-ui,sans-serif;background:#111827;color:#fff;' +
        'box-shadow:0 8px 24px rgba(0,0,0,.25);opacity:0;transition:opacity .2s;pointer-events:none';
      document.documentElement.appendChild(box);
      requestAnimationFrame(function () { box.style.opacity = '1'; });
      setTimeout(function () {
        box.style.opacity = '0';
        setTimeout(function () { box.remove(); }, 300);
      }, 2600);
    } catch (e) {}
  }

  function findSubmit() {
    var rx = /^(提交|确认提交|提交答卷|完成填写|完成|交卷|保存并提交|确定)/;
    var nodes = [].slice.call(document.querySelectorAll('button, input[type=submit], input[type=button], a, [role=button], div, span'));
    var hits = nodes.filter(function (n) {
      if (!visible(n)) return false;
      var t = String(n.innerText || n.value || '').replace(/\s+/g, '');
      return t && rx.test(t) && t.length <= 8;
    });
    hits.sort(function (a, b) {
      return (a.tagName === 'BUTTON' ? 0 : 1) - (b.tagName === 'BUTTON' ? 0 : 1);
    });
    return hits[0] || null;
  }

  function submitLater() {
    if (window.__AF_SUBMITTED__) return;
    setTimeout(function () {
      if (window.__AF_SUBMITTED__) return;
      var btn = findSubmit();
      if (!btn) return;
      window.__AF_SUBMITTED__ = true;
      btn.click();
    }, 700);
  }

  /* ---------- 主流程 ---------- */

  var entries = buildEntries();
  var result = { count: 0, report: [] };

  // 在「资料页」上误点书签时直接拒绝，避免把资料表单自己填花
  if (typeof window !== 'undefined' && window.__AF_TOOL__ === true && !opts.root) {
    toast('这是资料页面，请打开问卷后点书签');
    return result;
  }

  if (!entries.length) return result;

  var targets = [];
  var root = opts.root || document;
  try {
    targets = [].slice.call(root.querySelectorAll('input, select, textarea')).filter(fillable);
  } catch (e) {
    return result;
  }

  var seen = [];
  for (var i = 0; i < targets.length; i++) {
    var el = targets[i];
    var type = (el.type || '').toLowerCase();
    var ctx;
    if (type === 'radio' || type === 'checkbox') {
      var g = optionContainer(el);
      if (seen.indexOf(g.container) !== -1) continue;
      seen.push(g.container);
      ctx = ctxOf(g.container);
    } else {
      ctx = ctxOf(el);
    }
    if (!ctx) continue;
    var entry = pick(ctx, entries);
    if (!entry) continue;
    if (fillOne(el, entry)) {
      result.count++;
      result.report.push({ q: ctx.slice(0, 60), v: entry.value });
    }
  }

  if (result.count > 0) {
    toast('已自动填写 ' + result.count + ' 项');
    if (opts.autoSubmit) submitLater();
    try { console.log('[问卷自动填写]', result.report); } catch (e) {}
  } else {
    toast('没有匹配到可填字段，请检查资料');
  }

  return result;
}

if (typeof window !== 'undefined') window.AFFILL_ENGINE = AFFILL_ENGINE;
if (typeof module !== 'undefined' && module.exports) module.exports = AFFILL_ENGINE;
