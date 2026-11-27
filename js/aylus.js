// 从 aylus.org（WordPress）实时读取 Syosset-Woodbury 篮球活动报告和照片。
// 每次打开网站都会读取最新文章，所以 AYLUS 上新发的报告会自动出现。
const API = 'https://aylus.org/wp-json/wp/v2/posts';
export const START = '2025-10-04'; // 从第 14 次（2025-10-05 中秋野餐）开始
const CACHE_KEY = 'aylusPosts.v1', CACHE_MS = 20 * 60e3;

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const WORDS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth'];
const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y < 100 ? 2000 + y : y}-${pad(m)}-${pad(d)}`;

export function decode(html) { const t = document.createElement('textarea'); t.innerHTML = html; return t.value; }

// 活动日期：先看标题，再看正文开头，最后用发布日期
export function eventDate(title, text, postDate) {
  const year = Number(postDate.slice(0, 4));
  let m = title.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) return iso(+m[3], +m[1], +m[2]);
  const named = /(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i;
  for (const s of [title, text.slice(0, 300)]) {
    m = s.match(named);
    if (m) return iso(m[3] ? +m[3] : year, MONTHS[m[1].toLowerCase()], +m[2]);
  }
  return postDate.slice(0, 10);
}
// AYLUS 报告里写的“第几次”（只作参考，个别报告编号有重复）
export function eventNumber(title, text) {
  const w = WORDS.join('|');
  let m = title.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/i) || title.match(/#\s?(\d{1,2})\b/);
  if (m) return +m[1];
  m = title.toLowerCase().match(new RegExp(`\\b(${w})\\b`));
  if (m) return WORDS.indexOf(m[1]) + 1;
  const head = text.slice(0, 400).toLowerCase();
  m = head.match(/\b(?:its|our|the)\s+(\d{1,2})(?:st|nd|rd|th)\b/);
  if (m) return +m[1];
  m = head.match(new RegExp(`\\b(?:its|our|the)\\s+(${w})\\b`));
  return m ? WORDS.indexOf(m[1]) + 1 : null;
}

// 只保留安全的排版标签；图片单独收集
const KEEP = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'BR', 'BLOCKQUOTE']);
function clean(node) {
  let out = '';
  for (const n of node.childNodes) {
    if (n.nodeType === 3) { out += n.textContent.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); continue; }
    if (n.nodeType !== 1 || ['IMG', 'FIGURE', 'SCRIPT', 'STYLE', 'IFRAME', 'NOSCRIPT'].includes(n.tagName)) continue;
    const inner = clean(n);
    if (KEEP.has(n.tagName)) { const tag = n.tagName.toLowerCase(); out += tag === 'br' ? '<br>' : `<${tag}>${inner}</${tag}>`; }
    else out += inner;
  }
  return out;
}
function images(doc) {
  return [...doc.querySelectorAll('img')].map(img => {
    const full = img.getAttribute('src') || '';
    const set = (img.getAttribute('srcset') || '').split(',').map(x => x.trim().split(/\s+/)).filter(x => x[0] && /^\d+w$/.test(x[1] || '')).map(([u, w]) => ({ u, w: parseInt(w, 10) }));
    const thumb = set.filter(x => x.w >= 300).sort((a, b) => a.w - b.w)[0]?.u || full;
    return { full, thumb };
  }).filter(i => i.full.startsWith('https://'));
}

function parse(p) {
  const title = decode(p.title?.rendered || '');
  const doc = new DOMParser().parseFromString(p.content?.rendered || '', 'text/html');
  const text = doc.body.textContent.replace(/\s+/g, ' ').trim();
  const date = eventDate(title, text, p.date);
  return { id: p.id, link: p.link, posted: p.date.slice(0, 10), date, num: eventNumber(title, text), title: title || `Basketball event (${date})`, html: clean(doc.body), text, photos: images(doc) };
}
const relevant = p => !/volunteer hours/i.test(p.title) && /basketball/i.test(p.title + ' ' + p.text) && /syosset/i.test(p.text + p.title);

export async function loadAylus() {
  try { const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null'); if (c && Date.now() - c.at < CACHE_MS) return c.posts; } catch {}
  const posts = [];
  for (let page = 1; page <= 5; page++) {
    const r = await fetch(`${API}?search=Syosset-Woodbury&after=${START}T00:00:00&per_page=100&page=${page}&_fields=id,date,link,title,content`);
    if (!r.ok) break;
    const d = await r.json(); posts.push(...d);
    if (page >= Number(r.headers.get('x-wp-totalpages') || 1)) break;
  }
  const out = posts.map(parse).filter(relevant).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), posts: out })); } catch {}
  return out;
}

// 把同一天的多篇报告合并成一次活动
export function groupByDate(posts) {
  const m = new Map();
  for (const p of posts) { if (!m.has(p.date)) m.set(p.date, []); m.get(p.date).push(p); }
  return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, ps]) => ({ date, posts: ps, num: ps.find(p => p.num)?.num ?? null }));
}
