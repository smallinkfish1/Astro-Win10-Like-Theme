[README.md](https://github.com/user-attachments/files/33048689/README.md)
# Win10 Blog

一个把博客做成 **Windows 10 桌面**的 Astro 主题。文章是文件，分类是磁贴，归档是"此电脑"，草稿丢进"回收站"。

```bash
npm install
npm run dev      # → http://localhost:4321
```

---

## 核心设计：桌面是壳，静态是# Win10 Blog · 把博客做成 Windows 10 桌面

<!-- 徽章：License 徽章已经可以用了。
     等你把仓库推到 GitHub 并接上 Actions 之后，可以再来补 Build / Coverage 徽章。

     [![Build](https://img.shields.io/badge/build-passing-brightgreen)](#)
     [![Astro](https://img.shields.io/badge/Astro-7.x-ff5d01)](#)
-->
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

**简体中文** | [English](#english-version)

---

## 目录

- [项目名称与简介](#项目名称与简介)
- [功能特性](#功能特性)
- [安装与快速开始](#安装与快速开始)
- [使用说明](#使用说明)
- [配置说明](#配置说明)
- [AI 使用情况声明](#ai-使用情况声明)
- [架构与技术设计](#架构与技术设计)
- [测试与验证](#测试与验证)
- [安全与隐私](#安全与隐私)
- [路线图与待办](#路线图与待办)
- [贡献指南](#贡献指南)
- [许可证](#许可证)
- [致谢](#致谢)

---

## 项目名称与简介

**Win10 Blog** —— 一个把博客做成 **Windows 10 桌面**的 Astro 主题。

通俗地说：访客打开你的站点，看到的不是一个传统的文章列表，而是一张**能双击的桌面**。文章是文件，分类是磁贴，标签是窗口，归档是「此电脑」，草稿丢进「回收站」。双击图标开窗口，窗口能拖动、能最小化、任务栏能切换，开始菜单里是真实的分类和标签。

界面上看起来像个 Windows 壳子，但**壳子只是壳子**：每一篇文章仍然有独立的静态页面，搜索引擎和 RSS 读到的还是老老实实的 HTML，和普通博客没有任何区别。**体验归体验，内容归内容。**

| 项目 | 值 |
| --- | --- |
| 项目名 | `win10-blog` |
| 版本 | `0.0.1` |
| 当前阶段 | **第七阶段已完成**（记事本 + 控制面板） |
| Node 要求 | `>=22.12.0` |
| 是否已发布到 npm | 否 |
| 线上演示地址 | <!-- TODO: 部署后补上演示站地址，例如 https://your-domain.com --> |
| 文档语言 | 简体中文为主，README 提供英文版 |

> **这个项目现在处于什么状态？**
> 核心桌面体验、五套自动化验收脚本、七篇示例文章都已跑通，可以当主题用起来了。但它**还没有正式对外发布**，版本号停在 `0.0.1`，也**没有开源许可证文件**（见[许可证](#许可证)一节）。如果你打算认真使用，请先把它当作「可以跑的半成品」而不是「成熟的第三方主题」。

---

## 功能特性

### 桌面与窗口系统

- **Windows 10 风格桌面**：壁纸、图标网格、双击打开、右键菜单（浏览器默认右键已屏蔽）
- **可拖拽窗口**：基于 `react-rnd`，拖动、八向缩放，窗口之间用 `z-index` 层叠，点击任意位置自动置顶
- **窗口动画**：开窗 / 关窗 / 最小化走 `AnimatePresence`，约 `0.28s` 的缩放+淡入淡出
- **窗口稳定身份（`uid`）**：窗口有一个创建后永不变的 `uid`，专门用于动画系统的 `key`；见[架构设计](#架构与技术设计)中的说明
- **最小化 / 最大化 / 关闭**：标准三按钮，关闭时正确清理 store 与任务栏
- **移动端适配**：窗口宽度 `≤768px` 时，所有窗口自动变成**全屏卡片**，禁用手势拖拽

### 任务栏与开始菜单

- **任务栏**：显示当前打开的窗口，点击切换 / 最小化，右侧为时钟
- **开始菜单**：点击左下角 Windows 徽标展开，内含**真实的分类与标签**入口
- **磁贴（Tiles）**：开始菜单里的磁贴对应站点分类，点击即以窗口形式打开列表，共 10 个磁贴

### 六类内置「应用」（窗口视图）

| 应用 | 组件 | 做什么 |
| --- | --- | --- |
| 文章阅读器 | `ArticleView.tsx` | 在窗口里渲染 Markdown / LaTeX 正文，右侧带目录（TOC），支持行/列定位 |
| 资源管理器 | `ExplorerView.tsx` | 「此电脑」式归档浏览，按年份 / 分类 / 标签组织 |
| 浏览器 | `BrowserView.tsx` | 站内导航页，含友情链接与「找到我」社交链接 |
| 记事本 | `NotepadView.tsx` | 第七阶段新增，纯文本编辑体验 |
| 控制面板 | `ControlPanelView.tsx` | 第七阶段新增，左侧分类 + 右侧设置项，可切换壁纸 / 主题 / 语言等 |
| 回收站 | `DraftsView.tsx` | 展示标记为草稿的文章 |

### 内容与排版

- **Markdown 全文支持**：代码高亮、表格、引用块、任务列表
- **LaTeX 数学公式**：`remark-math` + `rehype-katex`，代码窗口里也能正确渲染
- **代码块窗口**：代码可以弹出到独立窗口查看
- **RSS 与 Sitemap**：`/rss.xml` 与 `/sitemap.xml` 均为构建期静态生成
- **站内搜索索引**：构建期产出 `/search-index.json`，**但前端 UI 尚未接入**（见[路线图](#路线图与待办)）

### 主题与外观

- **毛玻璃（Frosted Glass）**：窗口、任务栏、开始菜单使用 `backdrop-filter` 毛玻璃
- **暗色 / 亮色模式**：全局 CSS 变量驱动，切换即时生效
- **多套壁纸**：壁纸选择器内置若干方案，支持用户自行放入图片
- **社交链接图标**：9 个平台图标以**本地 SVG** 形式随仓库分发（GitHub / RSS / Email / Sitemap / Bilibili / YouTube / Discord / X / Twitter）

### SEO 与可访问性

- **SEO 不妥协**：**每一篇文章都有独立的静态路由**（`/posts/<slug>/`），分类页、标签页同样是静态路由。桌面 UI 是渐进增强，不是内容容器。
- **可访问性**：交互元素带 `aria-label`，窗口关闭按钮等有明确语义
- **外链安全**：所有 `target="_blank"` 的外链都带 `rel="noopener noreferrer"`；站内路径（RSS / Sitemap / `mailto:`）保持当前标签页打开

### 自动化验收

- **五套 Playwright 验收脚本**，合计 **195 条断言**，一条命令全跑
- 另有一套针对「控制面板僵尸窗口」bug 的**专用回归脚本**（6 条断言）

---

## 安装与快速开始

### 环境要求

- **Node.js `>=22.12.0`**（`package.json` 中已声明）
- npm（随 Node 安装即可，本项目未使用 pnpm / yarn 的锁文件）
- 一个现代浏览器（验收脚本使用 Playwright 内置 Chromium）

### 三步跑起来

```bash
# 1. 进入项目目录
cd win10-blog-stage5

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

启动后终端会打印本地地址，通常是：

```
http://localhost:4321
```

用浏览器打开即可看到桌面。

### 其他常用命令

```bash
# 生产构建（输出到 dist/）
npm run build

# 本地预览构建产物
npm run preview

# 类型与模板检查（应输出 0 errors, 0 warnings）
npx astro check

# 跑全部五套验收脚本（需要开发服务器已在运行）
npm run verify

# 先构建，再跑验收
npm run verify:build
```

> ⚠️ **`astro preview` 同一目录只能开一个实例**，而且它只监听 IPv6 的 `[::1]`。
> 如果你看到端口占用或访问不到，先执行 `npx astro preview stop` 释放。

---

## 使用说明

### 作为主题使用（访客视角）

打开站点后，你会得到一张桌面：

1. **双击桌面图标** → 打开对应窗口
2. **拖动标题栏** → 移动窗口；拖动边缘 → 缩放窗口
3. **点击任务栏按钮** → 切换 / 最小化对应窗口
4. **点左下角徽标** → 展开开始菜单，里面是分类和标签
5. **窗口右上角三个按钮** → 最小化 / 最大化 / 关闭
6. **窄屏（≤768px）** → 窗口自动变全屏卡片，跟手机上用 App 一样

### 作为主题作者使用（维护者视角）

日常维护基本只碰三个地方：

| 我想改… | 去哪里改 |
| --- | --- |
| 写新文章 | `src/content/blog/` 下新建 `.md` |
| 改站点名、简介、头像 | `src/config/site.ts` |
| 改社交链接 / 友情链接 | `src/config/site.ts` |
| 改开始菜单磁贴 | `src/config/tiles.ts`、`src/config/startMenu.ts` |
| 改桌面图标布局 | `src/components/desktop/` |
| 换壁纸 | `public/wallpapers/` + `src/lib/wallpaper.ts` |
| 改样式变量（配色） | `src/styles/global.css` |

### 写一篇文章

在 `src/content/blog/` 下新建 `my-post.md`：

```markdown
---
title: 我的第一篇文章
date: 2025-01-01
category: 随笔
tags: [Astro, 前端]
draft: false
---

正文从这里开始。支持 **Markdown**、表格、代码块，也支持 LaTeX：

$$
E = mc^2
$$
```

保存后开发服务器会自动刷新。**每篇文章都会自动获得一个独立静态路由**，你不需要做任何额外配置。

> `draft: true` 的文章不会出现在正常列表里，而是进入「回收站」窗口。

---

## 配置说明

### 站点个人信息 —— `src/config/site.ts`

这是**唯一的数据真相来源**。头像支持三种方式，优先级从高到低：

```ts
// src/config/site.ts（节选，以下是示意，请以仓库中的实际内容为准）
export const PROFILE: SiteProfile = {
  name: "你好，我是站长",
  bio: ["第一段自我介绍", "第二段自我介绍"],

  // ① 互联网地址 —— 优先级最高，填了就优先用它
  // avatarUrl: "https://avatars.githubusercontent.com/u/9919?s=200&v=4",

  // ② 本地文件 —— 放在 public/ 下，路径必须以 / 开头
  // avatar: "/avatar.jpg",

  // ③ 兜底 —— 上面两个都没有时显示这个
  emoji: "👤",
};
```

**怎么改**：把你自己的图片链接填进 `avatarUrl`，或者把图片丢进 `public/` 然后填 `avatar: "/你的文件名.jpg"`。

> ⚠️ 两个坑：
> 1. 本地路径**必须以 `/` 开头**。写成 `"avatar.jpg"` 的话，在 `/posts/xxx/` 这种二级页面下会变成 `/posts/xxx/avatar.jpg`，直接 404。
> 2. 远程图片挂了会留一个空圆圈，看起来像代码坏了。所以组件里做了 `onError` 兜底，加载失败自动退回 emoji。

### 社交链接 —— `src/config/site.ts` 的 `SOCIALS`

社交链接全部集中在 `SOCIALS` 数组里，**三处界面共用同一份数据**：

```ts
export const SOCIALS: SocialLink[] = [
  { name: "GitHub",  href: "https://github.com",        note: "源码",   icon: "github" },
  { name: "RSS",     href: "/rss.xml",                  note: "订阅",   icon: "rss" },
  { name: "Email",   href: "mailto:me@example.com",     note: "联系",   icon: "email" },
  { name: "Sitemap", href: "/sitemap.xml",              note: "站点地图", icon: "sitemap" },
  { name: "Bilibili", href: "https://space.bilibili.com/", note: "视频", icon: "bilibili" },
  { name: "YouTube",  href: "https://www.youtube.com/@",   note: "频道", icon: "youtube" },
  { name: "Discord",  href: "https://discord.com/users/",  note: "社群", icon: "discord" },
  { name: "X",        href: "https://x.com/",              note: "动态", icon: "x" },
  { name: "Twitter",  href: "https://twitter.com/",        note: "旧号", icon: "twitter" },
];
```

> ⚠️ **当前仓库里这些 `href` 全是占位符**（只写了平台首页，没带你的用户名），联系邮箱也是示例值 `me@example.com`。
> 换成你自己的地址之后可以删掉这些示例项，或者加 `hidden: true` 隐藏。

**字段含义**：

| 字段 | 说明 |
| --- | --- |
| `name` | 显示名称，也用于无障碍读屏 |
| `href` | 跳转地址。站内路径以 `/` 开头；站外地址必须以 `http` 开头才会新开标签页 |
| `note` | 右侧的补充说明文字 |
| `icon` | 本地图标文件名（不含 `.svg`），对应 `public/icons/social/<icon>.svg` |
| `iconUrl` | 互联网图标地址，填了优先用它 |
| `bg` | 图标底色，不填则走 CSS 变量 |
| `hidden` | 设为 `true` 则不显示 |

**新增一个平台**：

1. 把图标 SVG 放进 `public/icons/social/`，文件名就是 `icon` 的值；
2. 在 `SOCIALS` 里加一行。

> 💡 推荐用**本地 SVG**而不是远程图标。远程图标哪一天源站改了路径，你的页面就悄悄变成一排空白方块，而且本地开发时不一定发现。

### 友情链接 —— `src/config/site.ts` 的 `FRIEND_LINKS`

友情链接与社交链接在同一个文件里，结构类似（`name` / `url` / `desc` / `icon`），显示在浏览器窗口的导航页里。

### 开始菜单与磁贴 —— `src/config/tiles.ts`、`src/config/startMenu.ts`

磁贴对应分类，点击后以窗口形式打开。想加分类入口，改这两个文件即可。

### 壁纸 —— `public/wallpapers/`

把图片放进 `public/wallpapers/` 即可被壁纸选择器识别。

> ⚠️ **本项目仓库里并没有附带壁纸图片**，只放了一个说明用的 `README.md`。你需要自己准备图片，否则壁纸相关验收会有一批「预期的 404」。验收脚本已经把这批 404 单独区分开，不会算作失败。

### 样式变量 —— `src/styles/global.css`

亮色 / 暗色 / 毛玻璃的颜色全部走 CSS 变量，改配色只需要改这个文件里的变量。

> ⚠️ 有一组 `.social-*` 与 `.avatar-box` 样式**故意放在全局 CSS 里**，因为社交链接要在**三处**渲染（静态关于页 / 窗口版关于页 / 浏览器窗口的「找到我」），它们分属 Astro 与 React 两套模板系统，没法共用一个组件文件。所以约定：**数据真相在 `site.ts`，样式真相在 `global.css`，组件只决定摆放方式**。

---

## AI 使用情况声明

> 这一节是本项目 README 里最重要的一节，请**完整读完**再决定是否使用。

### 这个项目是怎么写出来的

**本项目的绝大部分代码由 AI 生成，不是人工逐行手写的。** 项目的需求提出、功能验收、bug 复现与最终决策由人类项目所有者完成；代码实现、重构、文档撰写主要由 AI 辅助完成。

### 使用了哪些工具

| 项目 | 内容 |
| --- | --- |
| AI 工具 / 模型名称 | <!-- TODO: 请补全实际使用的工具与模型名称。如果你有多个（例如不同阶段用了不同模型），请全部列出。 --> |
| AI 工具版本 | <!-- TODO: 如果知道具体版本号请填写；不确定可以写"未记录"。 --> |
| 主要用途 | 代码实现、代码重构、bug 定位与修复、自动化验收脚本编写、文档撰写 |
| 人工参与的部分 | 需求定义、功能验收、bug 复现路径确认、最终代码取舍、发布决策 |

### 哪些部分是 AI 生成的

**基本上全部源代码都是。** 包括但不限于：

- `src/` 下的所有 Astro 页面、React 组件、状态管理、工具函数
- `src/styles/global.css` 的全部样式
- 根目录下五套 `verify-*.mjs` Playwright 验收脚本
- `public/icons/social/` 下 9 个社交图标（6 个从 Simple Icons CDN 下载，`email.svg` 取自 Gmail 图标，`twitter.svg` 与 `sitemap.svg` 为手工编写后校验）
- 项目中所有的 `.md` 说明文档（含本文件）

### AI 生成内容经过了怎样的审查

- **自动化验证**：五套 Playwright 脚本共 **195 条断言**，覆盖桌面、窗口、路由、毛玻璃、动画、暗色模式、开始菜单、磁贴、壁纸、图标、记事本、控制面板等
- **静态检查**：`npx astro check` 当前输出 `0 errors, 0 warnings`
- **构建验证**：`npm run build` 可正常产出静态站点
- **人工验收**：项目所有者对每个阶段的功能逐项手动验收，并主动复现了若干 AI 未发现的边界 bug（例如「控制面板切换分类动画中途关窗，窗口残留且拖动回弹」这一条，就是人工发现后才被定位修复的）
- **已修复的重要 bug**：见[架构与技术设计](#架构与技术设计)一节

### 使用者需要注意什么

> ⚠️ **风险提示（请务必阅读）**

1. **AI 生成的代码可能包含错误、安全隐患或过时写法。** 虽然本项目经过了上述验证，但验证覆盖的是**已知场景**，无法保证没有遗漏。
2. **本项目尚未经过第三方安全审计。** 如果你要在生产环境使用，请自行做安全评估。
3. **本项目采用 MIT 许可证**（见 [`LICENSE`](./LICENSE)）。MIT 是宽松许可：允许商用、修改、再分发，但**不提供任何担保**。
4. **AI 生成代码的版权归属在不同司法辖区存在法律不确定性。** 使用者应自行评估相关风险。
5. **请勿直接用于法律、医疗、金融等高风险场景。**

### 我们对 AI 透明度的承诺

我们相信：**用 AI 写代码没问题，藏着不说才有问题。** 所以这一节写得比很多项目都长。如果你发现本项目中任何一处说明与实际代码不符，欢迎提 issue —— 这比代码本身的 bug 更值得优先修。

---

## 架构与技术设计

### 技术栈

| 层面 | 选型 | 说明 |
| --- | --- | --- |
| 框架 | **Astro 7** | 内容为主的静态站点，构建期生成全部 HTML |
| 交互岛 | **React 19** | 只在水合（hydrate）需要交互的部分使用 |
| 状态管理 | **Zustand 5** | 窗口栈、主题等全局状态，轻量且无 Provider 嵌套 |
| 样式 | **Tailwind CSS 4** + 全局 CSS 变量 | Tailwind 走 Vite 插件；主题色走 CSS 变量 |
| 动画 | **motion 14**（原 framer-motion） | 导入路径是 `motion/react` |
| 窗口拖拽 | **react-rnd 10** | 拖动 + 缩放，**受控组件** |
| Markdown | `marked` + `@astrojs/markdown-remark` | 构建期与运行期两条链路 |
| 数学公式 | `remark-math` + `rehype-katex` + `katex` | LaTeX 渲染 |
| 类型 | **TypeScript 6** | `tsconfig.json` 继承 `astro/tsconfigs/strict` |
| 验收 | **Playwright 1.63** | 五套脚本，驱动真实浏览器 |

### 目录结构

```
win10-blog-stage5/
├── src/
│   ├── components/
│   │   ├── article/       # 文章正文相关
│   │   ├── desktop/       # 桌面、图标网格
│   │   ├── social/        # 社交链接（Astro 版，静态关于页用）
│   │   ├── taskbar/       # 任务栏、开始菜单
│   │   └── window/        # 窗口系统
│   │       └── views/     # 六类应用视图（文章/资源管理器/浏览器/记事本/控制面板/回收站）
│   ├── config/            # ⭐ 数据真相来源
│   │   ├── site.ts        #    站点信息、社交链接、友情链接
│   │   ├── tiles.ts       #    磁贴
│   │   └── startMenu.ts   #    开始菜单
│   ├── content/blog/      # ⭐ 文章源文件（Markdown）
│   ├── hooks/             # 自定义 hooks
│   ├── layouts/           # 页面布局
│   ├── lib/               # 工具函数
│   │   ├── markdown.ts    #    Markdown 解析
│   │   ├── posts.ts       #    文章读取与分类
│   │   ├── theme.ts       #    主题（亮/暗）
│   │   ├── wallpaper.ts   #    壁纸
│   │   ├── tiles.ts       #    磁贴逻辑
│   │   └── latex.ts       #    LaTeX 归一化
│   ├── pages/             # ⭐ 静态路由（SEO 的关键）
│   │   ├── index.astro    #    桌面
│   │   ├── about.astro    #    关于页
│   │   ├── archive.astro  #    归档
│   │   ├── drafts.astro   #    草稿 / 回收站
│   │   ├── settings/      #    设置页
│   │   ├── posts/         #    文章（每篇一个独立静态页）
│   │   ├── category/      #    分类
│   │   ├── tags/          #    标签
│   │   ├── rss.xml.ts     #    RSS
│   │   ├── sitemap.xml.ts #    Sitemap
│   │   └── search-index.json.ts  # 搜索索引（UI 未接入）
│   ├── store/windowStore.ts   # ⭐ 窗口状态（含 uid 机制）
│   └── styles/global.css      # ⭐ 样式变量 + 共用类
├── public/
│   ├── icons/social/      # 9 个社交平台 SVG
│   └── wallpapers/        # 壁纸（需自行放入图片）
├── verify-all.mjs         # 一键跑五套验收
├── verify.mjs             # 基础桌面/窗口/路由
├── verify-theme.mjs       # 毛玻璃/动画/暗色模式
├── verify-tiles.mjs       # 开始菜单/磁贴
├── verify-desktop.mjs     # 壁纸/图标/三个新窗口
├── verify-apps.mjs        # 记事本/控制面板
└── verify-control-fix.mjs # 控制面板僵尸窗口专用回归
```

### 三个关键设计决策

#### ① 窗口的「稳定身份」`uid`（踩过的坑）

窗口状态里同时存在 `uid` 和 `id`：

- **`id`**：可以被**原地修改**。比如控制面板点左侧「外观」切到「关于」，窗口 `id` 从 `control:appearance` 变成 `control:about`，但**并没有新建窗口**。
- **`uid`**：窗口创建时分配一次，此后**永不改变**。

**为什么必须有 `uid`**：`AnimatePresence` 判断「哪个子元素还在」**完全靠 `key`**。如果拿会变的 `id` 当 `key`，那么切分类的瞬间，在它的视角里就是「旧 key 消失了 + 新 key 出现了」——于是它给**同一个窗口**同时启动了退出动画和进场动画。

这会导致一个很难查的 bug：**在动画播完前（约 0.28 秒内）点右上角关闭**，任务栏按钮消失了，但窗口还画在屏幕上；拖动那个残留窗口，松手后会弹回原位（因为 `react-rnd` 是受控组件，它按 store 里的旧坐标重新渲染，而窗口早已不在 store 里）。

**修法**：给 `AnimatePresence` 用 `uid` 当 `key`，`renderContent()` 里继续用 `id`。

> 记住这句话：**`key` 管"这是不是同一个东西"，`id` 管"里面显示什么内容"。这是两件事。**

#### ② SEO 优先：桌面是渐进增强

桌面 UI 完全是客户端渲染的，但内容**不是**。所有文章、分类、标签页面都在构建期生成为独立静态 HTML 路由。搜索引擎、RSS 阅读器、以及禁用了 JS 的浏览器，看到的都是标准博客页面。桌面壳子只是给人的一份额外礼物。

#### ③ 数据与样式分离

社交链接要在三个地方渲染，跨越 Astro（构建期）和 React（运行期）两套模板系统，没法共用一个组件文件。约定：

- **数据真相** → `src/config/site.ts`
- **样式真相** → `src/styles/global.css`（`.social-*` / `.avatar-box`）
- **组件** → 只负责「怎么摆」

这样避免了「网页上加了 B 站、窗口里还是老样子」这种数据漂移。

---

## 测试与验证

### 怎么跑

```bash
# 方式一：开发服务器已经开着，直接跑
npm run verify

# 方式二：先构建再跑（更接近生产环境）
npm run verify:build
```

### 五套验收脚本

`verify-all.mjs` 会依次跑下面五套。**顺序不是随意的**——从「最基础、坏了后面全崩」排到「最上层、依赖前面都对」：

| 顺序 | 脚本 | 覆盖范围 | 断言数 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | `verify.mjs` | 基础桌面 / 窗口 / 路由 | 29 | ✅ 全绿 |
| 2 | `verify-theme.mjs` | 毛玻璃 / 动画 / 暗色模式 | 34 | ✅ 全绿 |
| 3 | `verify-tiles.mjs` | 开始菜单 / 磁贴 | 43 | ✅ 全绿 |
| 4 | `verify-desktop.mjs` | 壁纸 / 图标 / 三个新窗口 | 52 | ✅ 全绿 |
| 5 | `verify-apps.mjs` | 记事本 / 控制面板（第七阶段） | 31 | ✅ 全绿 |
| — | `verify-control-fix.mjs` | 控制面板僵尸窗口回归（单独跑） | 6 | ✅ 全绿 |
| | | **合计** | **195** | **全绿** |

> 上表数字来自实际运行输出，不是估算。

### 关于壁纸的「预期 404」

仓库里没有壁纸图片，所以 `verify-desktop.mjs` 会检测到一批 `/wallpapers/*` 的 404。脚本把这批**单独归类为「预期内」并打印清单**，不计入失败。除它之外任何 404 都会算失败。

### 类型与构建检查

```bash
npx astro check   # 期望输出：0 errors, 0 warnings
npm run build     # 期望输出：构建成功
```

### 已知的验证边界

- 验收脚本运行在 Playwright 的 Chromium 上，**未覆盖 Firefox / Safari / 真机移动端**
- 断言针对的是 DOM 结构与计算样式，**不是像素级视觉对比**
- 动画相关的断言依赖时间窗口，在极慢的机器上可能偶发不稳定

---

## 安全与隐私

### 本站自身

- **纯静态站点**：构建产物是 HTML / CSS / JS 文件，**没有后端、没有数据库、没有服务端运行时**
- **不收集用户数据**：项目代码中**不包含任何分析统计（analytics）或第三方追踪脚本**
- **不设置追踪 Cookie**：主题、壁纸等偏好设置仅存于浏览器本地
- **无用户账户系统**：没有登录、注册、评论等功能

> ⚠️ **但请注意**：如果你把它部署到某个平台（Vercel / Netlify / Cloudflare Pages 等），**平台自身的日志与统计策略不由本项目控制**。请查阅你所使用平台的隐私政策。如果你在站点里自行加入了评论系统或统计脚本，请相应更新这一节。

### 供应链

- 依赖全部来自 npm 官方源，锁文件 `package-lock.json` 已提交
- 项目启用了 `allowScripts: { "esbuild": true }`，即只允许 `esbuild` 的安装脚本运行，其余依赖的 postinstall 脚本被拦截

### 报告安全问题

<!-- TODO: 请填写安全问题的报告渠道。建议写上你的邮箱或"请通过 GitHub Security Advisory 私下报告"。
     在此之前，请注意：本项目尚未经过安全审计，请勿报告后又期待快速的官方响应。 -->

**请不要通过公开 issue 报告安全漏洞。**

### 一个诚实的说明

本项目**没有经过任何第三方安全审计**，且如上文所述，**代码主要由 AI 生成**。将它用于处理敏感信息的场景之前，请务必自行审查代码。

---

## 路线图与待办

### ✅ 已完成

- [x] 桌面、图标网格、双击打开
- [x] 可拖拽 / 缩放的窗口系统
- [x] 任务栏、开始菜单、磁贴
- [x] 文章阅读器、资源管理器、浏览器三个基础应用
- [x] Markdown + LaTeX 渲染
- [x] 毛玻璃、动画、暗色模式
- [x] 壁纸选择器
- [x] 移动端全屏卡片适配
- [x] RSS / Sitemap / 搜索索引生成
- [x] 关于页 + 9 个社交链接（本地 SVG 图标）
- [x] 记事本、控制面板（第七阶段）
- [x] 五套 Playwright 验收脚本（195 条断言）
- [x] 控制面板僵尸窗口 bug 修复 + 专用回归脚本

### 🚧 计划中

- [ ] **任务栏双显示模式**：支持「仅图标」与「图标 + 窗口名」两种模式切换，后者要求**每个窗口按钮等宽**
- [ ] **站内搜索 UI**：`/search-index.json` 已经在构建期生成了，但**目前没有任何界面消费它**，需要把界面接上
- [ ] **窗口位置持久化**：目前刷新页面窗口位置会重置
- [ ] **回收站显示草稿原文**：`markdown.ts` 里已经有 `raw` 字段可用，但草稿视图还没用上
- [ ] **磁贴拖拽排序**：开始菜单的磁贴目前位置固定
- [ ] **浏览器多标签页**：浏览器窗口目前是单页导航

### 💭 考虑中（可能做，也可能不做）

- [ ] Aero Snap（拖到屏幕边缘自动吸附半屏）
- [ ] 桌面右键上下文菜单
- [ ] 键盘快捷键（`Alt+Tab` 切窗口、`Win` 开开始菜单）
- [ ] 窗口最大化 / 最小化的记忆恢复

### 🚫 明确不做（Out of Scope）

| 不做的事 | 原因 |
| --- | --- |
| 服务端渲染动态内容 / 后端 API | 本项目定位是**纯静态**博客主题。引入后端会破坏部署简单性和 SEO 静态性。 |
| 内置评论系统 | 评论需要一个持久化后端与内容审核责任。想加的话请接入第三方（如 Giscus），不要做进主题里。 |
| 用户账户 / 登录 | 同上，个人博客不需要账户体系。 |
| 完整复刻 Windows 10 的所有细节（如真实注册表、文件系统） | 壳子的目的是**表达内容**，不是做操作系统模拟器。过度模仿只会增加维护成本。 |
| 内置分析统计 | 隐私优先。需要统计请自行接入，并同步更新[安全与隐私](#安全与隐私)一节。 |

---

## 贡献指南

欢迎贡献！但在动手之前，请先读 **[CONTRIBUTING.md](./CONTRIBUTING.md)** —— 里面包含代码规范、提交信息格式，以及**特别重要的 AI 使用政策**（本项目由 AI 大量参与，我们对贡献中的 AI 使用有明确的披露要求）。

一句话版本：

1. 开 issue 说明你要做什么；
2. Fork 并新建分支；
3. 遵守风格，改完跑 `npm run verify` 确认 195 条断言仍全绿；
4. 提交信息里如实标注 AI 参与情况（`Assisted-by` / `Generated-by`）；
5. 提 PR。

> ⚠️ **不接受无法解释的代码。** 如果你提交了一段代码但说不清它为什么这么写，它会被要求重写。

---

## 许可证

**本项目采用 [MIT 许可证](./LICENSE)。**

你可以自由地使用、修改、分发本项目（包括商用），只需保留原始的版权声明与许可声明。本软件按「原样」提供，不附带任何形式的担保。

完整条款见仓库根目录的 [`LICENSE`](./LICENSE) 文件。

### 第三方资源许可

| 资源 | 来源 | 许可 |
| --- | --- | --- |
| 社交图标 SVG（6 个） | [Simple Icons](https://simpleicons.org/) CDN | CC0 1.0 Universal |
| `email.svg` | 基于 Gmail 图标轮廓 | 见 Google 品牌资源使用规范 |
| `twitter.svg`、`sitemap.svg` | 本项目手工编写 | 随本项目许可证 |
| 各 npm 依赖 | npm registry | 见各自 `package.json` |

> ⚠️ **平台图标属于各平台商标**，仅用于标识对应链接，不表示任何形式的背书或合作。

---

## 致谢

- **[Astro](https://astro.build/)** —— 静态优先的构建框架，本项目的 SEO 基础靠它
- **[React](https://react.dev/)** —— 交互岛
- **[Zustand](https://zustand-demo.pmnd.rs/)** —— 状态管理
- **[motion](https://motion.dev/)**（原 framer-motion）—— 窗口动画
- **[react-rnd](https://github.com/bokuweb/react-rnd)** —— 可拖拽可缩放的窗口
- **[Tailwind CSS](https://tailwindcss.com/)** —— 样式工具
- **[KaTeX](https://katex.org/)** —— 数学公式渲染
- **[Simple Icons](https://simpleicons.org/)** —— 社交平台图标
- **[Playwright](https://playwright.dev/)** —— 自动化验收

以及 —— **本项目的绝大部分代码由 AI 辅助生成**。详见 [AI 使用情况声明](#ai-使用情况声明)。

---

<div align="center">

**[⬆ 回到顶部](#win10-blog--把博客做成-windows-10-桌面)**

</div>

---

# English Version

**Win10 Blog** — an Astro theme that turns a blog into a **Windows 10 desktop**.

Instead of a conventional post list, visitors land on a **clickable desktop**. Posts are files, categories are tiles, tags are windows, the archive is "This PC", and drafts go to the "Recycle Bin". Double-click an icon to open a window; drag it, minimize it, switch it from the taskbar; the Start menu holds real categories and tags.

It *looks* like a Windows shell — but the shell is just a shell. **Every post still has its own static route.** Search engines and RSS readers see a plain, honest blog. **Experience is experience; content is content.**

| Field | Value |
| --- | --- |
| Name | `win10-blog` |
| Version | `0.0.1` |
| Stage | **Stage 7 complete** (Notepad + Control Panel) |
| Node | `>=22.12.0` |
| Published to npm | No |
| Live demo | <!-- TODO: add the deployed demo URL --> |
| Docs language | Primarily Simplified Chinese; English README provided below |

> **What state is this project in?**
> The core desktop experience, five automated verification suites (195 assertions), and seven sample posts all work — you can use it as a theme today. But it is **not officially released**: the version is still `0.0.1`, and there is **no open-source license file**. Treat it as a *working work-in-progress*, not a mature third-party theme.

## Table of Contents

- [Features](#features)
- [Installation & Quick Start](#installation--quick-start)
- [Usage](#usage)
- [Configuration](#configuration)
- [AI Usage Disclosure](#ai-usage-disclosure)
- [Architecture & Design](#architecture--design)
- [Testing & Verification](#testing--verification)
- [Security & Privacy](#security--privacy)
- [Roadmap & TODOs](#roadmap--todos)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgements](#acknowledgements)

## Features

**Desktop & window system**

- Windows 10-style desktop: wallpaper, icon grid, double-click to open, custom right-click menu
- Draggable & resizable windows via `react-rnd`, with stacking (`z-index`) and click-to-focus
- Open / close / minimize animations via `AnimatePresence` (~`0.28s`)
- **Stable window identity (`uid`)**: a never-changing `uid` used as the animation `key` (see [Architecture](#architecture--design))
- Mobile adaptation: at `≤768px` all windows become **fullscreen cards** and dragging is disabled

**Taskbar & Start menu**

- Taskbar with open windows, click to toggle/minimize, clock on the right
- Start menu with real categories and tags
- Tiles: 10 tiles mapping to site categories, opening as windows

**Six built-in "apps" (window views)**

| App | Component | Purpose |
| --- | --- | --- |
| Article reader | `ArticleView.tsx` | Renders Markdown / LaTeX with a table of contents |
| Explorer | `ExplorerView.tsx` | "This PC"-style archive browsing |
| Browser | `BrowserView.tsx` | In-site navigation, friend links, "Find me" social links |
| Notepad | `NotepadView.tsx` | Plain-text editing experience (Stage 7) |
| Control Panel | `ControlPanelView.tsx` | Left-hand categories + settings panel (Stage 7) |
| Recycle Bin | `DraftsView.tsx` | Shows posts marked as drafts |

**Content & typography**

- Full Markdown support: code highlighting, tables, blockquotes, task lists
- LaTeX math via `remark-math` + `rehype-katex`
- Code blocks can be popped out into a standalone window
- `/rss.xml` and `/sitemap.xml`, statically generated at build time
- A `/search-index.json` is generated at build time, **but no UI consumes it yet**

**Theme & appearance**

- Frosted glass (`backdrop-filter`) on windows, taskbar, and Start menu
- Dark / light mode driven entirely by CSS variables
- Multiple wallpapers with a picker — drop your own images in to extend
- 9 social platform icons shipped as **local SVG** files

**SEO & accessibility**

- **SEO is non-negotiable**: every post, category, and tag is a static route. The desktop UI is progressive enhancement, not the content container.
- `aria-label` on interactive elements
- Every external `target="_blank"` link carries `rel="noopener noreferrer"`; internal paths (`/rss.xml`, `/sitemap.xml`, `mailto:`) stay in the current tab

**Automated verification**

- Five Playwright suites, **195 assertions**, one command
- Plus a dedicated regression suite (6 assertions) for the Control Panel zombie-window bug

## Installation & Quick Start

**Requirements**

- **Node.js `>=22.12.0`** (declared in `package.json`)
- npm (bundled with Node; this project uses no pnpm/yarn lockfile)
- A modern browser (the verification scripts use Playwright's bundled Chromium)

```bash
# 1. Enter the project directory
cd win10-blog-stage5

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

The terminal prints a local URL, typically `http://localhost:4321`.

**Other commands**

```bash
npm run build        # Production build → dist/
npm run preview      # Preview the build output
npx astro check      # Expect: 0 errors, 0 warnings
npm run verify       # Run all five verification suites (dev server must be running)
npm run verify:build # Build first, then verify
```

> ⚠️ **`astro preview` allows only one instance per directory**, and it listens on IPv6 `[::1]` only. If the port is taken, run `npx astro preview stop` to release it.

## Usage

**As a visitor**

1. **Double-click a desktop icon** → opens the corresponding window
2. **Drag the title bar** → move a window; drag the edges → resize
3. **Click a taskbar button** → toggle / minimize that window
4. **Click the logo at the bottom-left** → open the Start menu (categories and tags)
5. **The three buttons top-right** → minimize / maximize / close
6. **Narrow screens (≤768px)** → windows become fullscreen cards automatically

**As a theme author**

| I want to change… | Go to |
| --- | --- |
| Write a new post | Create a `.md` in `src/content/blog/` |
| Site name, bio, avatar | `src/config/site.ts` |
| Social links / friend links | `src/config/site.ts` |
| Start menu tiles | `src/config/tiles.ts`, `src/config/startMenu.ts` |
| Desktop icon layout | `src/components/desktop/` |
| Wallpapers | `public/wallpapers/` + `src/lib/wallpaper.ts` |
| Colors / style variables | `src/styles/global.css` |

**Writing a post**

Create `src/content/blog/my-post.md`:

```markdown
---
title: My first post
date: 2025-01-01
category: Notes
tags: [Astro, Frontend]
draft: false
---

Body text goes here. **Markdown**, tables, and code blocks all work; so does LaTeX:

$$
E = mc^2
$$
```

The dev server hot-reloads. **Every post automatically gets its own static route** — no extra configuration needed. Posts with `draft: true` appear in the "Recycle Bin" window instead of normal listings.

## Configuration

**Site profile — `src/config/site.ts`**

This file is the **single source of truth**. The avatar supports three modes, in priority order:

```ts
export const PROFILE: SiteProfile = {
  name: "Hello, I'm the author",
  bio: ["First paragraph", "Second paragraph"],

  // ① Internet URL — highest priority
  // avatarUrl: "https://avatars.githubusercontent.com/u/9919?s=200&v=4",

  // ② Local file — placed under public/, path must start with /
  // avatar: "/avatar.jpg",

  // ③ Fallback emoji
  emoji: "👤",
};
```

> ⚠️ Two traps:
> 1. Local paths **must start with `/`**. Writing `"avatar.jpg"` resolves to `/posts/xxx/avatar.jpg` on nested pages and 404s.
> 2. A broken remote image leaves an empty circle that looks like broken code, so components include an `onError` fallback back to the emoji.

**Social links — `SOCIALS` in `src/config/site.ts`**

All social links live in one array **shared by three render sites** (static About page, window About view, and the Browser view's "Find me" panel).

```ts
export const SOCIALS: SocialLink[] = [
  { name: "GitHub",  href: "https://github.com",           note: "Source",  icon: "github" },
  { name: "RSS",     href: "/rss.xml",                     note: "Feed",    icon: "rss" },
  { name: "Email",   href: "mailto:me@example.com",        note: "Contact", icon: "email" },
  { name: "Sitemap", href: "/sitemap.xml",                 note: "Sitemap", icon: "sitemap" },
  { name: "Bilibili", href: "https://space.bilibili.com/", note: "Videos",  icon: "bilibili" },
  { name: "YouTube",  href: "https://www.youtube.com/@",   note: "Channel", icon: "youtube" },
  { name: "Discord",  href: "https://discord.com/users/",  note: "Community", icon: "discord" },
  { name: "X",        href: "https://x.com/",              note: "Updates", icon: "x" },
  { name: "Twitter",  href: "https://twitter.com/",        note: "Archive", icon: "twitter" },
];
```

> ⚠️ **Every `href` in the current repo is a placeholder** (bare platform homepages, no username), and the contact email is the example value `me@example.com`. Replace them with your own, then delete or hide (`hidden: true`) the ones you don't want.

| Field | Meaning |
| --- | --- |
| `name` | Display name; also used for screen readers |
| `href` | Target. Internal paths start with `/`; external URLs must start with `http` to open in a new tab |
| `note` | Supplementary text on the right |
| `icon` | Local icon filename without `.svg` → `public/icons/social/<icon>.svg` |
| `iconUrl` | Internet icon URL; takes priority over `icon` when set |
| `bg` | Icon background color; falls back to a CSS variable |
| `hidden` | Set to `true` to hide |

To add a platform: drop an SVG into `public/icons/social/` (the filename is the `icon` value) and add a line to `SOCIALS`.

> 💡 Prefer **local SVG** over remote icons. If a remote source changes its path, your page silently becomes a row of blank squares — and you may not notice during local development.

**Friend links — `FRIEND_LINKS`** live in the same file with a similar shape (`name` / `url` / `desc` / `icon`), rendered in the Browser window.

**Tiles & Start menu** — `src/config/tiles.ts` and `src/config/startMenu.ts`.

**Wallpapers** — drop images into `public/wallpapers/`.

> ⚠️ **The repo ships no wallpaper images**, only a placeholder `README.md`. You must supply your own, otherwise wallpaper verification reports a batch of *expected* 404s — which the suite already separates out and does not count as failures.

**Style variables** — `src/styles/global.css`.

> ⚠️ A set of `.social-*` and `.avatar-box` rules lives **in global CSS on purpose**: social links render in three places spanning Astro (build-time) and React (runtime), which cannot share a component file. Convention: **data truth lives in `site.ts`, style truth lives in `global.css`, components only decide layout.**

## AI Usage Disclosure

> This is the most important section of this README. Please read it **in full** before deciding whether to use the project.

**How this project was written**

**The vast majority of the code in this project was generated by AI, not hand-written line by line.** Requirements, functional acceptance, bug reproduction, and final decisions were made by the human project owner; implementation, refactoring, and documentation were largely AI-assisted.

| Field | Value |
| --- | --- |
| AI tools / models | <!-- TODO: list the actual tool and model names used. If different models were used at different stages, list them all. --> |
| AI tool version | <!-- TODO: fill in if known; "not recorded" is acceptable. --> |
| Primary uses | Implementation, refactoring, bug diagnosis and fixes, verification scripts, documentation |
| Human contributions | Requirements, acceptance testing, bug reproduction paths, final code decisions, release decisions |

**What was AI-generated**

Essentially everything under source control, including but not limited to:

- All Astro pages, React components, state management, and utilities under `src/`
- All of `src/styles/global.css`
- The five root-level `verify-*.mjs` Playwright suites
- The 9 social SVG icons in `public/icons/social/` (6 downloaded from Simple Icons; `email.svg` derived from the Gmail mark; `twitter.svg` and `sitemap.svg` hand-written and validated)
- All `.md` documentation in the project, **including this file**

**How the AI-generated content was reviewed**

- **Automated verification**: five Playwright suites totalling **195 assertions** covering the desktop, windows, routing, frosted glass, animation, dark mode, Start menu, tiles, wallpapers, icons, Notepad, and Control Panel
- **Static checks**: `npx astro check` currently reports `0 errors, 0 warnings`
- **Build verification**: `npm run build` produces a static site
- **Human acceptance**: the project owner manually accepted each stage and actively reproduced edge-case bugs the AI had missed — for example, the "close a window mid-animation on the Control Panel, leaving a zombie window that snaps back when dragged" bug was found by a human before it could be diagnosed and fixed
- **Notable bugs fixed**: see [Architecture & Design](#architecture--design)

**What you must be aware of**

> ⚠️ **Risk notice — please read**

1. **AI-generated code can contain bugs, security issues, or outdated patterns.** While this project passed the verification above, that verification covers *known scenarios* and cannot prove completeness.
2. **This project has not undergone any third-party security audit.** If you use it in production, perform your own security assessment.
3. **This project is released under the MIT License** (see [`LICENSE`](./LICENSE)). MIT is permissive: commercial use, modification, and redistribution are allowed, but **no warranty is provided**.
4. **Copyright status of AI-generated code is legally uncertain in several jurisdictions.** Users should assess this risk themselves.
5. **Do not use this in high-risk contexts** such as legal, medical, or financial systems.

**Our commitment to AI transparency**

We believe **using AI to write code is fine; hiding it is not.** That's why this section is longer than in most projects. If you find any statement here that doesn't match the actual code, please open an issue — that's worth fixing before any code bug.

## Architecture & Design

**Tech stack**

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | **Astro 7** | Content-first static site; all HTML generated at build time |
| Islands | **React 19** | Only where interaction requires hydration |
| State | **Zustand 5** | Window stack, theme; lightweight, no Provider nesting |
| Styling | **Tailwind CSS 4** + CSS variables | Tailwind via the Vite plugin; theme colors via CSS variables |
| Animation | **motion 14** (formerly framer-motion) | Import path is `motion/react` |
| Window dragging | **react-rnd 10** | Drag + resize — a **controlled** component |
| Markdown | `marked` + `@astrojs/markdown-remark` | Build-time and runtime pipelines |
| Math | `remark-math` + `rehype-katex` + `katex` | LaTeX rendering |
| Types | **TypeScript 6** | `tsconfig.json` extends `astro/tsconfigs/strict` |
| Verification | **Playwright 1.63** | Five suites driving a real browser |

**Directory structure**

```
win10-blog-stage5/
├── src/
│   ├── components/
│   │   ├── article/       # Article body
│   │   ├── desktop/       # Desktop, icon grid
│   │   ├── social/        # Social links (Astro, for the static About page)
│   │   ├── taskbar/       # Taskbar, Start menu
│   │   └── window/        # Window system
│   │       └── views/     # The six app views
│   ├── config/            # ⭐ Source of truth for data
│   ├── content/blog/      # ⭐ Post sources (Markdown)
│   ├── hooks/             # Custom hooks
│   ├── layouts/           # Page layouts
│   ├── lib/               # Utilities (markdown, posts, theme, wallpaper, tiles, latex)
│   ├── pages/             # ⭐ Static routes (the key to SEO)
│   ├── store/windowStore.ts   # ⭐ Window state (incl. the uid mechanism)
│   └── styles/global.css      # ⭐ Style variables + shared classes
├── public/
│   ├── icons/social/      # 9 social platform SVGs
│   └── wallpapers/        # Wallpapers (supply your own)
└── verify-*.mjs           # Six verification scripts
```

**Three key design decisions**

**① Stable window identity — `uid`**

Window state carries both `uid` and `id`:

- **`id`** can be **mutated in place**. Switching the Control Panel from "Appearance" to "About" changes the window `id` from `control:appearance` to `control:about` — **without creating a new window**.
- **`uid`** is assigned once at creation and **never changes**.

`AnimatePresence` decides "which child is still here" **purely by `key`**. Use the mutable `id` as `key`, and at the moment of switching it sees "old key gone, new key appeared" — so it runs an exit *and* an enter animation on the *same* window.

That produces a nasty, timing-dependent bug: **close the window within the ~0.28s animation window** and the taskbar button disappears while the window stays on screen; drag that leftover and it snaps back, because `react-rnd` is controlled and re-renders from the stale store coordinates of a window that no longer exists.

**Fix**: use `uid` as the `AnimatePresence` key; keep using `id` for `renderContent()`.

> **`key` answers "is this the same thing?"; `id` answers "what does it display?" Two different concerns.**

**② SEO first — the desktop is progressive enhancement**

The desktop UI is entirely client-rendered, but the content is **not**. Every post, category, and tag page is generated as its own static HTML route. Search engines, RSS readers, and JS-disabled browsers get a standard blog. The shell is a bonus for humans.

**③ Separation of data and style**

Social links render in three places spanning Astro and React, so no single component file can own them. Convention:

- **Data truth** → `src/config/site.ts`
- **Style truth** → `src/styles/global.css` (`.social-*` / `.avatar-box`)
- **Components** → layout only

This prevents drift like "Bilibili shows up on the About page but not in the window."

## Testing & Verification

```bash
npm run verify        # Dev server already running
npm run verify:build  # Build first, then verify
```

`verify-all.mjs` runs five suites in a deliberate order — from "most fundamental; if broken everything else breaks" to "top layer, depends on all the rest":

| # | Script | Coverage | Assertions | Status |
| --- | --- | --- | --- | --- |
| 1 | `verify.mjs` | Desktop / windows / routing | 29 | ✅ all green |
| 2 | `verify-theme.mjs` | Frosted glass / animation / dark mode | 34 | ✅ all green |
| 3 | `verify-tiles.mjs` | Start menu / tiles | 43 | ✅ all green |
| 4 | `verify-desktop.mjs` | Wallpapers / icons / three new windows | 52 | ✅ all green |
| 5 | `verify-apps.mjs` | Notepad / Control Panel (Stage 7) | 31 | ✅ all green |
| — | `verify-control-fix.mjs` | Control Panel zombie-window regression (run separately) | 6 | ✅ all green |
| | | **Total** | **195** | **all green** |

> These numbers come from actual run output, not estimates.

**Expected wallpaper 404s**

The repo ships no wallpaper images, so `verify-desktop.mjs` observes a batch of `/wallpapers/*` 404s. The script classifies these separately as *expected* and prints them; any other 404 counts as a failure.

```bash
npx astro check   # expect: 0 errors, 0 warnings
npm run build     # expect: build succeeds
```

**Known verification limits**

- Runs on Playwright's Chromium; **Firefox / Safari / real mobile devices are not covered**
- Assertions target DOM structure and computed styles, **not pixel-level visual regression**
- Animation assertions depend on timing windows and may be flaky on very slow machines

## Security & Privacy

**The site itself**

- **Fully static**: HTML / CSS / JS artifacts — **no backend, no database, no server runtime**
- **No user data collection**: the codebase contains **no analytics or third-party tracking scripts**
- **No tracking cookies**: theme and wallpaper preferences stay in browser local storage
- **No accounts**: no login, registration, or comments

> ⚠️ **Note**: if you deploy to a platform (Vercel / Netlify / Cloudflare Pages, etc.), **that platform's logging and analytics policies are outside this project's control**. Check your host's privacy policy. If you add a comment system or analytics yourself, update this section accordingly.

**Supply chain**

- All dependencies come from the official npm registry; `package-lock.json` is committed
- `allowScripts: { "esbuild": true }` permits only `esbuild`'s install script and blocks postinstall scripts from other dependencies

**Reporting security issues**

<!-- TODO: provide a security reporting channel — your email, or "report privately via GitHub Security Advisories".
     Note that this project has had no security audit and cannot promise a fast official response. -->

**Please do not report vulnerabilities through public issues.**

**An honest disclaimer**

This project has had **no third-party security audit** and, as noted above, **most of its code was AI-generated**. Review the code yourself before using it in any scenario involving sensitive information.

## Roadmap & TODOs

**✅ Done**

- [x] Desktop, icon grid, double-click to open
- [x] Draggable / resizable window system
- [x] Taskbar, Start menu, tiles
- [x] Article reader, Explorer, Browser
- [x] Markdown + LaTeX rendering
- [x] Frosted glass, animation, dark mode
- [x] Wallpaper picker
- [x] Fullscreen-card mobile adaptation
- [x] RSS / Sitemap / search index generation
- [x] About page + 9 social links (local SVG icons)
- [x] Notepad, Control Panel (Stage 7)
- [x] Five Playwright suites (195 assertions)
- [x] Control Panel zombie-window fix + dedicated regression suite

**🚧 Planned**

- [ ] **Taskbar dual display mode**: toggle between "icons only" and "icon + window title", the latter with **equal-width** buttons
- [ ] **Search UI**: `/search-index.json` is generated but **nothing consumes it yet**
- [ ] **Window position persistence**: window positions reset on reload
- [ ] **Recycle Bin showing draft source**: the `raw` field exists in `markdown.ts` but the drafts view doesn't use it
- [ ] **Tile drag-reorder**
- [ ] **Browser multi-tab**

**💭 Considering (maybe, maybe not)**

- [ ] Aero Snap
- [ ] Desktop right-click context menu
- [ ] Keyboard shortcuts (`Alt+Tab`, `Win`)
- [ ] Remembering maximize / minimize state

**🚫 Explicitly out of scope**

| Not doing | Why |
| --- | --- |
| Server-side rendering / backend APIs | This is a **purely static** blog theme. A backend would break deployment simplicity and static SEO. |
| Built-in comments | Comments need a persistent backend and moderation responsibility. Integrate a third party (e.g. Giscus) instead of baking it into the theme. |
| User accounts / login | Same reasoning; a personal blog needs no account system. |
| Full Windows 10 fidelity (registry, filesystem emulation) | The shell exists to **express content**, not to be an OS simulator. Over-imitation only adds maintenance cost. |
| Built-in analytics | Privacy first. Add your own and update [Security & Privacy](#security--privacy). |

## Contributing

Contributions are welcome! Before you start, please read **[CONTRIBUTING.md](./CONTRIBUTING.md)** — it covers code style, commit conventions, and the **especially important AI policy** (this project is heavily AI-assisted and has explicit disclosure requirements).

The short version:

1. Open an issue describing what you want to do
2. Fork and create a branch
3. Follow the style; run `npm run verify` and confirm all 195 assertions still pass
4. Disclose AI involvement in your commit message (`Assisted-by` / `Generated-by`)
5. Open a PR

> ⚠️ **Unexplainable code will not be accepted.** If you can't explain why a piece of code is written the way it is, it will be sent back.

## License

**This project is released under the [MIT License](./LICENSE).**

You are free to use, modify, and distribute this project (including commercially), provided you retain the original copyright and permission notices. The software is provided "as is", without warranty of any kind.

See the [`LICENSE`](./LICENSE) file in the repository root for the full text.

**Third-party assets**

| Asset | Source | License |
| --- | --- | --- |
| 6 social SVG icons | [Simple Icons](https://simpleicons.org/) CDN | CC0 1.0 Universal |
| `email.svg` | Derived from the Gmail mark | See Google brand guidelines |
| `twitter.svg`, `sitemap.svg` | Hand-written for this project | This project's license |
| npm dependencies | npm registry | See each `package.json` |

> ⚠️ **Platform icons are trademarks of their respective owners**, used only to identify the corresponding links. No endorsement or partnership is implied.

## Acknowledgements

- **[Astro](https://astro.build/)** — static-first framework, the basis of this project's SEO
- **[React](https://react.dev/)** — the islands
- **[Zustand](https://zustand-demo.pmnd.rs/)** — state management
- **[motion](https://motion.dev/)** (formerly framer-motion) — window animations
- **[react-rnd](https://github.com/bokuweb/react-rnd)** — draggable, resizable windows
- **[Tailwind CSS](https://tailwindcss.com/)** — styling
- **[KaTeX](https://katex.org/)** — math rendering
- **[Simple Icons](https://simpleicons.org/)** — social platform icons
- **[Playwright](https://playwright.dev/)** — automated verification

And — **most of this project's code was AI-assisted.** See [AI Usage Disclosure](#ai-usage-disclosure).

---

<div align="center">

**[⬆ Back to top](#win10-blog--把博客做成-windows-10-桌面)**

</div>
里

这是整个项目最需要理解的一点。

一个长得像操作系统的博客，天然会和 SEO 冲突——如果文章都靠 JS 在窗口里渲染，爬虫看到的就是一个空壳。

**所以这里做了两条并行的渲染路径：**

```
                    ┌─→ 静态路由 /posts/[slug]     → 完整 HTML，爬虫和直接访问用
同一个 .md 文件 ────┤
                    └─→ 窗口内 marked 渲染         → 交互体验用
```

两条路产出的 HTML **都套同一个 CSS 类 `.md-body`**，排版规则只写一次，所以视觉不会漂移。

结果就是每篇文章都有独立 URL，`sitemap.xml` / `rss.xml` / `search-index.json` 自动生成；禁用 JavaScript 后正文依然完整可读（任务栏和桌面外壳会失效，那本来就是需要 JS 的部分）。

---

## 怎么实现的

**桌面外壳**是一个 Astro 页面，上面挂几个 React 岛屿（窗口、任务栏、开始菜单）。桌面图标、壁纸、任务栏这些"不动的部分"是纯 HTML + CSS，不载入 JS。

**窗口**用 `react-rnd` 做拖动和八向缩放，用 `motion` 做开关时的进出场动画。每个应用（此电脑、记事本、浏览器、回收站、控制面板）是一个独立的 view 组件，由 `WindowManager` 统一调度。

**窗口状态**放在 Zustand store 里，同时和 URL 同步——打开文章时地址栏变成 `/posts/[slug]`，所以窗口里的内容也能被分享和收藏。

**主题**用 CSS 变量切换，不是两套样式：

```css
:root        { --surface: #fff;    --fg: #1a1a1a; }
.theme-dark  { --surface: #1c1e22; --fg: #e8e8e8; }
```

切主题只给 `<html>` 加个 class，所有组件自动跟着变，选择存在 `localStorage`。暗色模式 / 毛玻璃 / 动画三个开关都在控制面板里；关动画是给 `--dur-*` 变量设成 `0.01ms`，不是移除类名。

**毛玻璃（Acrylic）** 是三层叠加：模糊 + 饱和度 + 半透明底色。注意 Tailwind 4 用的 lightningcss 会在同时出现 `-webkit-backdrop-filter` 和 `backdrop-filter` 时删掉后者，所以标准属性必须写在前缀后面。

**Markdown** 在构建期由 Astro 渲染成静态页，在窗口里由 `marked` 再渲染一遍。两边都配了 KaTeX 支持公式，`$...$` 和 `\(...\)` 两种写法都能用。

---

## 技术栈

| 层 | 选型 | 为什么 |
|---|---|---|
| 框架 | **Astro 7** | 岛屿架构：内容静态化，交互局部水合 |
| 交互 | **React 19** | 只用在窗口、任务栏、开始菜单这些岛屿上 |
| 样式 | **Tailwind CSS 4** | 原子类 + CSS 变量做主题 |
| 状态 | **Zustand 5** | 窗口状态管理，比 Context 轻 |
| 拖拽缩放 | **react-rnd** | 窗口拖动 + 八向缩放 |
| 动画 | **motion** | 窗口开关的进出场动画 |
| Markdown | **marked** | 窗口内那条渲染路径 |
| 代码高亮 | **Shiki**（Astro 内置） | 构建期上色，不用额外配置 |
| 公式渲染 | **remark-math + rehype-katex** / **marked-katex-extension** | 两条渲染路径各需要一套 |

> ⚠️ `motion` 是 `framer-motion` 改名后的新包名，导入路径是 `"motion/react"`。网上老教程写的 `npm i framer-motion` 装的是旧包，导入路径不一样。

---

## 项目结构

```
src/
├── components/
│   ├── article/          PostCard（文章卡片）
│   ├── desktop/          Desktop、DesktopIcon（桌面和图标）
│   ├── taskbar/          Taskbar、StartMenu、TileGrid、Tile
│   └── window/
│       ├── Window.tsx          单个窗口（标题栏 + 内容区）
│       ├── WindowManager.tsx   窗口调度 + URL 同步
│       └── views/              每个应用一个视图
│           ├── ExplorerView    此电脑
│           ├── NotepadView     记事本
│           ├── BrowserView     浏览器
│           ├── DraftsView      回收站
│           ├── ControlPanelView 控制面板
│           └── ArchiveView / TagsView / AboutView / PostList / ArticleView
├── config/tiles.ts       磁贴配置（想加磁贴只改这里）
├── content/blog/         文章放这儿（.md）
├── content.config.ts     文章 frontmatter 的 schema 校验
├── hooks/                useAppearance / useClock / useIsMobile
├── layouts/              DesktopLayout（桌面）、ContentLayout（静态页）
├── lib/                  markdown、posts、theme、tiles、latex
├── pages/                路由
├── store/windowStore.ts  窗口状态
└── styles/global.css     全部 CSS 变量和主题
```

---

## License

MIT
