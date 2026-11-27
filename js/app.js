import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, PARK } from './config.js';
import { esc, addDays, splitRoster, buildReport, pickForecast, fmtHours } from './util.js';
import { t, lang, setLang, fmtDate } from './i18n.js';
import { loadAylus, groupByDate } from './aylus.js';

const $ = id => document.getElementById(id);
const app = $('app');
const configured = !(SUPABASE_URL.includes('YOUR-PROJECT') || SUPABASE_ANON_KEY.startsWith('YOUR'));
if (!configured) $('setupWarn').classList.remove('hidden');
const sb = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const S = { user: null, profile: null, isAdmin: false };
const TEAMS = { get A() { return t('teamA'); }, get B() { return t('teamB'); }, get T() { return t('teamT'); } };
const STATUS = { get ok() { return t('st_ok'); }, get tbd() { return t('st_tbd'); }, get cancel() { return t('st_cancel'); } };
const msg = (el, text, ok) => { el.textContent = text; el.className = 'msg ' + (ok ? 'ok' : 'err'); };
const errText = e => (e && (e.message || e.error_description)) || t('tryLater');

// ---------- 登录 ----------
async function loadSession() {
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  S.user = session?.user || null; S.profile = null; S.isAdmin = false;
  if (S.user) {
    const { data } = await sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle();
    S.profile = data; S.isAdmin = !!data?.is_admin;
  }
  renderAuth();
}
function renderAuth() {
  const box = $('authBox');
  $('navAdmin').classList.toggle('hidden', !S.isAdmin);
  if (!sb) { box.innerHTML = ''; return; }
  if (S.user) {
    box.innerHTML = `<span>${esc(S.profile?.display_name || S.user.email)}</span><button class="ghost sm" id="logout">${t('logout')}</button>`;
    $('logout').onclick = async () => { await sb.auth.signOut(); await loadSession(); route(); };
  } else {
    box.innerHTML = `<a href="#/login"><button class="sm">${t('login')}</button></a>`;
  }
}
function loginView() {
  app.innerHTML = `<section class="band"><div class="wrap card" style="max-width:460px">
    <h2>${t('loginTitle')}</h2>
    <p class="muted">${t('loginIntro')}</p>
    <form id="lf"><label for="lEmail">${t('email')}</label><input type="email" id="lEmail" required autocomplete="email" inputmode="email">
    <p><button id="lBtn">${t('sendLogin')}</button></p></form>
    <form id="cf" class="hidden"><label for="lCode">${t('code')}</label><input type="text" id="lCode" inputmode="numeric" autocomplete="one-time-code" maxlength="10">
    <p><button>${t('login')}</button></p></form>
    <div class="msg" id="lMsg"></div></div></section>`;
  let email = '';
  $('lf').onsubmit = async e => {
    e.preventDefault(); email = $('lEmail').value.trim(); if (!email) return;
    $('lBtn').disabled = true;
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    $('lBtn').disabled = false;
    if (error) return msg($('lMsg'), t('sendFail') + errText(error));
    msg($('lMsg'), t('sent'), true); $('cf').classList.remove('hidden');
  };
  $('cf').onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.auth.verifyOtp({ email, token: $('lCode').value.trim(), type: 'email' });
    if (error) return msg($('lMsg'), t('badCode') + errText(error));
    await loadSession(); location.hash = '#/';
  };
}

// ---------- 数据 ----------
async function currentEvent() {
  const today = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); // 美东大致日期
  let { data } = await sb.from('events').select('*').gte('event_date', today).order('event_date').limit(1);
  if (!data?.length) ({ data } = await sb.from('events').select('*').order('event_date', { ascending: false }).limit(1));
  return data?.[0] || null;
}
async function eventRoster(evId) {
  const [{ data: signups }, { data: teams }] = await Promise.all([
    sb.from('signups').select('*').eq('event_id', evId),
    sb.from('team_assignments').select('*'),
  ]);
  const tmap = Object.fromEntries((teams || []).map(t => [t.signup_id, t.team]));
  return { signups: signups || [], tmap };
}
async function forecast(date) {
  try {
    const p = await (await fetch(`https://api.weather.gov/points/${PARK.lat},${PARK.lon}`)).json();
    const f = await (await fetch(p.properties.forecast)).json();
    return pickForecast(f.properties.periods || [], date);
  } catch { return null; }
}

