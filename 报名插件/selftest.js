/* 本地自检：从 web/engine.js 抽出匹配函数，用真实题干验证字段命中
 * 运行：node selftest.js
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'web', 'engine.js'), 'utf8');

const synSrc = src.match(/var SYNONYMS = \{[\s\S]*?\n  \};/)[0];
const normSrc = src.match(/var norm = function \(s\) \{[\s\S]*?\n  \};/)[0];
const pickSrc = src.match(/function pick\(ctx, list\) \{[\s\S]*?\n  \}/)[0];

const { SYNONYMS, norm, pick } = new Function(
  synSrc + '\n' + normSrc + '\n' + pickSrc + '\nreturn { SYNONYMS: SYNONYMS, norm: norm, pick: pick };'
)();

const profile = {
  name: '张三',
  phone: '13800000000',
  gender: '女',
  age: '22',
  grade: '26级',
  className: '临床一班',
  major: '临床医学',
  email: 'a@b.com',
  school: 'XX大学',
  studentId: '2026001',
  idcard: '110101200001011234',
  session: '第一场',
  campus: '本部',
  wechat: 'wx_id',
  remark: '无',
  extra: { '你从哪里得知本次活动': '公众号' }
};

const entries = [];
for (const [field, keys] of Object.entries(SYNONYMS)) {
  const value = String(profile[field] || '').trim();
  if (!value) continue;
  entries.push({ field, keys: keys.map(norm).filter(Boolean), value });
}
for (const [label, value] of Object.entries(profile.extra)) {
  entries.push({ field: 'extra:' + label, keys: [norm(label)], value });
}

const cases = [
  ['1. 年级（如26级）', 'grade'],
  ['2. 班级（如临床一班）', 'className'],
  ['3. 你的专业是', 'major'],
  ['4. 您的姓名是', 'name'],
  ['4. 输入您的手机号', 'phone'],
  ['请填写您的手机号码', 'phone'],
  ['姓名', 'name'],
  ['联系方式（微信/手机）', 'phone'],
  ['你从哪里得知本次活动', 'extra:你从哪里得知本次活动'],
  ['所在学校', 'school'],
  ['观看场次', 'session'],
  ['性别', 'gender'],
  ['学号', 'studentId'],
  ['备注', 'remark']
];

let fail = 0;
for (const [ctx, expect] of cases) {
  const hit = pick(ctx, entries);
  const got = hit ? hit.field : '(none)';
  const ok = got === expect;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${JSON.stringify(ctx)} -> ${got}${ok ? '' : ' (期望 ' + expect + ')'}`);
}
console.log(fail ? `\n${fail} 个用例失败` : '\n全部通过');
process.exitCode = fail ? 1 : 0;
