# 校园二手集市 —— 校园闲置物品精准流转平台

> 课程设计项目。解决学校二手群"消息刷屏、不好找、过期信息多"的痛点，
> 提供一个**只面向本校学生**的闲置物品精准流转平台。

## 功能清单

| 模块 | 功能 |
|---|---|
| 账号 | 学校邮箱后缀白名单注册（校园准入）、登录、退出 |
| 首页 | 商品列表、6 大分类标签筛选（考研资料/运动器材/宿舍用品…）、关键词搜索、分页 |
| 发布 | 标题/分类/价格/自提地点/描述/图片（自动压缩，最多 3 张）/有效期 7·15·30 天 |
| 特色 | 可议价/不议价开关、收藏商品、**预约自提**（买家申请 → 卖家确认）、**交易完成标记**、**闲置到期自动下架**、发布者管理自己的帖子（编辑/延期/重新上架/删除） |
| 个人中心 | 我的发布（按状态管理）、我的收藏、我的预约 |

## 技术架构

```
浏览器
  │  HTTPS
  ▼
EdgeOne Makers（免费版）
  ├── Pages        静态托管 Next.js 前端
  └── Cloud Functions 运行 Next.js API 路由（Serverless）
        │
        ▼
Supabase（免费版）
  ├── Postgres     业务数据（items / profiles / favorites / reservations）
  ├── Auth         用户账号（密码哈希、会话）
  └── Storage      商品图片（item-images 桶，公开读）
```

**为什么这样选型（答辩可用）：**

- 不买服务器、不买数据库：Supabase 免费版含 500MB Postgres + Auth + 1GB 图片存储；EdgeOne Makers 免费版永久可用
- 不用 EdgeOne KV：KV 是最终一致性（最长 60 秒缓存延迟），仅支持 Edge Functions；
  收藏/预约需要即时反馈，且 Next.js 全栈跑在 Cloud Functions 上，所以用 Makers 官方模板同款方案 **Next.js + Supabase**
- 安全：密码哈希由 Supabase Auth 托管；数据访问走 Postgres 行级安全策略（RLS），
  用户只能改自己的数据；服务端接口二次校验邮箱后缀和商品归属

## 本地运行

### 1. 创建 Supabase 项目（约 3 分钟）

1. 打开 https://supabase.com 注册/登录，New Project（免费），记下地区任意
2. 左侧 **SQL Editor** → New query → 把 `supabase/schema.sql` 全文粘贴 → Run
   （建 4 张表 + RLS 策略 + 图片桶 `item-images` + 注册自动建档 trigger）
3. 左侧 **Project Settings → API**，记录：
   - `Project URL`
   - `anon public` key
   - `service_role` key

### 2. 配置环境变量

```bash
cp .env.local.example .env.local
```

编辑 `.env.local`：

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhb...
SUPABASE_SERVICE_ROLE_KEY=eyJhb...
NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS=你的学校邮箱后缀,如 stu.xxx.edu.cn
```

> 邮箱后缀决定哪些邮箱能注册（校园准入）。本地调试时可以先填 `example.com`，
> 然后用 `xxx@example.com` 注册测试。

### 3. 安装并启动

```bash
npm install
npm run dev
```

打开 http://localhost:3000 ，注册 → 登录 → 发布一件闲置试试。

## 部署到 EdgeOne Makers

前提：代码已在 GitHub/Gitee 仓库中。

1. 打开 Makers 控制台 https://console.tencentcloud.com/edgeone/pages → 新建项目
2. 关联你的 Git 仓库，框架选择 **Next.js**
   （Makers 对 Next.js 全栈零配置：自动识别构建命令 `npm run build`，无需手写输出目录）
3. 在项目的**环境变量**配置页，把 `.env.local` 里同样 4 个变量加进去
4. 部署，约 1-2 分钟。得到一个 `https://<项目名>.edgeone.app` 域名（免费 HTTPS）
5. （可选）绑定自己的域名，Makers 自动签 SSL 证书

之后每次 `git push` 自动重新部署。

## 数据库设计（课程设计文档素材）