// ---------- 本周活动 ----------
const fullName = s => [s.first_name, s.last_name].filter(Boolean).join(' ').trim();
// 公开显示：全名（Preferred name）；没填 Preferred name 就只显示全名；旧报名没有全名时显示称呼
const showName = s => { const f = fullName(s); if (!f) return s.name; return s.name && s.name !== s.first_name && s.name !== f ? `${f}（${s.name}）` : f; };
function rosterRow(s, i, tmap) {
  const tr = t; let out = '';
  if (s.is_volunteer) out += `<span class="tag v">${tr('tagVol')}</span>`;
  if (s.join_after) out += `<span class="tag">${tr('tagAfter')}</span>`;
  if (S.isAdmin && s.no_photo) out += `<span class="tag np">${tr('tagNoPhoto')}</span>`;
  if (tmap[s.id]) out += `<span class="tag g">${esc(TEAMS[tmap[s.id]])}</span>`;
  return `<li><span class="no">${i}.</span><span class="nm">${esc(showName(s))}<small>${esc(tr('age', s.age))}</small></span><span class="tags">${out}</span></li>`;
}
async function homeView() {
  if (!sb) { app.innerHTML = staticInfo(); return; }
  const ev = await currentEvent();
  if (!ev) { app.innerHTML = `<section class="band"><div class="wrap"><h2>${t('noEvent')}</h2><p class="muted">${t('noEventSub')}</p></div></section>` + staticInfo(); return; }
  const { signups, tmap } = await eventRoster(ev.id);
  const { vols, confirmed, waitlist, all } = splitRoster(signups, ev.cap);
  const mine = all.filter(s => s.user_id === S.user?.id);
  const canSign = ev.signup_open && ev.status !== 'cancel';
  const byTeam = { A: [], B: [], T: [] }; [...vols, ...confirmed].forEach(s => tmap[s.id] && byTeam[tmap[s.id]].push(s));
  const hasTeams = Object.values(byTeam).some(a => a.length);
  app.innerHTML = `
  ${ev.status === 'cancel' ? `<div class="banner">${t('cancelled')}</div>` : ''}
  <section class="band hero"><svg class="court" viewBox="0 0 200 200" aria-hidden="true"><g fill="none" stroke="#fff" stroke-width="4"><circle cx="100" cy="100" r="90"/><path d="M100 10v180M10 100h180"/><path d="M36 36c30 30 30 98 0 128M164 36c-30 30-30 98 0 128"/></g></svg>
    <div class="wrap">
      <div class="round">${esc(t('roundLine', String(ev.event_date).slice(0, 4), ev.round))}</div>
      <h1>${esc(fmtDate(ev.event_date))}</h1>
      <p style="margin:0 0 16px"><span class="status ${esc(ev.status)}"><i></i>${esc(STATUS[ev.status] || STATUS.ok)}</span></p>
      <div class="facts">
        <div class="fact"><b>${t('time')}</b><span>${esc(ev.time_text)}</span></div>
        <div class="fact"><b>${t('place')}</b><span>${esc(lang === 'en' ? ev.location.replace('篮球场（11791）', 'basketball courts (11791)') : ev.location)}</span><br><a href="https://www.google.com/maps/search/?api=1&query=Syosset-Woodbury+Community+Park" target="_blank" rel="noopener">${t('map')}</a></div>
        <div class="fact"><b>${t('weather')}</b><span id="wx">${t('wxLoading')}</span><br><a href="https://forecast.weather.gov/MapClick.php?lat=${PARK.lat}&lon=${PARK.lon}" target="_blank" rel="noopener">${t('fullFc')}</a> · ${t('autoCancel')}</div>
      </div>
      ${ev.notice ? `<p style="margin:14px 0 0;font-weight:500">📢 ${esc(ev.notice)}</p>` : ''}
    </div></section>
  <section class="band"><div class="wrap stack2">
    <div class="card"><h2>${t('signUp')}</h2>
      ${!S.user ? `<p>${t('needLogin')}</p><a href="#/login"><button>${t('loginToSign')}</button></a>` :
      !canSign ? `<p class="muted">${ev.status === 'cancel' ? t('closedCancel') : t('closed')}</p>` : `
      <form id="sf" novalidate>
        <div class="row2"><div><label for="fFirst">${t('fFirst')}</label><input type="text" id="fFirst" maxlength="40" autocomplete="off"></div><div><label for="fLast">${t('fLast')}</label><input type="text" id="fLast" maxlength="40" autocomplete="off"></div></div>
        <div class="row2"><div><label for="fName">${t('fPref')}</label><input type="text" id="fName" maxlength="40" placeholder="${t('fPrefPh')}" autocomplete="off"></div>
        <div><label for="fAge">${t('fAge')}</label><input type="number" id="fAge" min="1" max="99" inputmode="numeric"></div></div>
        <label for="fType">${t('typeLabel')}</label><select id="fType"><option value="p">${t('typePlayer')}</option><option value="v">${t('typeVol')}</option></select>
        <label class="chk"><input type="checkbox" id="fAfter" checked>${t('fAfter')}</label>
        <label class="chk"><input type="checkbox" id="fNoPhoto">${t('fNoPhoto')}</label>
        <label class="chk"><input type="checkbox" id="fRules">${t('fRules')}</label>
        <button id="fBtn">${t('fBtn')}</button><div class="msg" id="fMsg"></div>
      </form>`}
      ${mine.length ? `<h3>${t('mine')}</h3><ul class="mine">${mine.map(s => { const vp = vols.indexOf(s) + 1, p = confirmed.indexOf(s) + 1, w = waitlist.indexOf(s) + 1; return `<li><span><b>${esc(showName(s))}</b> · ${vp ? t('vpos', vp) : p ? t('pos', p) : t('wpos', w)}</span><button class="ghost sm" data-del="${esc(s.id)}">${t('cancelSign')}</button></li>`; }).join('')}</ul><p class="muted">${t('multi')}</p>` : ''}
    </div>
    <div class="card"><div class="rhead"><h2>${t('volRoster')}（${vols.length}）</h2></div>
      <div class="muted">${t('volNote')}</div>
      ${vols.length ? `<ol class="roster">${vols.map((s, i) => rosterRow(s, i + 1, tmap)).join('')}</ol>` : `<p class="muted">${t('emptyVol')}</p>`}
    </div>
    <div class="card"><div class="rhead"><h2>${t('roster')}</h2>${all.length ? `<button class="ghost sm" id="copyList">${t('copyList')}</button>` : ''}</div>
      <div class="count">${confirmed.length}<small> / ${esc(ev.cap)} ${t('people')}</small></div>
      <div class="meter"><div style="width:${Math.min(100, confirmed.length / ev.cap * 100)}%"></div></div>
      <div class="muted">${t('rosterNote')}</div>
      ${all.length ? `<ol class="roster">${confirmed.map((s, i) => rosterRow(s, i + 1, tmap)).join('')}</ol>` : `<p class="muted">${t('emptyRoster')}</p>`}
      ${waitlist.length ? `<div class="wait">${t('waitlist')}</div><ol class="roster">${waitlist.map((s, i) => rosterRow(s, i + 1, tmap)).join('')}</ol>` : ''}
    </div>
  </div></section>
  <section class="band alt"><div class="wrap"><h2>${t('teams')}</h2>
    ${hasTeams ? `<div class="teams">${Object.keys(byTeam).filter(k => byTeam[k].length).map(k => `<div class="card"><h3 style="margin-top:0">${esc(TEAMS[k])}（${byTeam[k].length}）</h3><ul>${byTeam[k].map(s => `<li>${esc(showName(s))} ${esc(t('age', s.age))}${s.is_volunteer ? t('volMark') : ''}</li>`).join('')}</ul></div>`).join('')}</div>` : `<p class="muted">${t('noTeams')}</p>`}
  </div></section>
  ${staticInfo()}`;
  forecast(ev.event_date).then(w => {
    const el = $('wx'); if (!el) return;
    const note = ev.weather_note ? ev.weather_note + (lang === 'zh' ? '。' : '. ') : '';
    if (!w) { el.textContent = note || t('wxNone'); return; }
    el.textContent = `${note}${t('wxLine', w.short, w.temp, w.unit, w.pop)}${w.wet && ev.status === 'ok' ? t('wxWet') : ''}`;
  });
  const cl = $('copyList');
  if (cl) cl.onclick = async () => {
    const line = (x, i) => `${i}. ${showName(x)}，${x.age}${x.is_volunteer ? '（义工）' : ''}${x.join_after ? ' 参加' : ''}`;
    const txt = [`#接龙 ${t('roundLine', String(ev.event_date).slice(0, 4), ev.round)}`, `${fmtDate(ev.event_date)} ${ev.time_text}`, '', ...(vols.length ? [t('volRoster'), ...vols.map((x, i) => line(x, i + 1)), ''] : []), t('roster'), ...confirmed.map((x, i) => line(x, i + 1)), ...(waitlist.length ? ['', t('waitlist'), ...waitlist.map((x, i) => line(x, i + 1))] : []), '', location.origin + '/'].join('\n');
    try { await navigator.clipboard.writeText(txt); cl.textContent = t('copied'); } catch { cl.textContent = t('copyFail'); }
  };
  const sf = $('sf');
  if (sf) sf.onsubmit = async e => {
    e.preventDefault(); const m = $('fMsg');
    const first_name = $('fFirst').value.trim(), last_name = $('fLast').value.trim(), name = $('fName').value.trim() || first_name, age = parseInt($('fAge').value, 10);
    if (!first_name || !last_name) return msg(m, t('eFull')); if (!(age > 0 && age < 100)) return msg(m, t('eAge'));
    if (!$('fRules').checked) return msg(m, t('eRules'));
    $('fBtn').disabled = true;
    const { error } = await sb.from('signups').insert({ event_id: ev.id, first_name, last_name, name, age, is_volunteer: $('fType').value === 'v', join_after: $('fAfter').checked, no_photo: $('fNoPhoto').checked });
    if (error) { $('fBtn').disabled = false; return msg(m, error.code === '23505' ? t('eDup') : /first_name|last_name/.test(error.message || '') ? t('needMig3') : t('eSign') + errText(error)); }
    homeView();
  };
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = t('sure'); return; }
    b.disabled = true; const { error } = await sb.from('signups').delete().eq('id', b.dataset.del);
    if (error) { b.disabled = false; b.textContent = t('cancelFail'); return; } homeView();
  });
}
function staticInfo() {
  const li = arr => arr.map(x => `<li>${x}</li>`).join('');
  return `<section class="band"><div class="wrap"><h2>${t('sched')}</h2><ul class="sched">
    <li><time>9:00–10:00</time><div><b>${t('s1')}</b>${t('s1a')}<p>${t('s1b')}</p></div></li>
    <li><time>10:00–11:00</time><div><b>${t('s2')}</b>${t('s2a')}<p>${t('s2b')}</p></div></li>
    <li><time>11:00–13:00</time><div><b>${t('s3')}</b>${t('s3a')}<p>${t('s3b')}</p></div></li></ul></div></section>
  <section class="band alt"><div class="wrap info">
    <div><h2>${t('rules')}</h2><ul>${li(t('rulesL'))}</ul></div>
    <div><h2>${t('notes')}</h2><ul>${li(t('notesL'))}</ul></div>
    <div><h2>${t('bring')}</h2><ul>${li(t('bringL'))}</ul></div>
    <div><h2>${t('support')}</h2><p style="margin:0">${t('supportP')}</p><p class="muted">${t('supportN')}</p></div>
  </div><p class="wrap" style="margin-top:18px;font-weight:700">${t('agree')}</p></section>`;
}

