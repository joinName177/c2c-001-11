import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

const result = await build({
  entryPoints: ['src/core/time-engine.ts'],
  bundle: true, format: 'esm', write: false, platform: 'node',
});
writeFileSync('/tmp/engine.mjs', result.outputFiles[0].text);
const engine = await import(pathToFileURL('/tmp/engine.mjs').href);

let failures = 0;
function assert(name, cond, detail = '') {
  if (cond) { console.log(`PASS ${name}`); }
  else { failures++; console.error(`FAIL ${name} ${detail}`); }
}

// 以 2026-10-03（周六）为“今天”
const now = new Date(2026, 9, 3, 15, 30);
const cw = engine.currentWeek(now);
const pw = engine.previousWeek(now);

assert('本周周一是 2026-09-28', engine.dayKeyOf(cw.start) === '2026-09-28', engine.dayKeyOf(cw.start));
assert('本周半开区间终于 2026-10-05', engine.dayKeyOf(cw.end) === '2026-10-05');
assert('上周周一是 2026-09-21', engine.dayKeyOf(pw.start) === '2026-09-21');
assert('上周结束于本周开始', pw.end.getTime() === cw.start.getTime());
assert('ISO 周序号为 40', engine.isoWeekNumber(now) === 40, engine.isoWeekNumber(now));

// 跨月日期归入对应周：9-30(三)、10-01(四) 都在本周；9-28 边界在本周；9-27 在上周
const recs = [
  { id: 'time-1-a', category: '事业', hours: 2, note: '9/27 上周日', date: '2026-09-27T12:00:00' },
  { id: 'time-2-b', category: '事业', hours: 3, note: '9/28 本周一', date: '2026-09-28T12:00:00' },
  { id: 'time-3-c', category: '事业', hours: 4, note: '9/30 跨月', date: '2026-09-30T20:00:00' },
  { id: 'time-4-d', category: '事业', hours: 5, note: '10/1 跨月', date: '2026-10-01T08:00:00' },
  { id: 'time-5-e', category: '事业', hours: 6, note: '10/04 本周日', date: '2026-10-04T23:00:00' },
  { id: 'time-6-f', category: '事业', hours: 7, note: '10/05 下周一', date: '2026-10-05T00:30:00' },
];
// 注意 date 被当作本地时间构造（测试环境时区即运行环境）
const localRecs = recs.map((r) => ({ ...r, date: new Date(r.date).toISOString() }));
const inThis = engine.recordsWithin(localRecs, cw);
const inLast = engine.recordsWithin(localRecs, pw);
assert('本周含 4 笔（周一到周日，跨月两天）', inThis.length === 4, inThis.map((r) => r.note).join(','));
assert('上周仅含 9/27 一笔', inLast.length === 1, inLast.map((r) => r.note).join(','));
// 不重复：本周/上周交集为空
const overlap = inThis.filter((a) => inLast.some((b) => a.id === b.id));
assert('两个周期没有重复记录', overlap.length === 0);
assert('本周时长 18h', engine.totalInvested(inThis) === 18, String(engine.totalInvested(inThis)));
assert('上周时长 2h', engine.totalInvested(inLast) === 2);

// 任意历史日期（跨月，如 2026-02-01 周日）归入其所在周
const w = engine.weekOf(new Date(2026, 1, 1, 12));
assert('2026-02-01 所在周起于 2026-01-26', engine.dayKeyOf(w.start) === '2026-01-26', engine.dayKeyOf(w.start));

// 排序：按日期倒序，同日按录入时间倒序
const sorted = engine.sortRecordsByDateDesc(localRecs);
const keys = sorted.map(engine.recordDayKey);
assert('流水严格按日期倒序', keys.every((k, i) => i === 0 || keys[i - 1] >= k), keys.join(','));

// dayKey 往返：正午存储不受时区偏移影响
const iso = engine.dayKeyToIso('2026-01-15');
assert('日期标识往返一致', engine.recordDayKey({ date: iso }) === '2026-01-15', engine.recordDayKey({ date: iso }));

// 示例数据同时覆盖两个账期
const snap = engine.sampleSnapshot();
const sampleThis = engine.recordsWithin(snap.records, engine.currentWeek());
const sampleLast = engine.recordsWithin(snap.records, engine.previousWeek());
assert('示例数据本周有记录', sampleThis.length >= 1);
assert('示例数据上周有记录', sampleLast.length >= 1);
assert('示例记录总数不变', snap.records.length === 6);

// 周范围文案
assert('本周范围文案 9/28 — 10/4', engine.formatWeekRange(cw) === '9/28 — 10/4', engine.formatWeekRange(cw));

process.exit(failures ? 1 : 0);
