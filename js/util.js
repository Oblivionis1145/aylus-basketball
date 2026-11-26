// 纯函数工具：转义、日期、序数词、报告生成、名单排序。无依赖，方便测试。
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const WD = '日一二三四五六';
export function parseDate(d) { const [y, m, dd] = String(d).split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)); }
export function zhDate(d) { const t = parseDate(d); return `${t.getUTCFullYear()}年${t.getUTCMonth() + 1}月${t.getUTCDate()}日（周${WD[t.getUTCDay()]}）`; }
export function addDays(d, n) { const t = parseDate(d); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function enDate(d) { const t = parseDate(d); return `${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}, ${t.getUTCFullYear()}`; }
export function enDateLong(d) { return `${DAYS[parseDate(d).getUTCDay()]}, ${enDate(d)}`; }

const ONES = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth'];
const TENS_ORD = { 20: 'twentieth', 30: 'thirtieth', 40: 'fortieth', 50: 'fiftieth', 60: 'sixtieth', 70: 'seventieth', 80: 'eightieth', 90: 'ninetieth' };
const TENS = { 20: 'twenty', 30: 'thirty', 40: 'forty', 50: 'fifty', 60: 'sixty', 70: 'seventy', 80: 'eighty', 90: 'ninety' };
export function ordinal(n) {
  n = Number(n);
  if (n > 0 && n < 20) return ONES[n];
  if (n >= 20 && n < 100) { const t = Math.floor(n / 10) * 10, o = n % 10; return o ? `${TENS[t]}-${ONES[o]}` : TENS_ORD[t]; }
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
export const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);

// 名单按报名时间排序，分出正式名单与候补
export function splitRoster(signups, cap) {
  const all = [...signups].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id - b.id);
  return { confirmed: all.slice(0, cap), waitlist: all.slice(cap), all };
}

// 小时数显示：4 → "4"，2.5 → "2.5"
export const fmtHours = h => { const n = Number(h); return Number.isInteger(n) ? String(n) : n.toFixed(1); };

// 按 AYLUS 报告格式生成标题和正文
export function buildReport(ev, volunteers, { headcount = 0, highlight = '' } = {}) {
  const ord = ordinal(ev.round), year = String(ev.event_date).slice(0, 4);
  const title = `AYLUS Syosset Hosts ${cap1(ord).replace(/-(\w)/, (m, c) => '-' + c.toUpperCase())} Community Basketball Event of ${year} at Syosset-Woodbury Community Park (${enDate(ev.event_date)})`;
  const lines = [];
  lines.push(`On ${enDateLong(ev.event_date)}, AYLUS Syosset held its ${ord} community basketball event of ${year} at Syosset-Woodbury Community Park.${headcount ? ` ${headcount} young players signed up for the morning.` : ''}`);
  lines.push('');
  lines.push('The event followed this schedule:');
  lines.push('');
  lines.push('- 9:00–10:00 AM: Basic basketball training for all ages, followed by a group photo.');
  lines.push('- 10:00–11:00 AM: Group scrimmages for participants, while younger children enjoyed free play under parental supervision.');
  lines.push('- 11:00 AM–1:00 PM: An optional post-training gathering, where participants brought their own lunches and played logic and deduction games without electronic devices.');
  lines.push('');
  if (highlight.trim()) { lines.push(highlight.trim()); lines.push(''); }
  lines.push("The event aimed to reduce young people's screen time and encourage outdoor exercise and social interaction.");
  if (volunteers.length) {
    lines.push('');
    lines.push('Participants:');
    lines.push('');
    for (const v of volunteers) lines.push(`- ${v.name} – ${fmtHours(v.hours)} hour${Number(v.hours) === 1 ? '' : 's'}`);
  }
  return { title, body: lines.join('\n') };
}

// 从 NWS 预报里挑出活动当天白天的一段，并判断是否有雨雪
export function pickForecast(periods, date) {
  const p = periods.find(x => String(x.startTime).slice(0, 10) === date && x.isDaytime) || periods.find(x => String(x.startTime).slice(0, 10) === date);
  if (!p) return null;
  const text = `${p.shortForecast || ''} ${p.detailedForecast || ''}`;
  const wet = /rain|snow|shower|thunder|sleet|drizzle|flurr|storm/i.test(text);
  const pop = p.probabilityOfPrecipitation?.value ?? null;
  return { name: p.name, temp: p.temperature, unit: p.temperatureUnit, short: p.shortForecast, pop, wet: wet && (pop == null || pop >= 30) };
}