// ---------- 照片墙与活动报告（本站 + aylus.org） ----------
const photoUrl = path => sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
// 把 aylus.org 的报告和本站的报告、照片按活动日期合并
async function loadArchive() {
  const [ay, own, ph] = await Promise.all([
    loadAylus().then(x => ({ ok: true, x }), () => ({ ok: false, x: [] })),
    sb.from('reports').select('id,title,body,published,event_id,events(event_date,round)').order('created_at', { ascending: false }),
    sb.from('photos').select('*,events(event_date,round)').order('created_at'),
  ]);
  const map = new Map();
  const get = date => { if (!map.has(date)) map.set(date, { date, num: null, aylus: [], own: [], photos: [] }); return map.get(date); };
  for (const g of groupByDate(ay.x)) { const e = get(g.date); e.num = g.num; e.aylus = g.posts; g.posts.forEach(p => p.photos.forEach(f => e.photos.push({ ...f, src: 'aylus', post: p.id }))); }
  for (const r of own.data || []) if (r.events) { const e = get(r.events.event_date); e.own.push(r); e.num ??= r.events.round; }
  for (const p of ph.data || []) { const d = p.events?.event_date || String(p.created_at).slice(0, 10); const e = get(d); if (p.events) e.num ??= p.events.round; const u = photoUrl(p.path); e.photos.push({ full: u, thumb: u, caption: p.caption, src: 'own' }); }
  return { ok: ay.ok, events: [...map.values()].sort((x, y) => y.date.localeCompare(x.date)) };
}
const evLabel = e => `${fmtDate(e.date)}${e.num ? ' · ' + t('nth', e.date.slice(0, 4), e.num) : ''}`;
const reportHref = e => e.aylus[0] ? `#/report/a${e.aylus[0].id}` : e.own[0] ? `#/report/${e.own[0].id}` : '';
function filterBar(events, f, withEvent) {
  const years = [...new Set(events.map(e => e.date.slice(0, 4)))];
  const months = [...new Set(events.filter(e => !f.y || e.date.startsWith(f.y)).map(e => e.date.slice(5, 7)))].sort();
  const evs = events.filter(e => (!f.y || e.date.startsWith(f.y)) && (!f.m || e.date.slice(5, 7) === f.m));
  return `<div class="filters">
    <label>${t('fYear')}<select id="fy"><option value="">${t('all')}</option>${years.map(y => `<option${f.y === y ? ' selected' : ''}>${y}</option>`).join('')}</select></label>
    <label>${t('fMonth')}<select id="fm"><option value="">${t('all')}</option>${months.map(m => `<option value="${m}"${f.m === m ? ' selected' : ''}>${esc(t('monthName', +m))}</option>`).join('')}</select></label>
    ${withEvent ? `<label>${t('fEvent')}<select id="fe"><option value="">${t('all')}</option>${evs.map(e => `<option value="${e.date}"${f.e === e.date ? ' selected' : ''}>${esc(evLabel(e))}</option>`).join('')}</select></label>` : ''}
  </div>`;
}
function applyFilter(events, f) { return events.filter(e => (!f.y || e.date.startsWith(f.y)) && (!f.m || e.date.slice(5, 7) === f.m) && (!f.e || e.date === f.e)); }
function bindFilter(f, rerender) {
  $('fy').onchange = () => { f.y = $('fy').value; f.m = ''; f.e = ''; rerender(); };
  $('fm').onchange = () => { f.m = $('fm').value; f.e = ''; rerender(); };
  if ($('fe')) $('fe').onchange = () => { f.e = $('fe').value; rerender(); };
}
function lightbox(list, i) {
  const lb = document.createElement('div'); lb.className = 'lightbox'; lb.tabIndex = -1;
  const show = () => { const p = list[i]; lb.innerHTML = `<button class="lb-btn lb-prev" aria-label="prev">‹</button><figure><img src="${esc(p.full)}" alt="${esc(p.caption || t('photoAlt'))}"><figcaption>${esc(p.label || '')} · ${i + 1}/${list.length}</figcaption></figure><button class="lb-btn lb-next" aria-label="next">›</button><button class="lb-btn lb-close" aria-label="close">×</button>`; };
  const go = d => { i = (i + d + list.length) % list.length; show(); };
  lb.onclick = e => { if (e.target.closest('.lb-prev')) go(-1); else if (e.target.closest('.lb-next')) go(1); else if (!e.target.closest('img')) lb.remove(); };
  lb.onkeydown = e => { if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'Escape') lb.remove(); };
  show(); document.body.append(lb); lb.focus();
}
const photoFilter = { y: '', m: '', e: '' };
async function photosView() {
  app.innerHTML = `<section class="band"><div class="wrap"><h2>${t('photos')}</h2><p class="muted">${t('loadingArchive')}</p></div></section>`;
  const { ok, events } = await loadArchive();
  const all = events.filter(e => e.photos.length);
  const render = () => {
    const shown = applyFilter(all, photoFilter);
    const flat = []; shown.forEach(e => e.photos.forEach(p => flat.push({ ...p, label: evLabel(e) })));
    let k = 0;
    app.innerHTML = `<section class="band"><div class="wrap"><h2>${t('photos')}</h2>
      <p class="muted">${t('photosIntro')}${ok ? '' : ' ' + t('aylusDown')}</p>
      ${filterBar(all, photoFilter, true)}
      <p class="muted">${esc(t('photoCount', shown.length, flat.length))}</p>
      ${shown.length ? shown.map(e => `<div class="evgroup"><h3>${esc(evLabel(e))}${reportHref(e) ? ` <a class="sm-link" href="${reportHref(e)}">${t('readReport')}</a>` : ''}</h3>
        <div class="gallery">${e.photos.map(p => `<figure><img loading="lazy" data-i="${k++}" src="${esc(p.thumb)}" alt="${esc(p.caption || t('photoAlt'))}">${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}</figure>`).join('')}</div></div>`).join('') : `<p class="muted">${t('noPhotos')}</p>`}
    </div></section>`;
    bindFilter(photoFilter, render);
    app.querySelectorAll('.gallery img').forEach(img => img.onclick = () => lightbox(flat, +img.dataset.i));
  };
  render();
}

