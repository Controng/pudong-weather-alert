# 浦东新区橙红天气预警周报 · 全自动系统

> 每周五早上 8:00（Asia/Shanghai）自动汇总**上周五到本周四**浦东新区的 **橙色 / 红色** 天气预警，发送邮件给指定收件人，同时在 GitHub Pages 上展示日历 + 原始数据表。

## 整套流程

```
┌────────────────────┐    ┌──────────────────┐    ┌────────────────┐
│ 每天 08:00 (Asia)  │    │ 每周五 08:00     │    │  每次 push 到   │
│ daily-scrape.yml   │    │ weekly-report.yml│    │  main 分支时   │
│ 抓上海气象预警页   │    │ 渲染邮件发出去   │    │ pages-deploy   │
└────────┬───────────┘    └─────────┬────────┘    └────────┬───────┘
         │                          │                       │
         ▼                          ▼                       ▼
   data/warnings.json  ───→  Gmail SMTP / Resend ──→  june.shao@disney.com
         │
         ▼
   docs/data/warnings.json (自动同步)
         │
         ▼
   GitHub Pages (H5 日历+表格)
```

---

## 💸 费用 — 全部 $0

| 项目 | 费用 | 备注 |
|---|---|---|
| **GitHub Pages**（H5 网页）| **永久免费** | 公开仓库无任何限制 |
| **GitHub Actions**（跑定时任务）| 免费 | 每月 2000 分钟额度，本项目用不到 5 分钟 |
| **Gmail SMTP**（发邮件）| 免费 | 每天 500 封限额，本项目一周只发 1 封 |
| **Resend**（备选邮件服务）| 免费 | 每月 3000 封额度 |

> 我现在部署的临时演示链接 `https://xxx.space.minimaxi.com` **几天后会失效**——那只是给你看效果的。**你上线后正式地址是 `https://你的用户名.github.io/pudong-weather-alert/`，GitHub Pages 永久免费托管**。

---

## 🚀 三步上线（全程 < 15 分钟）

### Step 1 · 建一个 GitHub 仓库

1. 注册 / 登录 https://github.com
2. 右上角 `+` → `New repository`
3. Repository name: `pudong-weather-alert` · **Public** · 不要勾任何初始化选项 → `Create repository`

### Step 2 · 把代码推上去

```bash
cd pudong-weather-alert
git init
git add .
git commit -m "init: pudong weather alert system"
git branch -M main
git remote add origin https://github.com/<你的用户名>/pudong-weather-alert.git
git push -u origin main
```

> 不想用命令行？直接 GitHub 网页 → `Add file` → `Upload files` → 把整个文件夹拖进去提交，效果一样。

### Step 3 · 准备发件（Gmail 方案，最简单）

发件人用 `chatchatjune@gmail.com` 是最简单的方案——**你直接拥有这个邮箱**，不需要额外注册服务、不需要验证域名。

**3.1 在 Gmail 里生成 App Password：**
1. 登录 Gmail 账号 → https://myaccount.google.com/security
2. 开启 **两步验证（2-Step Verification）**（如果还没开）
3. 开启后访问 https://myaccount.google.com/apppasswords
4. 应用名填 `pudong-weather` → `Create` → 复制 16 位密码（黄色字）

**3.2 在 GitHub 添加 Secrets：**

仓库 `Settings` → `Secrets and variables` → `Actions` → `New repository secret`，依次添加 4 个：

| Name | Value 示例 | 说明 |
|---|---|---|
| `GMAIL_ADDRESS` | `chatchatjune@gmail.com` | 你的 Gmail |
| `GMAIL_APP_PASSWORD` | `abcd efgh ijkl mnop` | 刚才生成的 16 位密码（**有空格就带空格**） |
| `EMAIL_FROM` | `Weather Bot <chatchatjune@gmail.com>` | 邮件显示的发件人 |
| `EMAIL_TO` | `june.shao@disney.com` | 收件人，多个用英文逗号 |

