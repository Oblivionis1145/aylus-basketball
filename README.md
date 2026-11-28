# AYLUS 社区公益篮球活动网站

每周日 Syosset-Woodbury Community Park 篮球义工活动的网站，用来代替微信接龙。

**功能**
- 本周活动：时间地点、活动安排、规则说明、状态（正常 / 待定 / 取消），并自动显示 NWS 天气预报（遇雨雪会提示）
- 义工接龙和参加者接龙分开公示，所有人可见；义工不占参加者名额
- 账号：邮箱 + 密码登录；首次注册用邮件验证码确认邮箱；忘记密码用邮件验证码重设
- 登录后接龙报名：称呼、年龄、是否义工、是否参加训练后活动、是否不拍照；按报名先后排序，超出人数上限自动进候补，有人取消时自动顺延
- 后台编辑本周接龙：修改信息、上下调整顺序、移除、代报名
- 分组：组织者分 A 队 / B 队 / 训练与自由活动，或按年龄一键分队
- 义工时长：每位义工每次活动一个数值，**只有组织者能填和改**；义工可以看自己的累计和明细，所有人可看排行榜
- 照片墙：自动收录 aylus.org 上 Syosset-Woodbury 篮球报告里的照片（2025 年第 14 次起），加上组织者在本站上传的照片；按活动日期分组，可按年份、月份、场次筛选
- 活动报告：自动收录 aylus.org 上的全部相关报告，新报告发布后网站会自动显示（浏览器直接读取 aylus.org 的公开接口，无需后台任务）
- 中英双语：右上角一键切换，记住每个人的选择（活动报告本身是英文，与 AYLUS 网站一致）
- 每周报告：按 AYLUS 网站报告格式一键生成（标题、概述、安排、义工名单和时长），可修改、发布、复制全文

技术：纯静态网页（无需构建）+ [Supabase](https://supabase.com)（登录、数据库、照片存储）+ [Vercel](https://vercel.com) 托管。

## 上线步骤（一次性，约 20 分钟）

### 1. Supabase
1. 在 supabase.com 新建项目，Region 选 **East US**。
2. 左侧 **SQL Editor** → New query，把 `supabase/schema.sql` 全部粘贴进去，点 Run。
3. **Project Settings → API**，复制 `Project URL` 和 `anon public` key，填到 `js/config.js`（或发给 Claude 代填）。anon key 是公开密钥，放在网页里是安全的。
4. **Authentication → Email Templates**：在 **Confirm signup** 和 **Reset Password** 两个模板正文里都加一行 `验证码 / Code: {{ .Token }}`（网站让用户输入验证码，而不是点链接）。
5. 等第 2 步拿到网址后，回到 **Authentication → URL Configuration**，把 Site URL 和 Redirect URLs 都设为网站网址。

> Supabase 自带的发信服务每小时只能发很少几封邮件，只适合测试。正式给家长用之前，建议在 **Authentication → SMTP Settings** 接一个免费的发信服务（例如 Resend，每月 3000 封免费）。家长在同一台手机上登录一次后会一直保持登录，不用每周收邮件。

### 2. Vercel
1. 用 GitHub 账号登录 vercel.com → Add New Project → 选这个仓库。
2. Framework Preset 选 **Other**，其它都不用改，点 Deploy。
3. 得到 `xxx.vercel.app` 网址。以后每次往 `main` 推代码都会自动更新网站。
4. 正式网址：https://aylus-basketball.com（域名在 Cloudflare，DNS 记录设为 DNS only / 灰色云朵，指向 Vercel）。

### 3. 设自己为组织者
1. 打开网站，用你的邮箱登录一次。
2. 回到 Supabase SQL Editor 运行（换成你的邮箱）：
   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = '你的邮箱');
   ```
3. 刷新网站，顶部会出现“后台”。

## 数据库更新
已经上线的项目，每次有新的 `supabase/migrations/*.sql`，在 SQL Editor 里运行一次即可（`schema.sql` 已包含全部改动，新项目只需运行它和 `grants.sql`）。

## 每周怎么用
1. 后台 →“新建下一期”（日期自动 +7 天，第几回自动 +1），检查信息后保存。
2. 把网站链接发到微信群，大家登录后接龙。
3. 周六看天气，需要时把状态改成“待定”或“已取消”，并写公告。
4. 活动前在后台分组（可一键按年龄分队），保存后家长在首页能看到。
5. 活动后：填义工时长 → 上传照片（避开勾选了“不拍照”的孩子）→ 按模板生成报告 → 修改 → 发布，再“复制全文”贴到 AYLUS 网站。

## 文件
- `index.html`、`styles.css`：页面
- `js/app.js`：页面逻辑；`js/i18n.js`：中英文界面文字；`js/util.js`：日期、序数词、报告模板、名单排序
- `js/aylus.js`：读取并解析 aylus.org 报告（活动日期、编号、正文、照片）
- `js/config.js`：Supabase 地址和公开密钥
- `supabase/schema.sql`：数据库结构和权限规则（可重复运行）