const reportFilter = { y: '', m: '', e: '' };
async function reportsView() {
  app.innerHTML = `<section class="band"><div class="wrap"><h2>${t('reports')}</h2><p class="muted">${t('loadingArchive')}</p></div></section>`;
  const { ok, events } = await loadArchive();
  const all = events.filter(e => e.aylus.length || e.own.length);
  const render = () => {
    const shown = applyFilter(all, reportFilter);
    app.innerHTML = `<section class="band"><div class="wrap"><h2>${t('reports')}</h2>
      <p class="muted">${t('reportsIntro')}${ok ? '' : ' ' + t('aylusDown')}</p>
      ${filterBar(all, reportFilter, false)}
      ${shown.length ? `<ul class="list reps">${shown.map(e => {
        const items = [...e.aylus.map(p => ({ href: `#/report/a${p.id}`, title: p.title, tag: 'AYLUS' })), ...e.own.filter(r => r.published || S.isAdmin).map(r => ({ href: `#/report/${r.id}`, title: r.title, tag: r.published ? t('ownSite') : t('draft') }))];
        return `<li>${e.photos[0] ? `<img src="${esc(e.photos[0].thumb)}" alt="" loading="lazy">` : '<span></span>'}<div><div class="muted">${esc(evLabel(e))}</div>${items.map(i => `<div><a href="${i.href}">${esc(i.title)}</a> <span class="tag">${esc(i.tag)}</span></div>`).join('')}</div></li>`;
      }).join('')}</ul>` : `<p class="muted">${t('noReports')}</p>`}
    </div></section>`;
    bindFilter(reportFilter, render);
  };
  render();
}
async function reportView(id) {
  if (String(id).startsWith('a')) {
    const posts = await loadAylus().catch(() => []);
    const p = posts.find(x => String(x.id) === id.slice(1));
    if (!p) { app.innerHTML = `<section class="band"><div class="wrap"><p>${t('noReport')}</p><p><a href="#/reports">${t('allReports')}</a></p></div></section>`; return; }
    const pics = p.photos.map(f => ({ ...f, label: p.title }));
    app.innerHTML = `<section class="band"><div class="wrap report"><p><a href="#/reports">${t('allReports')}</a></p>
      <div class="muted">${esc(fmtDate(p.date))}${p.num ? ' · ' + esc(t('nth', p.date.slice(0, 4), p.num)) : ''} · <a href="${esc(p.link)}" target="_blank" rel="noopener">${t('onAylus')}</a></div>
      <h1 style="font-size:clamp(24px,4vw,34px)">${esc(p.title)}</h1>
      <div class="rich">${p.html}</div>
      ${pics.length ? `<div class="gallery" style="margin-top:20px">${pics.map((f, i) => `<figure><img loading="lazy" data-i="${i}" src="${esc(f.thumb)}" alt="${t('photoAlt')}"></figure>`).join('')}</div>` : ''}
    </div></section>`;
    app.querySelectorAll('.gallery img').forEach(img => img.onclick = () => lightbox(pics, +img.dataset.i));
    return;
  }
  const { data: r } = await sb.from('reports').select('*').eq('id', id).maybeSingle();
  if (!r) { app.innerHTML = `<section class="band"><div class="wrap"><p>${t('noReport')}</p></div></section>`; return; }
  const { data: photos } = r.event_id ? await sb.from('photos').select('*').eq('event_id', r.event_id) : { data: [] };
  const pics = (photos || []).map(p => ({ full: photoUrl(p.path), thumb: photoUrl(p.path), label: r.title }));
  app.innerHTML = `<section class="band"><div class="wrap report"><p><a href="#/reports">${t('allReports')}</a></p>
    <h1 style="font-size:clamp(24px,4vw,34px)">${esc(r.title)}</h1>
    <div class="body">${esc(r.body)}</div>
    ${pics.length ? `<div class="gallery" style="margin-top:20px">${pics.map((f, i) => `<figure><img loading="lazy" data-i="${i}" src="${esc(f.thumb)}" alt="${t('photoAlt')}"></figure>`).join('')}</div>` : ''}
    <p><button class="ghost" id="copyR">${t('copyAll')}</button> <span class="msg" id="cMsg"></span></p>
  </div></section>`;
  app.querySelectorAll('.gallery img').forEach(img => img.onclick = () => lightbox(pics, +img.dataset.i));
  $('copyR').onclick = async () => { try { await navigator.clipboard.writeText(`${r.title}\n\n${r.body}`); msg($('cMsg'), t('copied'), true); } catch { msg($('cMsg'), t('copyFail')); } };
}

