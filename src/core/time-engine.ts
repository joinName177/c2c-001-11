import type { CategoryMetric, InvestmentRecord, TimeAccount, TimeCategory } from './models';
import { CATEGORIES, CATEGORY_META } from './models';

const WEEKDAY_CHARS = ['日', '一', '二', '三', '四', '五', '六'];
const DAY_MS = 86400000;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 本地日历日的 YYYY-MM-DD 标识，周归属全部基于本地日期计算 */
export function dayKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayKey(now: Date = new Date()): string {
  return dayKeyOf(now);
}

/** 把日期标识还原为当天本地正午，避免时区/夏令时把日期挪到相邻一天 */
export function parseDayKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1, 12, 0, 0);
}

/** 取一条记录实际发生的本地日期（兼容历史 ISO 字符串数据） */
export function recordDayKey(item: InvestmentRecord): string {
  const parsed = new Date(item.date);
  return Number.isNaN(parsed.getTime()) ? todayKey() : dayKeyOf(parsed);
}

/** 供 <input type="date"> 选定的日期生成稳定的存储时间 */
export function dayKeyToIso(key: string): string {
  return parseDayKey(key || todayKey()).toISOString();
}

export interface WeekRange {
  start: Date; // 周一 00:00（含）
  end: Date; // 下周一 00:00（不含），半开区间保证一条记录只归属一个周期
}

export function startOfWeek(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
  const offset = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - offset);
  return monday;
}

export function currentWeek(now: Date = new Date()): WeekRange {
  const start = startOfWeek(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

export function previousWeek(now: Date = new Date()): WeekRange {
  const current = currentWeek(now);
  const start = new Date(current.start);
  start.setDate(start.getDate() - 7);
  return { start, end: current.start };
}

/** 任意历史日期（含跨月）所在的周账期 */
export function weekOf(date: Date): WeekRange {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

/** 半开区间过滤：[start, end)，本周与上周互不重叠，不会重复计入 */
export function recordsWithin(records: InvestmentRecord[], range: WeekRange): InvestmentRecord[] {
  const from = range.start.getTime();
  const to = range.end.getTime();
  return records.filter((item) => {
    const day = parseDayKey(recordDayKey(item)).getTime();
    return day >= from && day < to;
  });
}

function recordCreatedAt(item: InvestmentRecord): number {
  const match = /^time-(\d+)-/.exec(item.id);
  return match ? Number(match[1]) : 0;
}

/** 流水按实际发生日期倒序；同一天内后录入的排前面 */
export function sortRecordsByDateDesc(records: InvestmentRecord[]): InvestmentRecord[] {
  return [...records].sort((a, b) => {
    const keyDiff = recordDayKey(b).localeCompare(recordDayKey(a));
    if (keyDiff !== 0) return keyDiff;
    return recordCreatedAt(b) - recordCreatedAt(a);
  });
}

export function formatWeekRange(range: WeekRange): string {
  const lastDay = new Date(range.end.getTime() - DAY_MS);
  return `${range.start.getMonth() + 1}/${range.start.getDate()} — ${lastDay.getMonth() + 1}/${lastDay.getDate()}`;
}

/** ISO 周序号，用于顶部账期展示 */
export function isoWeekNumber(date: Date): number {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil(((utc.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
}

export function formatLedgerDate(item: InvestmentRecord): string {
  const day = parseDayKey(recordDayKey(item));
  return `${day.getMonth() + 1}月${day.getDate()}日 周${WEEKDAY_CHARS[day.getDay()]}`;
}

export function totalInvested(records: InvestmentRecord[]): number {
  return records.reduce((sum, item) => sum + item.hours, 0);
}

export function metricsFor(records: InvestmentRecord[]): CategoryMetric[] {
  const total = totalInvested(records);
  return CATEGORIES.map((category) => {
    const hours = records.filter((item) => item.category === category).reduce((sum, item) => sum + item.hours, 0);
    const meta = CATEGORY_META[category];
    return { category, hours, share: total ? hours / total : 0, roi: meta.roi, color: meta.color, icon: meta.icon };
  });
}

export function portfolioScore(metrics: CategoryMetric[], account: TimeAccount): number {
  const invested = metrics.reduce((sum, item) => sum + item.hours * item.roi, 0);
  const available = Math.max(account.weeklyHours, 1);
  return Math.round((invested / available) * 10) / 10;
}

export function balanceSheet(metrics: CategoryMetric[], account: TimeAccount) {
  const assets = metrics.reduce((sum, item) => sum + item.hours * item.roi, 0);
  const invested = metrics.reduce((sum, item) => sum + item.hours, 0);
  return { assets: Math.round(assets * 10) / 10, liabilities: Math.max(0, Math.round((account.weeklyHours - invested) * 10) / 10), equity: Math.round((assets - Math.max(0, account.weeklyHours - invested)) * 10) / 10 };
}

export function suggestions(metrics: CategoryMetric[], account: TimeAccount): string[] {
  const total = Math.max(metrics.reduce((sum, item) => sum + item.hours, 0), 1);
  const lowest = [...metrics].sort((a, b) => a.hours - b.hours)[0];
  const highest = [...metrics].sort((a, b) => b.hours - a.hours)[0];
  const result: string[] = [];
  if (highest.share > 0.35) result.push(`「${highest.category}」占比 ${Math.round(highest.share * 100)}%，建议每周拿出 2 小时投向低配资产。`);
  if (lowest.share < 0.1) result.push(`「${lowest.category}」只有 ${Math.round(lowest.share * 100)}%，这是当前最值得补仓的长期资产。`);
  if (account.weeklyHours - total > 4) result.push(`还有 ${Math.round(account.weeklyHours - total)} 小时未被配置，可以先建立一笔“探索基金”。`);
  if (!result.length) result.push('你的时间组合分布稳定，继续用每周复盘保持动态平衡。');
  return result;
}

export function record(category: TimeCategory, hours: number, note: string, dateIso?: string): InvestmentRecord {
  return { id: `time-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, category, hours: Math.max(0.5, Number(hours) || 0.5), note: note.trim() || '未命名投资', date: dateIso ?? new Date().toISOString() };
}

export function sampleSnapshot() {
  const account: TimeAccount = { dailyHours: 8, weeklyHours: 56, updatedAt: new Date().toISOString() };
  // [类别, 小时, 备注, 相对今天的天数偏移]：同时覆盖本周与上周两个账期
  const seed: Array<[TimeCategory, number, string, number]> = [
    ['事业', 8, '产品策略与交付', 1], ['学习', 5, '阅读与课程', 3], ['健康', 3.5, '力量训练与散步', 0],
    ['关系', 8, '家人和朋友', 5], ['休息', 6, '睡眠与留白', 8], ['娱乐', 4, '电影与游戏', 9],
  ];
  return { account, records: seed.map(([category, hours, note, offset]) => record(category, hours, note, new Date(Date.now() - offset * DAY_MS).toISOString())) };
}
