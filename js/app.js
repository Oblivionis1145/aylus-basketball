import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, PARK } from './config.js';
import { esc, zhDate, addDays, splitRoster, buildReport, pickForecast, fmtHours } from './util.js';

const $ = id => document.getElementById(id);
const app = $('app');
const configured = !SUPABASE_URL.includes('YOUR-PROJECT') || SUPABASE_ANON_KEY.startsWith('YOUR');
if (!configured) $('setupWarn').classList.remove('hidden');
const sb = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const S = { user: null, profile: null, isAdmin: false };
const TEAMS = { A: 'A 队', B: 'B 队', T: '训练/自由活动' };
const STATUS = { ok: '正常举行', tbd: '待定，关注天气', cancel: '已取消' };
const msg = (el, text, ok) => { el.textContent = text; el.className = 'msg ' + (ok ? 'ok' : 'err'); };
const errText = e => (e && (e.message || e.error_description)) || '请稍后再试';

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
    box.innerHTML = `<span>${esc(S.profile?.display_name || S.user.email)}</span><button class="ghost sm" id="logout">退出</button>`;
    $('logout').onclick = async () => { await sb.auth.signOut(); await loadSession(); route(); };
  } else {
    box.innerHTML = `<a href="#/login"><button class="sm">登录</button></a>`;
  }
}
function loginView() {
  app.innerHTML = `<section class="band"><div class="wrap card" style="max-width:460px">
    <h2>邮箱登录</h2>
    <p class="muted">输入邮箱，我们会发一封登录邮件。点邮件里的链接，或者把邮件里的 6 位验证码填到下面，就登录了。不需要密码。</p>
    <form id="lf"><label for="lEmail">邮箱</label><input type="email" id="lEmail" required autocomplete="email" inputmode="email">
    <p><button id="lBtn">发送登录邮件</button></p></form>
    <form id="cf" class="hidden"><label for="lCode">验证码</label><input type="text" id="lCode" inputmode="numeric" autocomplete="one-time-code" maxlength="10">
    <p><button>登录</button></p></form>
    <div class="msg" id="lMsg"></div></div></section>`;
  let email = '';
  $('lf').onsubmit = async e => {
    e.preventDefault(); email = $('lEmail').value.trim(); if (!email) return;
    $('lBtn').disabled = true;
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    $('lBtn').disabled = false;
    if (error) return msg($('lMsg'), '发送失败：' + errText(error));
    msg($('lMsg'), '登录邮件已发送，请查收（也看看垃圾邮件箱）。', true); $('cf').classList.remove('hidden');
  };
  $('cf').onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.auth.verifyOtp({ email, token: $('lCode').value.trim(), type: 'email' });
    if (error) return msg($('lMsg'), '验证码不对或已过期：' + errText(error));
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
function rosterRow(s, i, tmap) {
  let t = '';
  if (s.is_volunteer) t += '<span class="tag v">义工</span>';
  if (s.join_after) t += '<span class="tag">参加交流</span>';
  if (S.isAdmin && s.no_photo) t += '<span class="tag np">不拍照</span>';
  if (tmap[s.id]) t += `<span class="tag g">${esc(TEAMS[tmap[s.id]])}</span>`;
  return `<li><span class="no">${i}.</span><span class="nm">${esc(s.name)}<small>${esc(s.age)}岁</small></span><span class="tags">${t}</span></li>`;
}
async function homeView() {
  if (!sb) { app.innerHTML = staticInfo(); return; }
  const ev = await currentEvent();
  if (!ev) { app.innerHTML = `<section class="band"><div class="wrap"><h2>暂时没有排期的活动</h2><p class="muted">组织者发布下一期后会显示在这里。</p></div></section>` + staticInfo(); return; }
  const { signups, tmap } = await eventRoster(ev.id);
  const { confirmed, waitlist, all } = splitRoster(signups, ev.cap);
  const mine = all.filter(s => s.user_id === S.user?.id);
  const canSign = ev.signup_open && ev.status !== 'cancel';
  const byTeam = { A: [], B: [], T: [] }; confirmed.forEach(s => tmap[s.id] && byTeam[tmap[s.id]].push(s));
  const hasTeams = Object.values(byTeam).some(a => a.length);
  app.innerHTML = `
  ${ev.status === 'cancel' ? '<div class="banner">本次活动已取消</div>' : ''}
  <section class="band hero"><svg class="court" viewBox="0 0 200 200" aria-hidden="true"><g fill="none" stroke="#fff" stroke-width="4"><circle cx="100" cy="100" r="90"/><path d="M100 10v180M10 100h180"/><path d="M36 36c30 30 30 98 0 128M164 36c-30 30-30 98 0 128"/></g></svg>
    <div class="wrap">
      <div class="round">🏀 社区公益篮球活动｜${esc(String(ev.event_date).slice(0, 4))}年第${esc(ev.round)}回</div>
      <h1>${esc(zhDate(ev.event_date))}</h1>
      <p style="margin:0 0 16px"><span class="status ${esc(ev.status)}"><i></i>${esc(STATUS[ev.status] || STATUS.ok)}</span></p>
      <div class="facts">
        <div class="fact"><b>时间</b><span>${esc(ev.time_text)}</span></div>
        <div class="fact"><b>地点</b><span>${esc(ev.location)}</span><br><a href="https://www.google.com/maps/search/?api=1&query=Syosset-Woodbury+Community+Park" target="_blank" rel="noopener">打开地图</a></div>
        <div class="fact"><b>天气</b><span id="wx">查询预报中…</span><br><a href="https://forecast.weather.gov/MapClick.php?lat=${PARK.lat}&lon=${PARK.lon}" target="_blank" rel="noopener">完整预报</a> · 雨雪天自动取消</div>
      </div>
      ${ev.notice ? `<p style="margin:14px 0 0;font-weight:500">📢 ${esc(ev.notice)}</p>` : ''}
    </div></section>
  <section class="band"><div class="wrap grid">
    <div class="card"><h2>接龙名单</h2>
      <div class="count">${confirmed.length}<small> / ${esc(ev.cap)} 人</small></div>
      <div class="meter"><div style="width:${Math.min(100, confirmed.length / ev.cap * 100)}%"></div></div>
      <div class="muted">按接龙顺序确认，满员后进入候补，有人取消时自动顺延。</div>
      ${all.length ? `<ol class="roster">${confirmed.map((s, i) => rosterRow(s, i + 1, tmap)).join('')}</ol>` : '<p class="muted">还没有人报名，来做第一个吧。</p>'}
      ${waitlist.length ? `<div class="wait">候补</div><ol class="roster">${waitlist.map((s, i) => rosterRow(s, i + 1, tmap)).join('')}</ol>` : ''}
    </div>
    <div class="card"><h2>我要报名</h2>
      ${!S.user ? `<p>报名需要先用邮箱登录，登录后可以随时修改或取消。</p><a href="#/login"><button>登录后报名</button></a>` :
      !canSign ? `<p class="muted">${ev.status === 'cancel' ? '本次活动已取消。' : '本期报名已截止。'}</p>` : `
      <form id="sf" novalidate>
        <div class="row2"><div><label for="fName">称呼</label><input type="text" id="fName" maxlength="40" placeholder="例：Dex" autocomplete="off"></div>
        <div><label for="fAge">年龄</label><input type="number" id="fAge" min="1" max="99" inputmode="numeric"></div></div>
        <label class="chk"><input type="checkbox" id="fVol">义工（帮忙带训练）</label>
        <label class="chk"><input type="checkbox" id="fAfter" checked>参加训练后交流活动（11:00–13:00，自带午餐）</label>
        <label class="chk"><input type="checkbox" id="fNoPhoto">本次不希望孩子被拍照</label>
        <label class="chk"><input type="checkbox" id="fRules">我已阅读并理解下方规则与安排</label>
        <button id="fBtn">接龙报名</button><div class="msg" id="fMsg"></div>
      </form>`}
      ${mine.length ? `<h3>我的报名</h3><ul class="mine">${mine.map(s => { const p = all.indexOf(s) + 1; return `<li><span><b>${esc(s.name)}</b> · ${p <= ev.cap ? `第 ${p} 位` : `候补第 ${p - ev.cap} 位`}</span><button class="ghost sm" data-del="${esc(s.id)}">取消报名</button></li>`; }).join('')}</ul><p class="muted">一个账号可以替几个孩子报名，再填一次即可。</p>` : ''}
    </div></div></section>
  <section class="band alt"><div class="wrap"><h2>分组</h2>
    ${hasTeams ? `<div class="teams">${Object.keys(byTeam).filter(k => byTeam[k].length).map(k => `<div class="card"><h3 style="margin-top:0">${esc(TEAMS[k])}（${byTeam[k].length}）</h3><ul>${byTeam[k].map(s => `<li>${esc(s.name)} ${esc(s.age)}岁${s.is_volunteer ? '（义工）' : ''}</li>`).join('')}</ul></div>`).join('')}</div>` : '<p class="muted">分组会在活动前由义工安排，届时在这里公布。</p>'}
  </div></section>
  ${staticInfo()}`;
  forecast(ev.event_date).then(w => {
    const el = $('wx'); if (!el) return;
    const note = ev.weather_note ? ev.weather_note + '。' : '';
    if (!w) { el.textContent = note || '预报尚未发布（通常提前 7 天）'; return; }
    el.textContent = `${note}${w.short}，${w.temp}°${w.unit}${w.pop != null ? `，降水概率 ${w.pop}%` : ''}${w.wet && ev.status === 'ok' ? '。预报可能有雨雪，以组织者通知为准' : ''}`;
  });
  const sf = $('sf');
  if (sf) sf.onsubmit = async e => {
    e.preventDefault(); const m = $('fMsg');
    const name = $('fName').value.trim(), age = parseInt($('fAge').value, 10);
    if (!name) return msg(m, '请填写称呼'); if (!(age > 0 && age < 100)) return msg(m, '请填写年龄');
    if (!$('fRules').checked) return msg(m, '请先勾选已阅读规则');
    $('fBtn').disabled = true;
    const { error } = await sb.from('signups').insert({ event_id: ev.id, name, age, is_volunteer: $('fVol').checked, join_after: $('fAfter').checked, no_photo: $('fNoPhoto').checked });
    if (error) { $('fBtn').disabled = false; return msg(m, error.code === '23505' ? '这个名字已经报过名了' : '报名没有成功：' + errText(error)); }
    homeView();
  };
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '确认取消？'; return; }
    b.disabled = true; const { error } = await sb.from('signups').delete().eq('id', b.dataset.del);
    if (error) { b.disabled = false; b.textContent = '取消失败，重试'; return; } homeView();
  });
}
function staticInfo() {
  return `<section class="band"><div class="wrap"><h2>活动安排</h2><ul class="sched">
    <li><time>9:00–10:00</time><div><b>基础训练</b>（不限年龄）<p>拍照合影</p></div></li>
    <li><time>10:00–11:00</time><div><b>分组对抗</b>（建议 6 岁以上参与）<p>低龄儿童可在家长陪同下自由活动</p></div></li>
    <li><time>11:00–13:00</time><div><b>训练后交流活动</b>（可选）<p>视个人时间参加，自带午餐，玩无电子产品的推理游戏</p></div></li></ul></div></section>
  <section class="band alt"><div class="wrap info">
    <div><h2>✅ 基本规则</h2><ul><li>安全第一，避免危险动作</li><li>尊重他人，不语言冲突、不推搡</li><li>家长负责自家孩子的安全与行为</li><li>不适合对抗的孩子可选择训练或自由活动</li></ul></div>
    <div><h2>⚠️ 说明</h2><ul><li>本活动为义工自发组织的公益活动（免费），目的为减少青少年电子娱乐时间，增加户外活动和互动</li><li>义工负责带领训练篮球，安全自负，义工不承担看护责任</li><li>如遇雨雪天，活动自动取消</li></ul></div>
    <div><h2>🎒 建议准备</h2><ul><li>篮球</li><li>水</li><li>防晒、防虫</li><li>简单休息用品</li></ul></div>
    <div><h2>🌱 额外支持（私下沟通）</h2><p style="margin:0">如孩子在情绪管理、专注力或电子产品使用方面有提升需求，欢迎家长私下联系，义工哥哥可在活动中给予适当关注与鼓励，帮助建立积极的运动体验。</p><p class="muted">以上为经验性陪伴与引导，不构成专业服务。</p></div>
  </div><p class="wrap" style="margin-top:18px;font-weight:700">报名即默认理解以上规则与安排。如本次不希望孩子被拍照请在报名时勾选。欢迎新老朋友参加。</p></section>`;
}