// ---------- 义工时长 ----------
async function hoursView() {
  const { data: board } = await sb.rpc('volunteer_leaderboard');
  let mineHtml = `<p>${t('loginHours')}</p><a href="#/login"><button>${t('login')}</button></a>`;
  if (S.user) {
    const { data: mine } = await sb.from('volunteer_hours').select('hours,signups!inner(name,user_id,events(event_date,round))').eq('signups.user_id', S.user.id);
    const rows = (mine || []).sort((a, b) => String(b.signups.events?.event_date).localeCompare(String(a.signups.events?.event_date)));
    const total = rows.reduce((t, r) => t + Number(r.hours), 0);
    mineHtml = rows.length ? `<div class="big">${esc(t('hrs', fmtHours(total)))}</div><p class="muted">${t('times', rows.length)}</p>
      <table><thead><tr><th>${t('colEvent')}</th><th>${t('colName')}</th><th class="num">${t('colHours')}</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(t('roundDate', r.signups.events?.round, r.signups.events?.event_date))}</td><td>${esc(r.signups.name)}</td><td class="num">${esc(t('hrs', fmtHours(r.hours)))}</td></tr>`).join('')}</tbody></table>`
      : `<p class="muted">${t('noMine')}</p>`;
  }
  app.innerHTML = `<section class="band"><div class="wrap grid">
    <div class="card"><h2>${t('board')}</h2>${board?.length ? `<table><thead><tr><th class="num">#</th><th>${t('colVol')}</th><th class="num">${t('colTimes')}</th><th class="num">${t('colTotal')}</th></tr></thead><tbody>${board.map((b, i) => `<tr><td class="num">${i + 1}</td><td>${esc(b.name)}</td><td class="num">${esc(b.events)}</td><td class="num">${esc(t('hrs', fmtHours(b.total_hours)))}</td></tr>`).join('')}</tbody></table>` : `<p class="muted">${t('noBoard')}</p>`}</div>
    <div class="card"><h2>${t('myHours')}</h2>${mineHtml}</div>
  </div><p class="wrap muted">${t('hoursNote')}</p></section>`;
}

// ---------- 后台 ----------
async function adminView() {
  if (!S.isAdmin) { app.innerHTML = `<section class="band"><div class="wrap"><p>${t('adminOnly')}</p></div></section>`; return; }
  const { data: events } = await sb.from('events').select('*').order('event_date', { ascending: false });
  const cur = await currentEvent();
  const selId = Number(sessionStorage.getItem('adminEv')) || cur?.id || events?.[0]?.id;
  const ev = (events || []).find(e => e.id === selId) || events?.[0];
  if (!ev) {
    app.innerHTML = `<section class="band"><div class="wrap card"><h2>${t('firstEvent')}</h2><label for="nDate">${t('date')}</label><input type="date" id="nDate"><label for="nRound">${t('round')}</label><input type="number" id="nRound" value="1"><p><button id="nBtn">${t('create')}</button></p><div class="msg" id="nMsg"></div></div></section>`;
    $('nBtn').onclick = async () => { const { error } = await sb.from('events').insert({ event_date: $('nDate').value, round: +$('nRound').value }); error ? msg($('nMsg'), errText(error)) : adminView(); };
    return;
  }
  const { signups, tmap } = await eventRoster(ev.id);
  const { vols, players, confirmed, all } = splitRoster(signups, ev.cap);
  const { data: hrs } = await sb.from('volunteer_hours').select('*').in('signup_id', all.map(s => s.id).concat([0]));
  const hmap = Object.fromEntries((hrs || []).map(h => [h.signup_id, h.hours]));
  const { data: allHrs } = await sb.from('volunteer_hours').select('hours,signups!inner(user_id,name)');
  const vkey = x => `${x.user_id}|${String(x.name).trim().toLowerCase()}`;
  const totals = {}; (allHrs || []).forEach(h => { const k = vkey(h.signups); totals[k] = (totals[k] || 0) + Number(h.hours); });
  const { data: rep } = await sb.from('reports').select('*').eq('event_id', ev.id).maybeSingle();
  const { data: photos } = await sb.from('photos').select('*').eq('event_id', ev.id);

  const adminRow = (s, i, arr, wait) => `<div class="admin-row"><span class="no" style="font-weight:700;color:var(--or)">${i + 1}</span>
        <span><b>${esc(showName(s))}</b> <span class="muted">${esc(t('age', s.age))}</span>${s.join_after ? ` <span class="tag">${t('tagAfter')}</span>` : ''}${s.no_photo ? ` <span class="tag np">${t('tagNoPhoto')}</span>` : ''}${wait ? ` <span class="tag">${t('waitlist')}</span>` : ''}</span>
        <select data-team="${s.id}" aria-label="${t('teams')}"><option value="">${t('unassigned')}</option>${Object.entries(TEAMS).map(([k, v]) => `<option value="${k}"${tmap[s.id] === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
        ${s.is_volunteer ? `<span class="hrs"><label class="hrs-l">${t('weekHours')}<input type="number" step="0.5" min="0" max="24" data-hours="${s.id}" value="${hmap[s.id] != null ? esc(hmap[s.id]) : ''}" placeholder="—"></label><span class="hrs-t">${t('totalHours')}<b>${esc(fmtHours(totals[vkey(s)] || 0))}</b></span></span>` : '<span></span>'}
        <span class="wide" style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="ghost sm" data-mv="${s.id}" data-to="${arr[i - 1]?.id ?? ''}" aria-label="${t('up')}"${i ? '' : ' disabled'}>↑</button>
          <button class="ghost sm" data-mv="${s.id}" data-to="${arr[i + 1]?.id ?? ''}" aria-label="${t('down')}"${i < arr.length - 1 ? '' : ' disabled'}>↓</button>
          <button class="ghost sm" data-ed="${s.id}">${t('edit')}</button>
          <button class="ghost sm" data-rm="${s.id}">${t('remove')}</button></span></div>
      <div class="admin-edit hidden" id="ed${s.id}">
        <div class="row2"><div><label>${t('fFirst')}<input type="text" data-f="first" value="${esc(s.first_name || '')}" maxlength="40"></label></div><div><label>${t('fLast')}<input type="text" data-f="last" value="${esc(s.last_name || '')}" maxlength="40"></label></div></div>
        <div class="row2"><div><label>${t('fPref')}<input type="text" data-f="name" value="${esc(s.name)}" maxlength="40"></label></div><div><label>${t('fAge')}<input type="number" data-f="age" value="${esc(s.age)}" min="1" max="99"></label></div></div>
        <label>${t('typeLabel')}<select data-f="type"><option value="p"${s.is_volunteer ? '' : ' selected'}>${t('typePlayer')}</option><option value="v"${s.is_volunteer ? ' selected' : ''}>${t('typeVol')}</option></select></label>
        <label class="chk"><input type="checkbox" data-f="after"${s.join_after ? ' checked' : ''}>${t('fAfter')}</label>
        <label class="chk"><input type="checkbox" data-f="nophoto"${s.no_photo ? ' checked' : ''}>${t('fNoPhoto')}</label>
        <p><button class="sm" data-sv="${s.id}">${t('saveRow')}</button> <button class="ghost sm" data-ed="${s.id}">${t('cancel')}</button></p></div>`;
  app.innerHTML = `<section class="band"><div class="wrap">
    <h2>${t('admin')}</h2>
    <div class="card"><label for="aPick">${t('managing')}</label><select id="aPick">${events.map(e => `<option value="${e.id}"${e.id === ev.id ? ' selected' : ''}>${esc(t('roundDate', e.round, e.event_date))}</option>`).join('')}</select>
      <p><button class="ghost" id="aNext">${esc(t('newNext', addDays(events[0].event_date, 7)))}</button></p><div class="msg" id="nMsg"></div></div>

    <h3>${t('evInfo')}</h3><div class="card">
      <div class="row2"><div><label for="aDate">${t('date')}</label><input type="date" id="aDate" value="${esc(ev.event_date)}"></div><div><label for="aRound">${t('round')}</label><input type="number" id="aRound" value="${esc(ev.round)}"></div></div>
      <div class="row2"><div><label for="aTime">${t('time')}</label><input type="text" id="aTime" value="${esc(ev.time_text)}"></div><div><label for="aCap">${t('cap')}</label><input type="number" id="aCap" value="${esc(ev.cap)}"></div></div>
      <label for="aLoc">${t('place')}</label><input type="text" id="aLoc" value="${esc(ev.location)}">
      <label for="aStatus">${t('status')}</label><select id="aStatus">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${ev.status === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
      <label for="aWx">${t('wxNote')}</label><input type="text" id="aWx" value="${esc(ev.weather_note)}" maxlength="100">
      <label for="aNotice">${t('notice')}</label><input type="text" id="aNotice" value="${esc(ev.notice)}" maxlength="300">
      <label class="chk"><input type="checkbox" id="aOpen"${ev.signup_open ? ' checked' : ''}>${t('open')}</label>
      <p><button id="aSave">${t('saveEv')}</button></p><div class="msg" id="aMsg"></div></div>

    <h3>${t('listTitle')}</h3><div class="card">
      <p class="muted">${t('listNote')}</p>
      <h3>${esc(t('listVols', vols.length))}</h3>${vols.map((s, i, arr) => adminRow(s, i, arr, false)).join('') || `<p class="muted">${t('emptyVol')}</p>`}
      <h3>${esc(t('listPlayers', players.length, ev.cap))}</h3>${players.map((s, i, arr) => adminRow(s, i, arr, i >= ev.cap)).join('') || `<p class="muted">${t('noneYet')}</p>`}
      <p><button class="ghost" id="aAuto">${t('autoTeams')}</button> <button class="ghost" id="aFill">${t('fill4')}</button> <button id="aSaveL">${t('saveList')}</button></p>
      <div class="msg" id="lMsg"></div></div>
    <details class="card" style="margin-top:12px"><summary><b>${t('addFor')}</b></summary>
      <div class="row2"><div><label for="adFirst">${t('fFirst')}</label><input type="text" id="adFirst" maxlength="40"></div><div><label for="adLast">${t('fLast')}</label><input type="text" id="adLast" maxlength="40"></div></div>
      <div class="row2"><div><label for="adName">${t('fPref')}</label><input type="text" id="adName" maxlength="40" placeholder="${t('fPrefPh')}"></div><div><label for="adAge">${t('fAge')}</label><input type="number" id="adAge" min="1" max="99"></div></div>
      <label for="adType">${t('typeLabel')}</label><select id="adType"><option value="p">${t('typePlayer')}</option><option value="v">${t('typeVol')}</option></select>
      <label class="chk"><input type="checkbox" id="adAfter" checked>${t('fAfter')}</label>
      <label class="chk"><input type="checkbox" id="adNoPhoto">${t('fNoPhoto')}</label>
      <p><button id="adBtn">${t('add')}</button></p><div class="msg" id="adMsg"></div></details>

    <h3>${t('photosN', photos?.length || 0)}</h3><div class="card">
      <p class="muted">${t('photoNote')}</p>
      <input type="file" id="aFiles" accept="image/*" multiple>
      <p><button id="aUp">${t('upload')}</button></p><div class="msg" id="uMsg"></div>
      <div class="gallery">${(photos || []).map(p => `<figure><img src="${esc(photoUrl(p.path))}" alt=""><figcaption><button class="ghost sm" data-ph="${p.id}" data-path="${esc(p.path)}">${t('del')}</button></figcaption></figure>`).join('')}</div></div>

    <h3>${t('repTitle')}</h3><div class="card">
      <p class="muted">${t('repNote')}</p>
      <label for="rHi">${t('highlight')}</label><input type="text" id="rHi" maxlength="300">
      <p><button class="ghost" id="rGen">${t('gen')}</button></p>
      <label for="rTitle">${t('title')}</label><input type="text" id="rTitle" value="${esc(rep?.title || '')}">
      <label for="rBody">${t('body')}</label><textarea id="rBody" rows="16">${esc(rep?.body || '')}</textarea>
      <label class="chk"><input type="checkbox" id="rPub"${rep?.published ? ' checked' : ''}>${t('publish')}</label>
      <p><button id="rSave">${t('saveRep')}</button> <button class="ghost" id="rCopy">${t('copyBtn')}</button></p><div class="msg" id="rMsg"></div></div>
  </div></section>`;

  $('aPick').onchange = () => { sessionStorage.setItem('adminEv', $('aPick').value); adminView(); };
  $('aNext').onclick = async () => {
    const last = events[0];
    const { data, error } = await sb.from('events').insert({ event_date: addDays(last.event_date, 7), round: last.round + 1, cap: last.cap, time_text: last.time_text, location: last.location }).select().single();
    if (error) return msg($('nMsg'), errText(error)); sessionStorage.setItem('adminEv', data.id); adminView();
  };
  $('aSave').onclick = async () => {
    const { error } = await sb.from('events').update({ event_date: $('aDate').value, round: +$('aRound').value, time_text: $('aTime').value.trim(), cap: +$('aCap').value || 15, location: $('aLoc').value.trim(), status: $('aStatus').value, weather_note: $('aWx').value.trim(), notice: $('aNotice').value.trim(), signup_open: $('aOpen').checked }).eq('id', ev.id);
    error ? msg($('aMsg'), errText(error)) : msg($('aMsg'), t('saved'), true);
  };
  $('aAuto').onclick = () => {
    const big = [...vols, ...confirmed.filter(s => s.age >= 6)].sort((a, b) => b.is_volunteer - a.is_volunteer || b.age - a.age);
    big.forEach((s, i) => { app.querySelector(`[data-team="${s.id}"]`).value = [0, 3].includes(i % 4) ? 'A' : 'B'; });
    confirmed.filter(s => s.age < 6).forEach(s => { app.querySelector(`[data-team="${s.id}"]`).value = 'T'; });
    msg($('lMsg'), t('autoDone'), true);
  };
  $('aFill').onclick = () => all.filter(s => s.is_volunteer).forEach(s => { const el = app.querySelector(`[data-hours="${s.id}"]`); if (!el.value) el.value = 4; });
  $('aSaveL').onclick = async () => {
    const teamUp = [], teamDel = [], hUp = [], hDel = [];
    app.querySelectorAll('[data-team]').forEach(el => { const id = +el.dataset.team; el.value ? teamUp.push({ signup_id: id, team: el.value }) : tmap[id] && teamDel.push(id); });
    app.querySelectorAll('[data-hours]').forEach(el => { const id = +el.dataset.hours; el.value !== '' ? hUp.push({ signup_id: id, hours: Number(el.value), updated_at: new Date().toISOString() }) : hmap[id] != null && hDel.push(id); });
    const ops = [];
    if (teamUp.length) ops.push(sb.from('team_assignments').upsert(teamUp));
    if (teamDel.length) ops.push(sb.from('team_assignments').delete().in('signup_id', teamDel));
    if (hUp.length) ops.push(sb.from('volunteer_hours').upsert(hUp));
    if (hDel.length) ops.push(sb.from('volunteer_hours').delete().in('signup_id', hDel));
    const res = await Promise.all(ops); const bad = res.find(r => r.error);
    bad ? msg($('lMsg'), errText(bad.error)) : msg($('lMsg'), t('saved'), true);
  };
  const byId = Object.fromEntries(all.map(x => [x.id, x]));
  app.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => $('ed' + b.dataset.ed).classList.toggle('hidden'));
  app.querySelectorAll('[data-sv]').forEach(b => b.onclick = async () => {
    const box = $('ed' + b.dataset.sv), f = k => box.querySelector(`[data-f="${k}"]`);
    const first_name = f('first').value.trim(), last_name = f('last').value.trim(), name = f('name').value.trim() || first_name, age = parseInt(f('age').value, 10);
    if (!name) return msg($('lMsg'), t('eName')); if (!(age > 0 && age < 100)) return msg($('lMsg'), t('eAge'));
    b.disabled = true;
    const { error } = await sb.from('signups').update({ first_name, last_name, name, age, is_volunteer: f('type').value === 'v', join_after: f('after').checked, no_photo: f('nophoto').checked }).eq('id', b.dataset.sv);
    if (error) { b.disabled = false; return msg($('lMsg'), error.code === '23505' ? t('eDup') : errText(error)); }
    adminView();
  });
  app.querySelectorAll('[data-mv]').forEach(b => b.onclick = async () => {
    const a = byId[b.dataset.mv], c = byId[b.dataset.to]; if (!a || !c) return;
    let ta = c.created_at, tc = a.created_at;
    if (ta === tc) { const d = new Date(new Date(ta).getTime() + (a.id < c.id ? 1 : -1)); tc = d.toISOString(); }
    b.disabled = true;
    const r1 = await sb.from('signups').update({ created_at: ta }).eq('id', a.id);
    const r2 = r1.error ? r1 : await sb.from('signups').update({ created_at: tc }).eq('id', c.id);
    const err = r1.error || r2.error;
    if (err) return msg($('lMsg'), errText(err));
    const { data: chk } = await sb.from('signups').select('created_at').eq('id', a.id).single();
    if (chk && chk.created_at === a.created_at) return msg($('lMsg'), t('needMigration'));
    adminView();
  });
  $('adBtn').onclick = async () => {
    const first_name = $('adFirst').value.trim(), last_name = $('adLast').value.trim(), name = $('adName').value.trim() || first_name, age = parseInt($('adAge').value, 10);
    if (!name) return msg($('adMsg'), t('eName')); if (!(age > 0 && age < 100)) return msg($('adMsg'), t('eAge'));
    $('adBtn').disabled = true;
    const { error } = await sb.from('signups').insert({ event_id: ev.id, first_name, last_name, name, age, is_volunteer: $('adType').value === 'v', join_after: $('adAfter').checked, no_photo: $('adNoPhoto').checked });
    if (error) { $('adBtn').disabled = false; return msg($('adMsg'), error.code === '23505' ? t('eDup') : errText(error)); }
    adminView();
  };
  app.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = t('sureShort'); return; }
    const { error } = await sb.from('signups').delete().eq('id', b.dataset.rm); error ? msg($('lMsg'), errText(error)) : adminView();
  });
  $('aUp').onclick = async () => {
    const files = [...$('aFiles').files]; if (!files.length) return msg($('uMsg'), t('pickFirst'));
    $('aUp').disabled = true; let n = 0;
    for (const f of files) {
      const path = `${ev.event_date}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${(f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      const up = await sb.storage.from('photos').upload(path, f, { contentType: f.type });
      if (up.error) { msg($('uMsg'), t('upFail', n + 1, errText(up.error))); break; }
      await sb.from('photos').insert({ event_id: ev.id, path }); n++; msg($('uMsg'), t('upProg', n, files.length), true);
    }
    $('aUp').disabled = false; if (n === files.length) adminView();
  };
  app.querySelectorAll('[data-ph]').forEach(b => b.onclick = async () => {
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = t('sureDel'); return; }
    await sb.storage.from('photos').remove([b.dataset.path]); await sb.from('photos').delete().eq('id', b.dataset.ph); adminView();
  });
  $('rGen').onclick = async () => {
    const { data: h2 } = await sb.from('volunteer_hours').select('*').in('signup_id', all.map(s => s.id).concat([0]));
    const hm = Object.fromEntries((h2 || []).map(h => [h.signup_id, h.hours]));
    const vols = all.filter(s => hm[s.id] != null && Number(hm[s.id]) > 0).map(s => ({ name: fullName(s) || s.name, hours: hm[s.id] }));
    const r = buildReport(ev, vols, { headcount: confirmed.length, highlight: $('rHi').value });
    $('rTitle').value = r.title; $('rBody').value = r.body;
    msg($('rMsg'), vols.length ? t('genOk') : t('genNoVol'), !!vols.length);
  };
  $('rSave').onclick = async () => {
    const row = { event_id: ev.id, title: $('rTitle').value.trim(), body: $('rBody').value, published: $('rPub').checked, updated_at: new Date().toISOString() };
    if (!row.title || !row.body.trim()) return msg($('rMsg'), t('needTB'));
    const { error } = await sb.from('reports').upsert(row, { onConflict: 'event_id' });
    error ? msg($('rMsg'), errText(error)) : msg($('rMsg'), row.published ? t('pubOk') : t('draftOk'), true);
  };
  $('rCopy').onclick = async () => { try { await navigator.clipboard.writeText(`${$('rTitle').value}\n\n${$('rBody').value}`); msg($('rMsg'), t('copied'), true); } catch { msg($('rMsg'), t('copyFail')); } };
}

// ---------- 页面框架文字与语言切换 ----------
function renderChrome() {
  document.title = t('brand');
  document.querySelector('.brand').textContent = t('brand');
  const nav = { '#/': 'navHome', '#/photos': 'navPhotos', '#/reports': 'navReports', '#/hours': 'navHours', '#/admin': 'navAdmin' };
  document.querySelectorAll('nav a').forEach(a => { a.textContent = t(nav[a.getAttribute('href')]); });
  $('setupWarn').textContent = t('setupWarn');
  document.querySelector('footer').textContent = t('footer');
  $('langBtn').textContent = t('langBtn');
  $('langBtn').setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切换到中文');
}
$('langBtn').onclick = () => { setLang(lang === 'zh' ? 'en' : 'zh'); renderChrome(); renderAuth(); route(); };
renderChrome();

// ---------- 路由 ----------
async function route() {
  const h = location.hash || '#/';
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === h || (h.startsWith('#/report/') && a.getAttribute('href') === '#/reports')));
  if (!sb && h !== '#/') { app.innerHTML = `<section class="band"><div class="wrap"><p>${t('notConnected')}</p></div></section>`; return; }
  try {
    if (h === '#/login') return loginView();
    if (h === '#/photos') return await photosView();
    if (h === '#/reports') return await reportsView();
    if (h.startsWith('#/report/')) return await reportView(h.split('/')[2]);
    if (h === '#/hours') return await hoursView();
    if (h === '#/admin') return await adminView();
    return await homeView();
  } catch (e) {
    app.innerHTML = `<section class="band"><div class="wrap"><p>${t('loadErr')}${esc(errText(e))}</p><button onclick="location.reload()">${t('refresh')}</button></div></section>`;
  }
}
window.addEventListener('hashchange', route);
if (sb) sb.auth.onAuthStateChange((evt) => { if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT') loadSession().then(route); });
await loadSession();
route();
