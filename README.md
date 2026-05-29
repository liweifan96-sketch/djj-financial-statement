# DJJ 财务报表 · 网页版

把你原来 Lark 多维表格 / Excel 的「11 张表 + 跨表公式」做成了一个网页应用。

- **完整保留公式联动**：填数据表 → 核对表 → 三张损益表，全部自动计算（前端 JS 用 HyperFormula 引擎跑你 Excel 里的 1147 个公式，含 94 个跨表引用）。
- **按月份切换**：顶部下拉随时查看任意历史月份。
- **一键新月份**：保留全部格式与公式，清空填写数据；损益表"上月"列自动带入上月"本月"数字做对比。
- **存储**：默认存浏览器本地；填入 Supabase 配置后即可跨设备、多人共享。
- **零构建**：纯静态 `index.html + app.js + seed-data.js`，丢到任何静态托管（GitHub Pages / Vercel / Netlify / Cloudflare Pages）或直接双击打开都能跑。

---

## 一、本地直接用（最快）

把这三个文件放同一文件夹，用浏览器打开 `index.html` 即可：

```
index.html
app.js
seed-data.js
```

> 注：HyperFormula 与 Supabase SDK 从 CDN 加载，本地打开需联网。数据存在该浏览器的 localStorage 里。

---

## 二、部署到 GitHub Pages

1. 新建一个仓库，把 `index.html`、`app.js`、`seed-data.js` 推上去（根目录）。
2. 仓库 → Settings → Pages → Source 选 `main` 分支 `/ (root)` → Save。
3. 等一两分钟，访问 `https://<你的用户名>.github.io/<仓库名>/`。

```bash
git init
git add index.html app.js seed-data.js supabase_schema.sql README.md
git commit -m "DJJ finance web app"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

---

## 三、接 Supabase（跨设备 / 多人共享）

1. 在 [supabase.com](https://supabase.com) 新建项目。
2. 进 SQL Editor，粘贴运行随附的 **`supabase_schema.sql`**（建 `djj_books` 表）。
3. 项目 → Settings → API，复制 **Project URL** 和 **anon public key**。
4. 打开网页，点右上角 **☁ 云端** → 填入 URL 和 Key → 连接。
5. 之后所有月份会自动双向同步；换设备打开、填同样的 URL+Key 即可看到。

> 配置只存在你本机浏览器，不会进代码仓库。anon key 是公开级别的密钥，配合 SQL 里的 RLS 策略使用；若需更严格权限，按 `supabase_schema.sql` 末尾注释切换到「登录后可写」。

---

## 四、每月怎么用

1. 顶部 **＋ 新月份** → 选新月份 + 基准月（一般选上一个月）→ 创建。
2. 系统自动：复制全部表格格式与公式、清空上月填写的明细、把上月"本月"数字搬到损益表"上月"列。
3. 在各 **数据表**（机型销售统计、门店流转、应收/应付账款、运输费等）蓝色单元格里填本月明细。
4. **核对表** 与 **三张损益表** 实时自动算出来——不用手动填汇总。

### 颜色含义
- **白底蓝边（可编辑）**：手填单元格。双击编辑，回车下移、Tab 右移。
- **浅绿底**：跨表自动公式（从别的表汇总过来）。
- **浅灰底**：本表内公式（小计、合计等）。

### 重要：数据表的合计行用的是固定区间
例如 机型销售统计 里 `=SUM(D211:D246)` 汇总悉尼的行。新明细请填在对应的行区间内（和原来 Excel 一样的逻辑）。若某门店行数超出，双击合计单元格把区间改大即可（如 `D211:D260`）。

---

## 五、改公式

所有公式就是单元格里的字符串，直接在网页上双击该格、输入 `=...` 即可改，立即重算并保存。想批量改逻辑，公式引擎在 `app.js` 里，纯前端，不用动数据库。

---

## 文件清单
| 文件 | 作用 |
|---|---|
| `index.html` | 界面与样式 |
| `app.js` | 公式引擎接入、表格渲染、月份管理、Supabase 同步 |
| `seed-data.js` | 你 2026.04 的真实数据 + 全部公式（初始种子） |
| `supabase_schema.sql` | Supabase 建表脚本 |
| `README.md` | 本说明 |