// ---------- 照片墙 ----------
const photoUrl = path => sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
async function photosView() {
  const [{ data: photos }, { data: events }] = await Promise.all([
    sb.from('photos').select('*').order('created_at', { ascending: false }).limit(300),
    sb.from('events').select('id,round,event_date'),
  ]);
  const evm = Object.fromEntries((events || []).map(e => [e.id, e]));
  const groups = {};
  (photos || []).forEach(p => (groups[p.event_id ?? 0] ||= []).push(p));
  const keys = Object.keys(groups).sort((a, b) => String(evm[b]?.event_date || '').localeCompare(String(evm[a]?.event_date || '')));
  app.innerHTML = `<section class="band"><div class="wrap"><h2>照片墙</h2>
    ${keys.length ? keys.map(k => `<h3>${evm[k] ? `第${esc(evm[k].round)}回 · ${esc(zhDate(evm[k].event_date))}` : '其他'}</h3>
      <div class="gallery">${groups[k].map(p => `<figure><img loading="lazy" src="${esc(photoUrl(p.path))}" alt="${esc(p.caption || '活动照片')}">${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}</figure>`).join('')}</div>`).join('') : '<p class="muted">还没有照片。每次活动后组织者会上传精选照片。</p>'}
  </div></section>`;
  app.querySelectorAll('.gallery img').forEach(img => img.onclick = () => {
    const lb = document.createElement('div'); lb.className = 'lightbox'; lb.innerHTML = `<img src="${esc(img.src)}" alt="">`;
    lb.onclick = () => lb.remove(); document.body.append(lb);
  });
}

