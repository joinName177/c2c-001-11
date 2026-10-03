import type { CategoryMetric, InvestmentRecord, TimeAccount, TimeCategory } from './models';
import { CATEGORIES, CATEGORY_META } from './models';

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

export function record(category: TimeCategory, hours: number, note: string, date = new Date().toISOString()): InvestmentRecord {
  return { id: `time-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, category, hours: Math.max(0.5, Number(hours) || 0.5), note: note.trim() || '未命名投资', date };
}

const DAY_MS = 86400000;

/** 本地时区周一 00:00，作为账期起点（周一为一周第一天） */
export function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

export function weekRange(date: Date): { start: Date; end: Date } {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

/** ISO-8601 周数，用于账期编号展示 */
export function isoWeekNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  target.setUTCDate(target.getUTCDate() - ((target.getUTCDay() + 6) % 7) + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
}

/** 记录日期距离当前账期相隔几周：0 = 本周，1 = 上周，以此类推 */
export function weeksAgo(date: Date, now = new Date()): number {
  return Math.round((startOfWeek(now).getTime() - startOfWeek(date).getTime()) / (7 * DAY_MS));
}

export interface WeekSummary {
  label: string;
  start: Date;
  end: Date;
  hours: number;
  budget: number;
}

function hoursInWeek(records: InvestmentRecord[], weekStart: Date): number {
  const startMs = weekStart.getTime();
  return records
    .filter((item) => startOfWeek(new Date(item.date)).getTime() === startMs)
    .reduce((sum, item) => sum + item.hours, 0);
}

/** 按记录实际发生日期归入本周 / 上周账期，每笔记录只计入一个周期 */
export function weeklySummaries(records: InvestmentRecord[], budget: number, now = new Date()): WeekSummary[] {
  const thisStart = startOfWeek(now);
  const lastStart = new Date(thisStart);
  lastStart.setDate(lastStart.getDate() - 7);
  return [
    { label: '本周', ...weekRange(now), hours: hoursInWeek(records, thisStart), budget },
    { label: '上周', ...weekRange(lastStart), hours: hoursInWeek(records, lastStart), budget },
  ];
}

/** `<input type="date">` 需要的本地 YYYY-MM-DD 值 */
export function toDateInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 把表单选择的日期转成本地正午的 ISO 时间，避免时区与夏令时让日期串天 */
export function dateInputToIso(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return new Date().toISOString();
  return new Date(year, month - 1, day, 12, 0, 0).toISOString();
}

export function sampleSnapshot() {
  const account: TimeAccount = { dailyHours: 8, weeklyHours: 56, updatedAt: new Date().toISOString() };
  const seed: Array<[TimeCategory, number, string, number]> = [
    ['事业', 16, '产品策略与交付', 1], ['学习', 10, '阅读与课程', 2], ['健康', 7, '力量训练与散步', 3],
    ['关系', 8, '家人和朋友', 7], ['休息', 9, '睡眠与留白', 8], ['娱乐', 4, '电影与游戏', 10],
  ];
  return { account, records: seed.map(([category, hours, note, daysBack]) => record(category, hours, note, new Date(Date.now() - daysBack * DAY_MS).toISOString())) };
}