> 不想用 Gmail？也可以用 [Resend](https://resend.com)——免费注册，把 `RESEND_API_KEY` 加进 Secrets、删掉 Gmail 那个即可（代码里会自动切换）。`EMAIL_FROM` 仍要填**真实可发**的地址（Resend sandbox 阶段只能发给你自己）。

### Step 4 · 启用 GitHub Pages

仓库 `Settings` → 左侧 `Pages` → `Source` 选 **`GitHub Actions`**（不是 Branch）→ 等 1-2 分钟出页面：
```
https://<你的用户名>.github.io/pudong-weather-alert/
```

### Step 5 · 手动触发一次，验证

仓库 `Actions` 标签 → 左边选 `Daily scrape` → 右边 `Run workflow` → 等 30 秒
再选 `Weekly report` → `Run workflow` → 几分钟后看 `june.shao@disney.com` 邮箱

✅ 收到邮件 + H5 有数据，搞定！

---

## 📅 时区说明

GitHub Actions 用 UTC 排程。

| 任务 | cron | 北京时间 |
|---|---|---|
| 每日抓取 | `0 0 * * *` | 每天 08:00 |
| 每周汇总 | `0 0 * * 5` | 每周五 08:00 |

> 邮件里统计的「上周五 ~ 本周四」是基于脚本执行时 `今天-7天` ~ `今天-1天` 算的——所以哪怕你把 cron 改了时间，逻辑依然正确。

---

## 📊 数据源说明

**主源**：`https://sh.weather.com.cn/zhyj/index.shtml`
- 上海市气象局官方预警发布页
- 权威、零费用、HTML 稳定
- **限制**：只显示**当前生效**的预警，历史需要靠 GitHub Actions 每天抓取累积

**备用源**（主源抓不到时自动尝试）：
1. `https://www.12379.cn/sh.shtml` — **国家预警信息发布中心**，中国气象局直属机构，所有预警的源头
2. 上海市突发事件预警发布中心（如果存在）

**手动补充**（备用方案的备用）：
```bash
# 你看到一条重要预警（比如新闻里看到），想加进去
python scraper/manual_add.py \
  --type 高温 --level 红色 --area 浦东新区 \
  --date-from 2026-07-15 --date-to 2026-07-16 \
  --published-at "2026-07-15T12:06" \
  --description "浦东新区气象局2026年07月15日12时06分发布高温红色预警..."

# 加完之后 push 一下
git add data/warnings.json && git commit -m "manual: 7/15 高温红色" && git push
```

---

## 🗂 项目结构

```
pudong-weather-alert/
├── .github/workflows/
│   ├── daily-scrape.yml       # 每天 08:00 抓数据
│   ├── weekly-report.yml      # 每周五 08:00 发邮件
│   └── pages-deploy.yml       # 部署 H5 到 GitHub Pages
├── scraper/
│   ├── scraper.py             # 自动抓 sh.weather.com.cn + 备用源
│   ├── manual_add.py          # 手动加预警（备用方案的备用）
│   ├── requirements.txt
│   └── __init__.py
├── email/
│   ├── send_email.py          # 渲染 + Gmail SMTP / Resend
│   ├── requirements.txt
│   └── preview.html           # 上次跑出来的邮件预览
├── data/
│   └── warnings.json          # 历史数据仓库（GitHub Actions 每天更新）
├── docs/                      # GitHub Pages 源
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── data/
│       └── warnings.json      # 同步自 ../data/warnings.json
├── sample/                    # 本地测试用，部署完可删
│   ├── test_parser_logic.py
│   ├── test_email_render.py
│   ├── seed_sample_data.py
│   └── test_real_parsing.py
├── .gitignore
└── README.md
```

---

## 🛠 本地开发（可选）

```bash
# 1. 安装依赖
python3 -m venv .venv
source .venv/bin/activate
pip install -r scraper/requirements.txt
pip install -r email/requirements.txt

# 2. 灌入示例数据（这样不用联网就能看到效果）
python sample/seed_sample_data.py

# 3. 本地预览 H5
cd docs && python3 -m http.server 8000
# 浏览器打开 http://localhost:8000

# 4. 本地预览邮件
python email/send_email.py --render
# 浏览器打开 email/preview.html

# 5. 跑测试
python sample/test_parser_logic.py
python sample/test_email_render.py
```

---

## ❓ 常见问题

**Q1. 邮件发不出去？**
1. GitHub `Actions` 标签 → 选 `Weekly report` 跑的那次 → 看 log 最下面
2. 常见原因：
   - App Password 输错（**注意空格**，4 个一组共 16 字符）
   - Gmail 还没开两步验证就生成 App Password
   - Secrets 名字拼错（必须**全大写**、带下划线）

**Q2. 抓不到数据？**
1. `Actions` → `Daily scrape` 跑的那次 → 看 log
2. 上海气象网页改了结构：`scraper/scraper.py` 的 `fetch_primary()` 里改 CSS 选择器
3. 网络问题：GitHub Actions 服务器访问国内网站偶尔会慢，可以重试
4. 实在不行就用 `python scraper/manual_add.py ...` 手动加

**Q3. 想换发件人？**
改 Secrets 里的 `EMAIL_FROM` 即可（同时改 `GMAIL_ADDRESS` / `GMAIL_APP_PASSWORD` 或 `RESEND_API_KEY`）。

**Q4. 收件人想加多个？**
改 `EMAIL_TO`，多个用英文逗号：`june.shao@disney.com,chatchatjune@gmail.com`

**Q5. 想看历史几个月的数据？**
只要 `data/warnings.json` 一直被 GitHub Actions 提交进仓库（默认就是），历史会自动累积。H5 的日历可以翻月查看。

**Q6. Gmail SMTP 安全吗？**
- App Password 是**只能访问邮件发送**的受限凭证，无法登录你的 Gmail 账户
- 存在 GitHub Secrets 里，加密保存，仓库里看不到明文
- 跑完可以随时在 Google 账户里 revoke

**Q7. 这个系统跟迪士尼公司有关系吗？**
没有。**完全是你个人项目**。数据来自公开政府网站，邮件通过你自己的 Gmail 发出，只是收件人碰巧是 @disney.com 地址。

---

## 📜 免责声明

- 数据源为 [上海气象 · 预警发布](https://sh.weather.com.cn/zhyj/index.shtml) 与 [国家预警信息发布中心](https://www.12379.cn/)，仅供内部参考
- 实际生产/活动安排请以气象台官方发布为准
- 本项目为个人自动化工具，与迪士尼公司无任何关系

---

## 🆘 出问题了找我

跑不起来 / 邮件没收到 / 抓不到数据 → 直接把 GitHub Actions 报错截图发我，我看一眼就能修。