// ---------- 活动报告 ----------
async function reportsView() {
  const { data } = await sb.from('reports').select('id,title,published,created_at,events(event_date,round)').order('created_at', { ascending: false });
  app.innerHTML = `<section class="band"><div class="wrap"><h2>活动报告</h2>
    ${data?.length ? `<ul class="list">${data.map(r => `<li><a href="#/report/${esc(r.id)}">${esc(r.title)}</a>${r.published ? '' : ' <span class="tag">草稿</span>'}<div class="muted">${r.events ? esc(zhDate(r.events.event_date)) : ''}</div></li>`).join('')}</ul>` : '<p class="muted">还没有报告。</p>'}
  </div></section>`;
}
async function reportView(id) {
  const { data: r } = await sb.from('reports').select('*').eq('id', id).maybeSingle();
  if (!r) { app.innerHTML = '<section class="band"><div class="wrap"><p>找不到这篇报告。</p></div></section>'; return; }
  const { data: photos } = r.event_id ? await sb.from('photos').select('*').eq('event_id', r.event_id) : { data: [] };
  app.innerHTML = `<section class="band"><div class="wrap report"><p><a href="#/reports">← 全部报告</a></p>
    <h1 style="font-size:clamp(24px,4vw,34px)">${esc(r.title)}</h1>
    <div class="body">${esc(r.body)}</div>
    ${photos?.length ? `<div class="gallery" style="margin-top:20px">${photos.map(p => `<figure><img loading="lazy" src="${esc(photoUrl(p.path))}" alt="活动照片"></figure>`).join('')}</div>` : ''}
    <p><button class="ghost" id="copyR">复制报告全文</button> <span class="msg" id="cMsg"></span></p>
  </div></section>`;
  $('copyR').onclick = async () => { try { await navigator.clipboard.writeText(`${r.title}\n\n${r.body}`); msg($('cMsg'), '已复制', true); } catch { msg($('cMsg'), '复制失败，请手动选择文字'); } };
}