```
profiles (用户资料)
  id          uuid  PK  ← 关联 auth.users
  email       text      学校邮箱（注册时后缀白名单校验）
  nickname    text      昵称
  created_at  timestamptz

items (闲置物品)
  id              uuid PK
  seller_id       uuid FK → profiles     发布者
  title           text                  标题(2-60字)
  description     text                  描述
  category        text                  books/exam/sports/dorm/electronics/other
  price           numeric(10,2)         价格
  negotiable      boolean               可议价 / 不议价
  status          text                  available→reserved→sold / expired
  image_urls      text[]                图片URL数组(≤3)
  pickup_location text                  自提地点
  created_at      timestamptz
  expires_at      timestamptz           到期自动下架时间点

favorites (收藏)
  user_id     uuid FK → profiles
  item_id     uuid FK → items
  PK(user_id, item_id)

reservations (预约自提)
  id          uuid PK
  item_id     uuid FK → items
  buyer_id    uuid FK → profiles
  note        text              买家留言
  status      text              pending / confirmed / cancelled
  created_at  timestamptz
  unique(item_id, buyer_id)     同一买家对同一商品只能预约一次
```

**关键设计说明：**

- **到期自动下架**：发布时写入 `expires_at`（now + 7/15/30 天）；所有列表/详情查询用
  `status='available' AND expires_at > now()` 过滤，过期商品即时不可见。schema.sql 里另附
  可选的 pg_cron 定时任务，把过期商品批量改标 `expired`
- **预约状态机**：买家创建 `pending` 预约 → 卖家确认后预约 `confirmed` 且商品转 `reserved`
  → 交易完成卖家点"标记交易完成"，商品转 `sold`；取消预约时若商品处于 `reserved` 则自动回 `available`
- **数据安全**：四张表全部启用 RLS；service_role key 只出现在服务端 API 路由，不出现在浏览器代码

## API 接口清单

| 方法 | 路径 | 说明 | 登录 |
|---|---|---|---|
| POST | /api/auth/register | 注册（服务端强制校验学校邮箱后缀） | - |
| POST | /api/auth/login | 登录（session 写入 HttpOnly cookie） | - |
| POST | /api/auth/logout | 退出登录 | - |
| GET | /api/items?category=&q=&page= | 商品列表（在售+未过期，分页 12 条/页） | - |
| POST | /api/items | 发布闲置 | ✓ |
| GET | /api/items/[id] | 详情（含收藏数、预约数、我的收藏/预约；卖家附预约列表） | 可选 |
| PATCH | /api/items/[id] | 编辑 / mark_sold 标记售出 / relist 重新上架 | ✓ 仅卖家 |
| DELETE | /api/items/[id] | 删除商品 | ✓ 仅卖家 |
| POST | /api/items/[id]/favorite | 收藏 | ✓ |
| DELETE | /api/items/[id]/favorite | 取消收藏 | ✓ |
| POST | /api/items/[id]/reservations | 预约自提 | ✓ |
| PATCH | /api/reservations/[id] | confirm 卖家确认 / cancel 取消 | ✓ 相关方 |
| POST | /api/upload | 上传商品图片（jpg/png/webp ≤1MB） | ✓ |

## 目录结构

```
campus-market/
├── middleware.ts                  # 会话刷新 + 登录保护（/publish /profile）
├── supabase/schema.sql            # 数据库结构 + RLS + 触发器 + 存储桶
├── src/
│   ├── lib/
│   │   ├── constants.ts           # 分类、有效期、邮箱白名单工具
│   │   ├── types.ts               # 数据模型
│   │   └── supabase/
│   │       ├── client.ts          # 浏览器客户端
│   │       ├── server.ts          # 服务端客户端（读写 cookie 会话）
│   │       └── admin.ts           # service role 客户端（注册/上传）
│   ├── components/                # Navbar / ItemCard / LogoutButton
│   └── app/
│       ├── page.tsx               # 首页
│       ├── login/ register/       # 登录注册
│       ├── publish/               # 发布页（图片压缩上传）
│       ├── item/[id]/             # 详情页（收藏/预约/卖家管理）
│       ├── profile/               # 个人中心（我的发布/收藏/预约）
│       └── api/                   # 上面清单中的全部接口
```

## 常见问题排查

**`Failed to load SWC binary`（极少数 Windows 机器）**

Next.js 的编译器 SWC 是原生二进制，个别电脑的杀毒/EDR 软件会拦截其加载。
解决：`npm install next --force` 重装；仍不行则在项目根目录新建 `babel.config.js`
（内容 `module.exports = { presets: ['next/babel'] };`），Next 会自动改用 Babel 编译，
功能完全等价（仅构建速度稍慢）。
