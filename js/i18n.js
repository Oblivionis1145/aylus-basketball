// 界面文字（中文 / English）。新增文字时两种语言都要加。
import { zhDate, enDateLong } from './util.js';

const D = {
  zh: {
    brand: 'AYLUS 社区篮球', navHome: '本周活动', navPhotos: '照片墙', navReports: '活动报告', navHours: '义工时长', navAdmin: '后台',
    login: '登录', logout: '退出', loading: '加载中…', setupWarn: '网站还没有连接数据库：请在 js/config.js 里填写 Supabase 地址和密钥。',
    notConnected: '网站还没有连接数据库。', loadErr: '页面加载出错：', refresh: '刷新', tryLater: '请稍后再试', footer: '义工自发组织 · 免费公益活动 · Syosset, NY 11791',
    // 登录
    loginTitle: '邮箱登录', loginIntro: '输入邮箱，我们会发一封登录邮件。点邮件里的链接，或者把邮件里的 6 位验证码填到下面，就登录了。不需要密码。',
    email: '邮箱', sendLogin: '发送登录邮件', code: '验证码', sendFail: '发送失败：', sent: '登录邮件已发送，请查收（也看看垃圾邮件箱）。', badCode: '验证码不对或已过期：',
    // 状态与分组
    st_ok: '正常举行', st_tbd: '待定，关注天气', st_cancel: '已取消', teamA: 'A 队', teamB: 'B 队', teamT: '训练/自由活动',
    // 首页
    noEvent: '暂时没有排期的活动', noEventSub: '组织者发布下一期后会显示在这里。', cancelled: '本次活动已取消',
    roundLine: (y, r) => `🏀 社区公益篮球活动｜${y}年第${r}回`, time: '时间', place: '地点', map: '打开地图', weather: '天气', wxLoading: '查询预报中…', fullFc: '完整预报', autoCancel: '雨雪天自动取消',
    wxNone: '预报尚未发布（通常提前 7 天）', wxLine: (s, t, u, p) => `${s}，${t}°${u}${p != null ? `，降水概率 ${p}%` : ''}`, wxWet: '。预报可能有雨雪，以组织者通知为准',
    roster: '参加者接龙（目前报名）', volRoster: '义工接龙', volNote: '义工单独接龙，不占参加者名额。', emptyVol: '还没有义工报名。', copyList: '复制名单发微信', typeLabel: '报名身份', typePlayer: '参加者（孩子）', typeVol: '义工（帮忙带训练）', vpos: p => `义工第 ${p} 位`, needMigration: '顺序没有改成：请先在 Supabase 运行 supabase/migrations/002_admin_edit.sql。', edit: '编辑', up: '上移', down: '下移', saveRow: '保存', cancel: '取消', addFor: '代报名（帮别人加入名单）', add: '加入名单', listPlayers: (n, c) => `参加者（${n} 人，前 ${c} 位确认）`, listVols: n => `义工（${n} 人）`, people: '人', rosterNote: '按接龙顺序确认，满员后进入候补，有人取消时自动顺延。', emptyRoster: '还没有人报名，来做第一个吧。', waitlist: '候补',
    tagVol: '义工', tagAfter: '参加交流', tagNoPhoto: '不拍照', age: a => `${a}岁`,
    signUp: '我要报名', needLogin: '报名需要先用邮箱登录，登录后可以随时修改或取消。', loginToSign: '登录后报名', closedCancel: '本次活动已取消。', closed: '本期报名已截止。',
    fName: '称呼', fNamePh: '例：Dex', fAge: '年龄', fVol: '义工（帮忙带训练）', fAfter: '参加训练后交流活动（11:00–13:00，自带午餐）', fNoPhoto: '本次不希望孩子被拍照', fRules: '我已阅读并理解下方规则与安排', fBtn: '接龙报名',
    eName: '请填写称呼', eAge: '请填写年龄', eRules: '请先勾选已阅读规则', eDup: '这个名字已经报过名了', eSign: '报名没有成功：',
    mine: '我的报名', pos: p => `第 ${p} 位`, wpos: p => `候补第 ${p} 位`, cancelSign: '取消报名', sure: '确认取消？', cancelFail: '取消失败，重试', multi: '一个账号可以替几个孩子报名，再填一次即可。',
    teams: '分组', noTeams: '分组会在活动前由义工安排，届时在这里公布。', volMark: '（义工）',
    sched: '活动安排', s1: '基础训练', s1a: '（不限年龄）', s1b: '拍照合影', s2: '分组对抗', s2a: '（建议 6 岁以上参与）', s2b: '低龄儿童可在家长陪同下自由活动',
    s3: '训练后交流活动', s3a: '（可选）', s3b: '视个人时间参加，自带午餐，玩无电子产品的推理游戏',
    rules: '✅ 基本规则', rulesL: ['安全第一，避免危险动作', '尊重他人，不语言冲突、不推搡', '家长负责自家孩子的安全与行为', '不适合对抗的孩子可选择训练或自由活动'],
    notes: '⚠️ 说明', notesL: ['本活动为义工自发组织的公益活动（免费），目的为减少青少年电子娱乐时间，增加户外活动和互动', '义工负责带领训练篮球，安全自负，义工不承担看护责任', '如遇雨雪天，活动自动取消'],
    bring: '🎒 建议准备', bringL: ['篮球', '水', '防晒、防虫', '简单休息用品'],
    support: '🌱 额外支持（私下沟通）', supportP: '如孩子在情绪管理、专注力或电子产品使用方面有提升需求，欢迎家长私下联系，义工哥哥可在活动中给予适当关注与鼓励，帮助建立积极的运动体验。', supportN: '以上为经验性陪伴与引导，不构成专业服务。',
    agree: '报名即默认理解以上规则与安排。如本次不希望孩子被拍照请在报名时勾选。欢迎新老朋友参加。',
    // 照片 / 报告
    photos: '照片墙', roundDate: (r, d) => `第${r}回 · ${d}`, other: '其他', noPhotos: '还没有照片。每次活动后组织者会上传精选照片。', photoAlt: '活动照片',
    reports: '活动报告', draft: '草稿', noReports: '还没有报告。', noReport: '找不到这篇报告。', allReports: '← 全部报告', copyAll: '复制报告全文', copied: '已复制', copyFail: '复制失败，请手动选择文字',
    reportNote: '报告为英文，与 AYLUS 网站发布格式一致。',
    // 时长
    board: '义工时长排行', colVol: '义工', colTimes: '次数', colTotal: '总时长', hrs: h => `${h} 小时`, noBoard: '还没有时长记录。',
    myHours: '我的时长', loginHours: '登录后可以查看自己的义工时长。', times: n => `共 ${n} 次`, colEvent: '活动', colName: '称呼', colHours: '时长',
    noMine: '还没有记录。以义工身份报名并参加活动后，组织者会登记时长。', hoursNote: '时长由组织者在每次活动后登记，只有组织者可以修改。',
    // 后台
    adminOnly: '只有组织者可以进入后台。', firstEvent: '创建第一期活动', date: '日期', round: '第几回', create: '创建', admin: '组织者后台', managing: '正在管理',
    newNext: d => `新建下一期（${d}）`, evInfo: '活动信息', cap: '人数上限', status: '状态', wxNote: '天气说明（会显示在自动预报前面，可留空）', notice: '公告（可留空）', open: '开放报名', saveEv: '保存活动信息', saved: '已保存',
    listTitle: '本周接龙：编辑、分组与义工时长', listNote: '可以修改每个人的信息、调整顺序、移除或代报名。分组对义工和确认的参加者生效；时长只给义工填，留空表示未登记。改完分组和时长后点下方保存。', unassigned: '未分组', hoursPh: '时长', remove: '移除', sureShort: '确认？', noneYet: '还没有人报名。',
    autoTeams: '按年龄自动分两队', fill4: '义工都填 4 小时', saveList: '保存分组和时长', autoDone: '已按年龄蛇形分队，确认后点“保存分组和时长”',
    photosN: n => `照片（${n} 张）`, photoNote: '只上传可以公开的照片，注意避开报名时勾选了“不拍照”的孩子。', upload: '上传', pickFirst: '请先选择照片', upFail: (n, e) => `第 ${n} 张上传失败：${e}`, upProg: (n, t) => `已上传 ${n}/${t}`, del: '删除', sureDel: '确认删除',
    repTitle: '活动报告', repNote: '按 AYLUS 报告格式生成（英文）。先保存好义工时长，再点“生成”。', highlight: '本周亮点（可选，英文一两句）', gen: '按模板生成', title: '标题', body: '正文', publish: '公开发布到“活动报告”', saveRep: '保存报告', copyBtn: '复制全文',
    genOk: '已生成，可以再修改后保存', genNoVol: '已生成。还没有登记义工时长，所以没有义工名单。', needTB: '标题和正文不能为空', pubOk: '已保存并发布', draftOk: '已保存为草稿',
    nth: (y, n) => `${y} 年第 ${n} 次`, fYear: '年份', fMonth: '月份', fEvent: '活动', all: '全部', monthName: m => `${m} 月`,
    loadingArchive: '正在读取 AYLUS 网站上的报告和照片…', photosIntro: '包括 AYLUS 网站上发布的活动照片和本站上传的照片，AYLUS 上有新报告时会自动出现。点照片可放大，左右键切换。',
    reportsIntro: '自动收录 AYLUS 网站上 Syosset-Woodbury 篮球活动的全部报告（从 2025 年第 14 次起），新报告发布后会自动出现。', aylusDown: '（AYLUS 网站暂时读取不到，目前只显示本站内容。）',
    photoCount: (e, n) => `${e} 次活动，${n} 张照片`, readReport: '看报告', ownSite: '本站', onAylus: '在 AYLUS 网站查看原文',
    fFirst: 'First name（名）', fLast: 'Last name（姓）', fPref: 'Preferred name（选填）', fPrefPh: '没有可以不填', eFull: '请填写 First name 和 Last name', needMig3: '网站正在更新，请稍后再试（组织者需运行 003_full_names.sql）', weekHours: '本周时长', totalHours: '累计时长', langBtn: 'EN',
  },
  en: {
    brand: 'AYLUS Community Basketball', navHome: 'This week', navPhotos: 'Photos', navReports: 'Reports', navHours: 'Volunteer hours', navAdmin: 'Admin',
    login: 'Log in', logout: 'Log out', loading: 'Loading…', setupWarn: 'The site is not connected to its database yet: fill in the Supabase URL and key in js/config.js.',
    notConnected: 'The site is not connected to its database yet.', loadErr: 'The page failed to load: ', refresh: 'Reload', tryLater: 'Please try again later', footer: 'Run by volunteers · Free community event · Syosset, NY 11791',
    loginTitle: 'Log in with email', loginIntro: 'Enter your email and we will send you a login email. Click the link in it, or type the 6-digit code below. No password needed.',
    email: 'Email', sendLogin: 'Send login email', code: 'Code', sendFail: 'Could not send: ', sent: 'Login email sent. Check your inbox (and spam folder).', badCode: 'The code is wrong or has expired: ',
    st_ok: 'On as planned', st_tbd: 'To be confirmed (weather)', st_cancel: 'Cancelled', teamA: 'Team A', teamB: 'Team B', teamT: 'Training / free play',
    noEvent: 'No event scheduled yet', noEventSub: 'The next event will appear here once the organizer posts it.', cancelled: 'This event is cancelled',
    roundLine: (y, r) => `🏀 Community basketball · ${y} event #${r}`, time: 'Time', place: 'Location', map: 'Open map', weather: 'Weather', wxLoading: 'Checking forecast…', fullFc: 'Full forecast', autoCancel: 'Cancelled automatically if rain or snow',
    wxNone: 'Forecast not out yet (usually 7 days ahead)', wxLine: (s, t, u, p) => `${s}, ${t}°${u}${p != null ? `, ${p}% chance of precipitation` : ''}`, wxWet: '. Rain or snow possible; watch for the organizer’s notice',
    roster: 'Players signed up', volRoster: 'Volunteers signed up', volNote: 'Volunteers sign up separately and do not take player spots.', emptyVol: 'No volunteers yet.', copyList: 'Copy list for WeChat', typeLabel: 'Signing up as', typePlayer: 'Player (child)', typeVol: 'Volunteer (helps lead training)', vpos: p => `volunteer #${p}`, needMigration: 'Order did not change: run supabase/migrations/002_admin_edit.sql in Supabase first.', edit: 'Edit', up: 'Move up', down: 'Move down', saveRow: 'Save', cancel: 'Cancel', addFor: 'Add someone to the list', add: 'Add to list', listPlayers: (n, c) => `Players (${n}, first ${c} confirmed)`, listVols: n => `Volunteers (${n})`, people: 'spots', rosterNote: 'Spots are confirmed in sign-up order. Once full, new sign-ups join the waitlist and move up if someone cancels.', emptyRoster: 'Nobody has signed up yet. Be the first!', waitlist: 'Waitlist',
    tagVol: 'Volunteer', tagAfter: 'Staying after', tagNoPhoto: 'No photos', age: a => `age ${a}`,
    signUp: 'Sign up', needLogin: 'Log in with your email to sign up. You can change or cancel any time.', loginToSign: 'Log in to sign up', closedCancel: 'This event is cancelled.', closed: 'Sign-ups for this event are closed.',
    fName: 'Name', fNamePh: 'e.g. Dex', fAge: 'Age', fVol: 'Volunteer (helps lead training)', fAfter: 'Joining the post-training gathering (11:00–1:00, bring lunch)', fNoPhoto: 'Please do not photograph my child this time', fRules: 'I have read and understand the rules below', fBtn: 'Sign up',
    eName: 'Please enter a name', eAge: 'Please enter an age', eRules: 'Please confirm you have read the rules', eDup: 'This name is already signed up', eSign: 'Sign-up failed: ',
    mine: 'My sign-ups', pos: p => `#${p}`, wpos: p => `waitlist #${p}`, cancelSign: 'Cancel', sure: 'Sure?', cancelFail: 'Failed, try again', multi: 'One account can sign up several children; just fill in the form again.',
    teams: 'Teams', noTeams: 'Volunteers will set the teams before the event and post them here.', volMark: ' (volunteer)',
    sched: 'Schedule', s1: 'Basic training', s1a: ' (all ages)', s1b: 'Group photo', s2: 'Scrimmages', s2a: ' (ages 6 and up suggested)', s2b: 'Younger children can play freely with a parent',
    s3: 'Post-training gathering', s3a: ' (optional)', s3b: 'Stay if you have time. Bring your own lunch; we play screen-free logic and deduction games',
    rules: '✅ Rules', rulesL: ['Safety first; no dangerous moves', 'Respect others; no arguing or pushing', 'Parents are responsible for their own children’s safety and behavior', 'Children who are not ready for scrimmages can train or play freely'],
    notes: '⚠️ Please note', notesL: ['This is a free community event run by volunteers, to cut young people’s screen time and get them outdoors and interacting', 'Volunteers lead basketball training only; participation is at your own risk and volunteers do not provide supervision', 'The event is cancelled automatically in rain or snow'],
    bring: '🎒 What to bring', bringL: ['Basketball', 'Water', 'Sunscreen and bug spray', 'Anything you need for breaks'],
    support: '🌱 Extra support (contact us privately)', supportP: 'If your child could use help with emotions, focus or screen habits, contact us privately. Our volunteers can give them a little extra attention and encouragement during the event so they enjoy the sport.', supportN: 'This is informal mentoring, not a professional service.',
    agree: 'Signing up means you accept the rules and arrangements above. If you prefer your child not be photographed, tick the box when you sign up. Newcomers welcome!',
    photos: 'Photo wall', roundDate: (r, d) => `Event #${r} · ${d}`, other: 'Other', noPhotos: 'No photos yet. The organizer uploads highlights after each event.', photoAlt: 'Event photo',
    reports: 'Event reports', draft: 'Draft', noReports: 'No reports yet.', noReport: 'Report not found.', allReports: '← All reports', copyAll: 'Copy full report', copied: 'Copied', copyFail: 'Copy failed; select the text manually',
    reportNote: '',
    board: 'Volunteer leaderboard', colVol: 'Volunteer', colTimes: 'Events', colTotal: 'Total', hrs: h => `${h} h`, noBoard: 'No hours recorded yet.',
    myHours: 'My hours', loginHours: 'Log in to see your volunteer hours.', times: n => `${n} event${n === 1 ? '' : 's'}`, colEvent: 'Event', colName: 'Name', colHours: 'Hours',
    noMine: 'No records yet. Sign up as a volunteer and attend; the organizer records your hours afterwards.', hoursNote: 'Hours are recorded by the organizer after each event, and only the organizer can change them.',
    adminOnly: 'Only the organizer can open the admin page.', firstEvent: 'Create the first event', date: 'Date', round: 'Event #', create: 'Create', admin: 'Organizer admin', managing: 'Managing',
    newNext: d => `Create next event (${d})`, evInfo: 'Event details', cap: 'Spots', status: 'Status', wxNote: 'Weather note (shown before the automatic forecast, optional)', notice: 'Announcement (optional)', open: 'Sign-ups open', saveEv: 'Save event details', saved: 'Saved',
    listTitle: 'This week’s list: edit, teams and volunteer hours', listNote: 'Edit anyone’s details, change the order, remove people or add someone. Teams apply to volunteers and confirmed players; enter hours for volunteers only (blank means not recorded). Save teams and hours with the button below.', unassigned: 'No team', hoursPh: 'Hours', remove: 'Remove', sureShort: 'Sure?', noneYet: 'Nobody has signed up yet.',
    autoTeams: 'Split into two teams by age', fill4: 'Give all volunteers 4 h', saveList: 'Save teams and hours', autoDone: 'Teams drafted by age. Click “Save teams and hours” to keep them.',
    photosN: n => `Photos (${n})`, photoNote: 'Upload only photos that can be public, and leave out children marked “No photos”.', upload: 'Upload', pickFirst: 'Choose photos first', upFail: (n, e) => `Photo ${n} failed: ${e}`, upProg: (n, t) => `Uploaded ${n}/${t}`, del: 'Delete', sureDel: 'Confirm delete',
    repTitle: 'Event report', repNote: 'Generated in the AYLUS report format. Save the volunteer hours first, then click Generate.', highlight: 'This week’s highlight (optional, one or two sentences)', gen: 'Generate from template', title: 'Title', body: 'Body', publish: 'Publish to “Event reports”', saveRep: 'Save report', copyBtn: 'Copy full text',
    genOk: 'Generated. Edit if needed, then save.', genNoVol: 'Generated. No volunteer hours recorded yet, so there is no volunteer list.', needTB: 'Title and body are required', pubOk: 'Saved and published', draftOk: 'Saved as draft',
    nth: (y, n) => `${y} event #${n}`, fYear: 'Year', fMonth: 'Month', fEvent: 'Event', all: 'All', monthName: m => ['January','February','March','April','May','June','July','August','September','October','November','December'][m - 1],
    loadingArchive: 'Loading reports and photos from aylus.org…', photosIntro: 'Photos from reports on aylus.org plus photos uploaded here. New AYLUS reports show up automatically. Click a photo to enlarge; use the arrow keys to browse.',
    reportsIntro: 'Every Syosset-Woodbury basketball report on aylus.org since the 14th event of 2025, added automatically as new ones are posted.', aylusDown: '(aylus.org could not be reached right now, so only this site’s content is shown.)',
    photoCount: (e, n) => `${e} event${e === 1 ? '' : 's'}, ${n} photo${n === 1 ? '' : 's'}`, readReport: 'Read report', ownSite: 'This site', onAylus: 'View on aylus.org',
    fFirst: 'First name', fLast: 'Last name', fPref: 'Preferred name (optional)', fPrefPh: 'Leave blank if none', eFull: 'Please enter first and last name', needMig3: 'The site is being updated; please try again shortly (organizer: run 003_full_names.sql)', weekHours: 'This week', totalHours: 'Total hours', langBtn: '中文',
  },
};

function detect() {
  try { const s = localStorage.getItem('lang'); if (s === 'zh' || s === 'en') return s; } catch {}
  return 'zh'; // 默认中文，用户可切换
}
export let lang = detect();
export function setLang(l) { lang = l; try { localStorage.setItem('lang', l); } catch {} document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en'; }
export function t(key, ...args) { const v = D[lang][key] ?? D.zh[key] ?? key; return typeof v === 'function' ? v(...args) : v; }
export const fmtDate = d => (lang === 'zh' ? zhDate(d) : enDateLong(d));
setLang(lang);