// ---------- 义工时长 ----------
async function hoursView() {
  const { data: board } = await sb.rpc('volunteer_leaderboard');
  let mineHtml = '<p>登录后可以查看自己的义工时长。</p><a href="#/login"><button>登录</button></a>';
  if (S.user) {
    const { data: mine } = await sb.from('volunteer_hours').select('hours,signups!inner(name,user_id,events(event_date,round))').eq('signups.user_id', S.user.id);
    const rows = (mine || []).sort((a, b) => String(b.signups.events?.event_date).localeCompare(String(a.signups.events?.event_date)));
    const total = rows.reduce((t, r) => t + Number(r.hours), 0);
    mineHtml = rows.length ? `<div class="big">${fmtHours(total)}<small style="font-size:18px;color:var(--mute)"> 小时</small></div><p class="muted">共 ${rows.length} 次</p>
      <table><thead><tr><th>活动</th><th>称呼</th><th class="num">时长</th></tr></thead><tbody>${rows.map(r => `<tr><td>第${esc(r.signups.events?.round)}回 · ${esc(r.signups.events?.event_date)}</td><td>${esc(r.signups.name)}</td><td class="num">${fmtHours(r.hours)} 小时</td></tr>`).join('')}</tbody></table>`
      : '<p class="muted">还没有记录。以义工身份报名并参加活动后，组织者会登记时长。</p>';
  }
  app.innerHTML = `<section class="band"><div class="wrap grid">
    <div class="card"><h2>义工时长排行</h2>${board?.length ? `<table><thead><tr><th class="num">#</th><th>义工</th><th class="num">次数</th><th class="num">总时长</th></tr></thead><tbody>${board.map((b, i) => `<tr><td class="num">${i + 1}</td><td>${esc(b.name)}</td><td class="num">${esc(b.events)}</td><td class="num">${fmtHours(b.total_hours)} 小时</td></tr>`).join('')}</tbody></table>` : '<p class="muted">还没有时长记录。</p>'}</div>
    <div class="card"><h2>我的时长</h2>${mineHtml}</div>
  </div><p class="wrap muted">时长由组织者在每次活动后登记，只有组织者可以修改。</p></section>`;
}

// ---------- 后台 ----------
async function adminView() {
  if (!S.isAdmin) { app.innerHTML = '<section class="band"><div class="wrap"><p>只有组织者可以进入后台。</p></div></section>'; return; }
  const { data: events } = await sb.from('events').select('*').order('event_date', { ascending: false });
  const cur = await currentEvent();
  const selId = Number(sessionStorage.getItem('adminEv')) || cur?.id || events?.[0]?.id;
  const ev = (events || []).find(e => e.id === selId) || events?.[0];
  if (!ev) {
    app.innerHTML = `<section class="band"><div class="wrap card"><h2>创建第一期活动</h2><label for="nDate">日期</label><input type="date" id="nDate"><label for="nRound">第几回</label><input type="number" id="nRound" value="1"><p><button id="nBtn">创建</button></p><div class="msg" id="nMsg"></div></div></section>`;
    $('nBtn').onclick = async () => { const { error } = await sb.from('events').insert({ event_date: $('nDate').value, round: +$('nRound').value }); error ? msg($('nMsg'), errText(error)) : adminView(); };
    return;
  }
  const { signups, tmap } = await eventRoster(ev.id);
  const { confirmed, all } = splitRoster(signups, ev.cap);
  const { data: hrs } = await sb.from('volunteer_hours').select('*').in('signup_id', all.map(s => s.id).concat([0]));
  const hmap = Object.fromEntries((hrs || []).map(h => [h.signup_id, h.hours]));
  const { data: rep } = await sb.from('reports').select('*').eq('event_id', ev.id).maybeSingle();
  const { data: photos } = await sb.from('photos').select('*').eq('event_id', ev.id);

  app.innerHTML = `<section class="band"><div class="wrap">
    <h2>组织者后台</h2>
    <div class="card"><label for="aPick">正在管理</label><select id="aPick">${events.map(e => `<option value="${e.id}"${e.id === ev.id ? ' selected' : ''}>第${esc(e.round)}回 · ${esc(e.event_date)}</option>`).join('')}</select>
      <p><button class="ghost" id="aNext">新建下一期（${esc(addDays(events[0].event_date, 7))}）</button></p><div class="msg" id="nMsg"></div></div>

    <h3>活动信息</h3><div class="card">
      <div class="row2"><div><label for="aDate">日期</label><input type="date" id="aDate" value="${esc(ev.event_date)}"></div><div><label for="aRound">第几回</label><input type="number" id="aRound" value="${esc(ev.round)}"></div></div>
      <div class="row2"><div><label for="aTime">时间</label><input type="text" id="aTime" value="${esc(ev.time_text)}"></div><div><label for="aCap">人数上限</label><input type="number" id="aCap" value="${esc(ev.cap)}"></div></div>
      <label for="aLoc">地点</label><input type="text" id="aLoc" value="${esc(ev.location)}">
      <label for="aStatus">状态</label><select id="aStatus">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${ev.status === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
      <label for="aWx">天气说明（会显示在自动预报前面，可留空）</label><input type="text" id="aWx" value="${esc(ev.weather_note)}" maxlength="100">
      <label for="aNotice">公告（可留空）</label><input type="text" id="aNotice" value="${esc(ev.notice)}" maxlength="300">
      <label class="chk"><input type="checkbox" id="aOpen"${ev.signup_open ? ' checked' : ''}>开放报名</label>
      <p><button id="aSave">保存活动信息</button></p><div class="msg" id="aMsg"></div></div>

    <h3>名单、分组与义工时长（${all.length} 人，前 ${esc(ev.cap)} 位确认）</h3><div class="card">
      <p class="muted">分组只对确认名单生效。时长只给义工填，留空表示未登记。</p>
      ${all.map((s, i) => `<div class="admin-row"><span class="no" style="font-weight:700;color:var(--or)">${i + 1}</span>
        <span><b>${esc(s.name)}</b> <span class="muted">${esc(s.age)}岁</span> ${s.is_volunteer ? '<span class="tag v">义工</span>' : ''}${s.no_photo ? ' <span class="tag np">不拍照</span>' : ''}${i >= ev.cap ? ' <span class="tag">候补</span>' : ''}</span>
        <select data-team="${s.id}" aria-label="分组"><option value="">未分组</option>${Object.entries(TEAMS).map(([k, v]) => `<option value="${k}"${tmap[s.id] === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
        <input type="number" step="0.5" min="0" max="24" data-hours="${s.id}" value="${hmap[s.id] != null ? esc(hmap[s.id]) : ''}" placeholder="${s.is_volunteer ? '时长' : '—'}" aria-label="义工时长">
        <button class="ghost sm" data-rm="${s.id}">移除</button></div>`).join('') || '<p class="muted">还没有人报名。</p>'}
      <p><button class="ghost" id="aAuto">按年龄自动分两队</button> <button class="ghost" id="aFill">义工都填 4 小时</button> <button id="aSaveL">保存分组和时长</button></p>
      <div class="msg" id="lMsg"></div></div>

    <h3>照片（${photos?.length || 0} 张）</h3><div class="card">
      <p class="muted">只上传可以公开的照片，注意避开报名时勾选了“不拍照”的孩子。</p>
      <input type="file" id="aFiles" accept="image/*" multiple>
      <p><button id="aUp">上传</button></p><div class="msg" id="uMsg"></div>
      <div class="gallery">${(photos || []).map(p => `<figure><img src="${esc(photoUrl(p.path))}" alt=""><figcaption><button class="ghost sm" data-ph="${p.id}" data-path="${esc(p.path)}">删除</button></figcaption></figure>`).join('')}</div></div>

    <h3>活动报告</h3><div class="card">
      <p class="muted">按 AYLUS 报告格式生成。先保存好义工时长，再点“生成”。</p>
      <label for="rHi">本周亮点（可选，英文一两句）</label><input type="text" id="rHi" maxlength="300">
      <p><button class="ghost" id="rGen">按模板生成</button></p>
      <label for="rTitle">标题</label><input type="text" id="rTitle" value="${esc(rep?.title || '')}">
      <label for="rBody">正文</label><textarea id="rBody" rows="16">${esc(rep?.body || '')}</textarea>
      <label class="chk"><input type="checkbox" id="rPub"${rep?.published ? ' checked' : ''}>公开发布到“活动报告”</label>
      <p><button id="rSave">保存报告</button> <button class="ghost" id="rCopy">复制全文</button></p><div class="msg" id="rMsg"></div></div>
  </div></section>`;

  $('aPick').onchange = () => { sessionStorage.setItem('adminEv', $('aPick').value); adminView(); };
  $('aNext').onclick = async () => {
    const last = events[0];
    const { data, error } = await sb.from('events').insert({ event_date: addDays(last.event_date, 7), round: last.round + 1, cap: last.cap, time_text: last.time_text, location: last.location }).select().single();
    if (error) return msg($('nMsg'), errText(error)); sessionStorage.setItem('adminEv', data.id); adminView();
  };
  $('aSave').onclick = async () => {
    const { error } = await sb.from('events').update({ event_date: $('aDate').value, round: +$('aRound').value, time_text: $('aTime').value.trim(), cap: +$('aCap').value || 15, location: $('aLoc').value.trim(), status: $('aStatus').value, weather_note: $('aWx').value.trim(), notice: $('aNotice').value.trim(), signup_open: $('aOpen').checked }).eq('id', ev.id);
    error ? msg($('aMsg'), errText(error)) : msg($('aMsg'), '已保存', true);
  };
  $('aAuto').onclick = () => {
    const big = confirmed.filter(s => s.age >= 6).sort((a, b) => b.is_volunteer - a.is_volunteer || b.age - a.age);
    big.forEach((s, i) => { app.querySelector(`[data-team="${s.id}"]`).value = [0, 3].includes(i % 4) ? 'A' : 'B'; });
    confirmed.filter(s => s.age < 6).forEach(s => { app.querySelector(`[data-team="${s.id}"]`).value = 'T'; });
    msg($('lMsg'), '已按年龄蛇形分队，确认后点“保存分组和时长”', true);
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
    bad ? msg($('lMsg'), errText(bad.error)) : msg($('lMsg'), '已保存', true);
  };
  app.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '确认？'; return; }
    const { error } = await sb.from('signups').delete().eq('id', b.dataset.rm); error ? msg($('lMsg'), errText(error)) : adminView();
  });
  $('aUp').onclick = async () => {
    const files = [...$('aFiles').files]; if (!files.length) return msg($('uMsg'), '请先选择照片');
    $('aUp').disabled = true; let n = 0;
    for (const f of files) {
      const path = `${ev.event_date}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${(f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      const up = await sb.storage.from('photos').upload(path, f, { contentType: f.type });
      if (up.error) { msg($('uMsg'), `第 ${n + 1} 张上传失败：${errText(up.error)}`); break; }
      await sb.from('photos').insert({ event_id: ev.id, path }); n++; msg($('uMsg'), `已上传 ${n}/${files.length}`, true);
    }
    $('aUp').disabled = false; if (n === files.length) adminView();
  };
  app.querySelectorAll('[data-ph]').forEach(b => b.onclick = async () => {
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '确认删除'; return; }
    await sb.storage.from('photos').remove([b.dataset.path]); await sb.from('photos').delete().eq('id', b.dataset.ph); adminView();
  });
  $('rGen').onclick = async () => {
    const { data: h2 } = await sb.from('volunteer_hours').select('*').in('signup_id', all.map(s => s.id).concat([0]));
    const hm = Object.fromEntries((h2 || []).map(h => [h.signup_id, h.hours]));
    const vols = all.filter(s => hm[s.id] != null && Number(hm[s.id]) > 0).map(s => ({ name: s.name, hours: hm[s.id] }));
    const r = buildReport(ev, vols, { headcount: confirmed.length, highlight: $('rHi').value });
    $('rTitle').value = r.title; $('rBody').value = r.body;
    msg($('rMsg'), vols.length ? '已生成，可以再修改后保存' : '已生成。还没有登记义工时长，所以没有义工名单。', !!vols.length);
  };
  $('rSave').onclick = async () => {
    const row = { event_id: ev.id, title: $('rTitle').value.trim(), body: $('rBody').value, published: $('rPub').checked, updated_at: new Date().toISOString() };
    if (!row.title || !row.body.trim()) return msg($('rMsg'), '标题和正文不能为空');
    const { error } = await sb.from('reports').upsert(row, { onConflict: 'event_id' });
    error ? msg($('rMsg'), errText(error)) : msg($('rMsg'), row.published ? '已保存并发布' : '已保存为草稿', true);
  };
  $('rCopy').onclick = async () => { try { await navigator.clipboard.writeText(`${$('rTitle').value}\n\n${$('rBody').value}`); msg($('rMsg'), '已复制', true); } catch { msg($('rMsg'), '复制失败'); } };
}

// ---------- 路由 ----------
async function route() {
  const h = location.hash || '#/';
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === h || (h.startsWith('#/report/') && a.getAttribute('href') === '#/reports')));
  if (!sb && h !== '#/') { app.innerHTML = '<section class="band"><div class="wrap"><p>网站还没有连接数据库。</p></div></section>'; return; }
  try {
    if (h === '#/login') return loginView();
    if (h === '#/photos') return await photosView();
    if (h === '#/reports') return await reportsView();
    if (h.startsWith('#/report/')) return await reportView(h.split('/')[2]);
    if (h === '#/hours') return await hoursView();
    if (h === '#/admin') return await adminView();
    return await homeView();
  } catch (e) {
    app.innerHTML = `<section class="band"><div class="wrap"><p>页面加载出错：${esc(errText(e))}</p><button onclick="location.reload()">刷新</button></div></section>`;
  }
}
window.addEventListener('hashchange', route);
if (sb) sb.auth.onAuthStateChange((evt) => { if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT') loadSession().then(route); });
await loadSession();
route();
