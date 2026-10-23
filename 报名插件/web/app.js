/* 问卷自动填写 · 网页版逻辑（字段可增删） */
(function () {
  'use strict';

  window.__AF_TOOL__ = true;

  var SK = { profile: 'afweb.profile.v1', settings: 'afweb.settings.v1', fields: 'afweb.fields.v2' };
  var $ = function (id) { return document.getElementById(id); };

  /* 默认字段；用户删掉的不再出现，加过的自定义字段存在 fields 里 */
  var DEFAULT_FIELDS = [
    { id: 'name', key: 'name', label: '姓名', type: 'text', placeholder: '张三' },
    { id: 'phone', key: 'phone', label: '手机号', type: 'tel', placeholder: '13800000000' },
    { id: 'gender', key: 'gender', label: '性别', type: 'select' },
    { id: 'age', key: 'age', label: '年龄', type: 'text', placeholder: '22' },
    { id: 'grade', key: 'grade', label: '年级', type: 'text', placeholder: '26级' },
    { id: 'className', key: 'className', label: '班级', type: 'text', placeholder: '临床一班' },
    { id: 'major', key: 'major', label: '专业', type: 'text', list: 'majorOptions', placeholder: '临床医学' },
    { id: 'school', key: 'school', label: '学校/单位', type: 'text', placeholder: 'XX大学' },
    { id: 'studentId', key: 'studentId', label: '学号/工号', type: 'text' },
    { id: 'idcard', key: 'idcard', label: '身份证号', type: 'text' },
    { id: 'email', key: 'email', label: '邮箱', type: 'text', placeholder: 'you@example.com' },
    { id: 'session', key: 'session', label: '场次', type: 'text', placeholder: '第一场' },
    { id: 'campus', key: 'campus', label: '校区', type: 'text' },
    { id: 'wechat', key: 'wechat', label: '微信号', type: 'text' },
    { id: 'remark', key: 'remark', label: '备注', type: 'textarea', full: true, placeholder: '填到「备注 / 说明」类题目' }
  ];

  var fields = [];
  var profile = {};
  var settings = { autoSubmit: false };

  /* ---------- 存储 ---------- */

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var v = JSON.parse(raw);
      return v && typeof v === 'object' ? v : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function defaultFields() {
    return DEFAULT_FIELDS.map(function (f) { return JSON.parse(JSON.stringify(f)); });
  }

  /* ---------- 渲染 ---------- */

  function valueOf(f) {
    if (f.custom) return (profile.extra || {})[f.label] || '';
    return profile[f.key] || '';
  }

  function bindInput(el) {
    el.addEventListener('input', trusted(function () { save(); }));
    el.addEventListener('change', trusted(function () { save(); }));
  }

  function makeInput(f) {
    var input;
    if (f.type === 'select') {
      input = document.createElement('select');
      [['', '未填'], ['男', '男'], ['女', '女']].forEach(function (pair) {
        var opt = document.createElement('option');
        opt.value = pair[0];
        opt.textContent = pair[1];
        input.appendChild(opt);
      });
      input.value = valueOf(f);
    } else if (f.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 2;
      if (f.placeholder) input.placeholder = f.placeholder;
      input.value = valueOf(f);
    } else {
      input = document.createElement('input');
      input.type = f.type || 'text';
      if (f.list) input.setAttribute('list', f.list);
      if (f.placeholder) input.placeholder = f.placeholder;
      input.value = valueOf(f);
    }
    return input;
  }

  function render() {
    var box = $('fields');
    box.innerHTML = '';

    fields.forEach(function (f) {
      var row = document.createElement('label');
      row.className = 'fld' + (f.full ? ' full' : '');
      row.setAttribute('data-fid', f.id);

      var head = document.createElement('span');
      head.className = 'fldlabel';
      head.appendChild(document.createTextNode(f.label));

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.title = '删除这个字段';
      del.textContent = '×';
      del.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        removeField(f.id);
      });
      head.appendChild(del);
      row.appendChild(head);

      var input = makeInput(f);
      bindInput(input);
      row.appendChild(input);
      box.appendChild(row);
    });
  }

  /* ---------- 字段增删 ---------- */

  function ensureCustomFromProfile() {
    var extra = (profile && profile.extra) || {};
    Object.keys(extra).forEach(function (label) {
      var exists = fields.some(function (f) { return f.custom && f.label === label; });
      if (!exists) {
        fields.push({ id: 'c_' + Math.random().toString(36).slice(2, 8), label: label, custom: true, type: 'text' });
      }
    });
  }

  function removeField(id) {
    var f = null;
    fields.forEach(function (x) { if (x.id === id) f = x; });
    if (!f) return;
    fields = fields.filter(function (x) { return x.id !== id; });
    write(SK.fields, fields);
    save();
    render();
  }

  function addField(name) {
    name = String(name || '').trim();
    if (!name) return '名字不能为空';
    var dup = fields.some(function (f) { return f.label === name; });
    if (dup) return '已经有这个字段了';
    fields.push({ id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), label: name, custom: true, type: 'text' });
    write(SK.fields, fields);
    save();
    render();
    var last = fields[fields.length - 1];
    var input = document.querySelector('[data-fid="' + last.id + '"] input');
    if (input) input.focus();
    return '';
  }

  function openAddRow() {
    var row = $('addRow');
    row.hidden = false;
    $('newFieldName').value = '';
    $('newFieldName').focus();
  }

  function closeAddRow() {
    $('addRow').hidden = true;
    $('newFieldName').value = '';
  }

  /* ---------- 资料读写 ---------- */

  function collect() {
    var p = { extra: {} };
    fields.forEach(function (f) {
      var el = document.querySelector('[data-fid="' + f.id + '"] input, [data-fid="' + f.id + '"] select, [data-fid="' + f.id + '"] textarea');
      var v = el ? String(el.value || '').trim() : '';
      if (!v) return;
      if (f.custom) p.extra[f.label] = v;
      else if (f.key) p[f.key] = v;
    });
    return p;
  }

  function summarize() {
    var p = collect();
    var n = 0;
    Object.keys(p).forEach(function (k) {
      if (k === 'extra') n += Object.keys(p.extra).length;
      else n++;
    });
    return n;
  }

  function flashSaved(text) {
    var el = $('saveState');
    el.textContent = text || '已保存 ✓';
    el.classList.add('flash');
    clearTimeout(flashSaved._t);
    flashSaved._t = setTimeout(function () {
      el.classList.remove('flash');
      el.textContent = '已保存到本机';
    }, 1400);
  }

  function save() {
    profile = collect();
    settings.autoSubmit = $('autoSubmit').checked;
    settings.url = $('url').value.trim();
    write(SK.profile, profile);
    write(SK.settings, settings);
    updateBookmarklet();
    flashSaved();
  }

  /* ---------- 书签 ---------- */

  function buildCode() {
    var src = window.AFFILL_ENGINE.toString();
    var data = JSON.stringify(profile);
    return '(function(){var p=' + data + ';(' + src + ')(p,{autoSubmit:' + !!settings.autoSubmit + '});})();';
  }

  function updateBookmarklet() {
    var code = buildCode();
    $('bookmarklet').setAttribute('href', 'javascript:' + encodeURIComponent(code));
    var n = summarize();
    $('bmHint').textContent = n
      ? '书签已按当前资料更新（共 ' + n + ' 项）。改过资料或字段后请重新拖一次书签。书签里是明文资料，不要同步或分享给别人。'
      : '还没有资料。先在第 1 步填写，书签会随资料自动更新。';
  }

  /* ---------- 其它 ---------- */

  function trusted(fn) {
    return function (e) {
      if (e && e.isTrusted === false) return;
      fn();
    };
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text)
        .then(function () { return true; })
        .catch(function () { return legacy(text); });
    }
    return Promise.resolve(legacy(text));
  }

  function legacy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  /* ---------- 事件 ---------- */

  $('addField').addEventListener('click', openAddRow);
  $('cancelAdd').addEventListener('click', closeAddRow);
  $('confirmAdd').addEventListener('click', function () {
    var err = addField($('newFieldName').value);
    if (err) {
      $('newFieldName').focus();
      $('bmHint').textContent = err;
      return;
    }
    closeAddRow();
  });
  $('newFieldName').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); $('confirmAdd').click(); }
    if (e.key === 'Escape') closeAddRow();
  });

  $('resetFields').addEventListener('click', function () {
    if (!window.confirm('恢复成默认字段？自定义的字段和它们的值会被移除。')) return;
    fields = defaultFields();
    write(SK.fields, fields);
    save();
    render();
    flashSaved('已恢复默认字段');
  });

  $('reset').addEventListener('click', function () {
    if (!window.confirm('清空本机保存的全部资料？清空后需要重新填并重新拖一次书签。')) return;
    profile = { extra: {} };
    write(SK.profile, profile);
    render();
    save();
    flashSaved('已清空');
  });

  $('copyScript').addEventListener('click', function () {
    profile = collect();
    copyText(buildCode()).then(function (ok) {
      $('bmHint').textContent = ok
        ? '脚本已复制。打开问卷页按 F12 → Console → 粘贴 → 回车即可填写。'
        : '复制失败，请手动选中下面的文本框复制。';
      if (!ok) {
        var ta = document.createElement('textarea');
        ta.value = buildCode();
        ta.rows = 6;
        ta.style.marginTop = '10px';
        $('bmHint').after(ta);
        ta.select();
      }
    });
  });

  $('bookmarklet').addEventListener('click', function (e) {
    e.preventDefault();
    $('bmHint').textContent = '把「★ 一键填写问卷」拖到书签栏；打开问卷页后点书签即可。';
  });

  $('open').addEventListener('click', function () {
    var url = $('url').value.trim();
    if (!url) { $('bmHint').textContent = '请先填问卷地址'; return; }
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
      $('url').value = url;
    }
    save();
    window.open(url, '_blank', 'noopener');
  });

  $('testFill').addEventListener('click', function () {
    profile = collect();
    updateBookmarklet();
    var res;
    try {
      res = window.AFFILL_ENGINE(profile, { root: $('demo'), silent: true });
    } catch (e) {
      $('testResult').textContent = '引擎出错：' + e.message;
      $('testResult').className = 'err';
      return;
    }
    var out = $('testResult');
    if (res.count > 0) {
      var vals = res.report.map(function (r) { return r.v; }).join(' / ');
      out.textContent = '已填 ' + res.count + ' 项：' + vals;
      out.className = 'ok';
    } else {
      out.textContent = '没匹配到，检查资料是否为空';
      out.className = 'err';
    }
  });

  ['autoSubmit', 'url'].forEach(function (id) {
    var el = $(id);
    el.addEventListener('input', trusted(save));
    el.addEventListener('change', trusted(save));
  });

  /* ---------- 启动 ---------- */

  (function boot() {
    profile = read(SK.profile, { extra: {} });
    if (!profile || typeof profile !== 'object') profile = { extra: {} };
    if (!profile.extra || typeof profile.extra !== 'object') profile.extra = {};
    settings = read(SK.settings, { autoSubmit: false });

    var saved = read(SK.fields, null);
    fields = Array.isArray(saved) && saved.length ? saved : defaultFields();
    ensureCustomFromProfile();

    $('autoSubmit').checked = !!settings.autoSubmit;
    if (settings.url) $('url').value = settings.url;

    render();
    updateBookmarklet();
  })();
})();
