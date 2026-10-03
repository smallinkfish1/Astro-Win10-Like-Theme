# Win10 Blog

一个把博客做成 **Windows 10 桌面**的 Astro 主题。文章是文件，分类是磁贴，归档是"此电脑"，草稿丢进"回收站"。

**但这不是一个纯 SPA。** 每篇文章都有独立的静态路由和完整正文，搜索引擎能正常收录——桌面的外壳之下，是一个老老实实的静态博客。

```bash
npm install
npm run dev      # → http://localhost:4321
```

---

## 长什么样

打开首页你会看到一张 Win10 壁纸，桌面上 5 个图标，底下一条任务栏。

| 双击桌面上的… | 会发生什么 |
|---|---|
| **此电脑** | 打开仿资源管理器：左侧分类树 + 右侧文章列表，表头可排序 |
| **记事本** | 读文章的 Markdown 原文（含 frontmatter），可切换自动换行和字号 |
| **浏览器** | 友情链接 / 找到我，带地址栏和标签页 |
| **回收站** | 草稿箱，只有 `draft: true` 的文章 |
| **控制面板** | 暗色模式、毛玻璃、动画三个开关 |

窗口可以拖动、缩放、最大化、最小化，点任务栏图标能还原，双击标题栏切换最大化。
开始菜单里有快捷方式和分类磁贴（1×1 / 2×2 混合排布）。

---

## 核心设计：桌面是壳，静态是里

这是整个项目最需要理解的一点。

一个长得像操作系统的博客，天然会和 SEO 冲突——如果文章都靠 JS 在窗口里渲染，爬虫看到的就是一个空壳。

**所以这里做了两条并行的渲染路径：**

```
                    ┌─→ 静态路由 /posts/[slug]     → 完整 HTML，爬虫和直接访问用
同一个 .md 文件 ────┤
                    └─→ 窗口内 marked 渲染         → 交互体验用
```

两条路产出的 HTML **都套同一个 CSS 类 `.md-body`**，排版规则只写一次，所以视觉不会漂移。

结果就是：

- ✅ 每篇文章一个独立 URL，`sitemap.xml` / `rss.xml` / `search-index.json` 全部自动生成
- ✅ **禁用 JavaScript 后，正文依然完整可读**——实测过：标题、8 个小节、表格全都在 HTML 里
  （任务栏和桌面外壳会失效，那本来就是需要 JS 的部分）
- ✅ 桌面交互只在需要的地方加载 JS，文章页的 JS 用量很小

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

> ⚠️ `motion` 是 `framer-motion` 改名后的新包名，导入路径是 `"motion/react"`。
> 网上老教程写的 `npm i framer-motion` 装的是旧包，导入路径不一样。

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
│           ├── ArchiveView / TagsView / AboutView / PostList / ArticleView
├── config/tiles.ts       磁贴配置（想加磁贴只改这里）
├── content/blog/         文章放这儿（.md）
├── content.config.ts     文章 frontmatter 的 schema 校验
├── hooks/                useAppearance / useClock / useIsMobile
├── layouts/              DesktopLayout（桌面）、ContentLayout（静态页）
├── lib/                  markdown、posts、theme、tiles
├── pages/                路由
├── store/windowStore.ts  窗口状态
└── styles/global.css     全部 CSS 变量和主题
```

---

## 写一篇文章

在 `src/content/blog/` 下新建 `.md`，**平铺，不要建子目录**：

```markdown
---
title: 文章标题
description: 摘要，用于列表页和 SEO
pubDate: "2026-10-03"
category: 前端
tags: ["Astro", "性能"]
accent: "#0e7c86"
---

正文…
```

### 支持的字段

| 字段 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `title` | ✅ | — | 标题 |
| `pubDate` | ✅ | — | 日期，可带时间 |
| `description` | | `""` | 摘要，同时用作 SEO description |
| `updatedDate` | | — | 更新日期 |
| `category` | | `"未分类"` | **单值**，不是数组 |
| `tags` | | `[]` | 数组 |
| `draft` | | `false` | 草稿，只进"回收站" |
| `accent` | | 主题蓝 | 卡片左侧色条 |
| `cover` | | — | ⚠️ 预留字段，**目前未接线** |

### 三个会让构建失败的坑

自己踩过，写下来免得你也踩：

| 写法 | 结果 |
|---|---|
| 把 `.md` 放进子目录 | 🔴 `Missing parameter: slug` |
| `category` 或 `tags` 里带 `/` | 🔴 斜杠被当路径分隔符 |
| 图片用相对路径 `![](./a.png)` | 🔴 `ImageNotFound`，**文件在也报错** |

**图片的正确用法**：放 `public/images/`，写绝对路径 `![](/images/a.png)`；或者用原生 `<img>` 标签。

`Node.js`、`C++`、`性能优化`、带空格的标签都没问题，只有斜杠不行。

> 从 Hexo 搬过来的话看 → [`从Hexo迁移-迁移前必读.md`](./从Hexo迁移-迁移前必读.md)

---

## 自定义

| 想改什么 | 改哪里 |
|---|---|
| 壁纸 | 替换 `public/wallpaper.jpg` 和 `wallpaper-dark.jpg` |
| 桌面图标 | `src/components/desktop/Desktop.astro`（3 处要对齐，见文档） |
| 磁贴 | `src/config/tiles.ts` |
| 主题色 / 配色 | `src/styles/global.css` 里的 CSS 变量 |
| 站点名 / 域名 | `src/pages/rss.xml.ts`、`site` 相关配置 |

详细说明 → [`改桌面和图标改哪里.md`](./改桌面和图标改哪里.md)

---

## 主题实现

暗色模式用 **CSS 变量**切换，不是两套样式：

```css
:root          { --surface: #fff;  --fg: #1a1a1a; }
.theme-dark    { --surface: #1c1e22; --fg: #e8e8e8; }
```

切主题时只给 `<html>` 加个 class，所有组件自动跟着变。选择存在 `localStorage`。

**三个开关**（控制面板里）：暗色模式 / 毛玻璃效果 / 界面动画。
关掉动画是给 `--dur-*` 变量设成 `0.01ms`，不是移除类名——这样所有过渡一起失效，不用逐个改组件。

**毛玻璃（Acrylic）** 是三层叠加：模糊 + 饱和度 + 半透明底色。
注意 Tailwind 4 用的 lightningcss 会在同时出现 `-webkit-backdrop-filter` 和 `backdrop-filter` 时删掉后者，所以**标准属性必须写在前缀后面**。

---

## 验证

项目带一套浏览器验收脚本，覆盖 133 项：

```bash
npm run verify        # 自动起停预览服务
npm run verify:build  # 先构建再验收
```

| 套件 | 项数 | 覆盖 |
|---|---|---|
| `verify.mjs` | 27 | 基础桌面、窗口、路由、SEO |
| `verify-theme.mjs` | 33 | 毛玻璃、动画、暗色模式 |
| `verify-tiles.mjs` | 34 | 开始菜单、磁贴 |
| `verify-desktop.mjs` | 39 | 壁纸、图标、三个新窗口、窗口高度 |

**设计原则：断言事实，不断言类名。** 比如验证"壁纸生效"读的是 `getComputedStyle` 里的 `background-image` 最终值，而不是检查有没有 `.wallpaper` 这个 class——类名随时会改，浏览器画出来的东西不会骗人。

还包含两条**回归守卫**（曾修过一个真 bug）：

- 五个窗口的内容区都不能被裁（`overflow ≤ 0`）
- 标题栏高度 + 内容区高度必须严格等于窗口高度

### 壁纸体检

换壁纸之后壁纸白了？先跑这个：

```bash
pip install pillow
python3 check-wallpaper.py
```

检查文件存在性、真实格式（读文件头，不看扩展名）、能否真解码、尺寸、色彩模式、体积。
能认出 CMYK、截断文件、文本文件冒充图片这三种常见问题。

---

## 常见问题

**`npm run dev` 刷出一长串 `EMFILE: too many open files`**
不影响预览，是文件监听句柄不够。已在 `astro.config.mjs` 里排除 `node_modules` / `.git` / `dist` 的监听。Windows 更容易遇到。

**`Failed to resolve import "motion/react"`**
依赖没装全。删掉 `node_modules` 和 `package-lock.json` 重装。

**壁纸是白的**
八成是图片本身解码失败（CMYK / 截断 / 根本不是图片），跑 `check-wallpaper.py`。**大图不是原因**——实测 8000×4500 也能正常渲染。

---

## 相关文档

| 文件 | 内容 |
|---|---|
| [`安装说明-先读我.md`](./安装说明-先读我.md) | 安装、运行、验收 |
| [`改桌面和图标改哪里.md`](./改桌面和图标改哪里.md) | 换壁纸、换图标、加应用 |
| [`从Hexo迁移-迁移前必读.md`](./从Hexo迁移-迁移前必读.md) | 迁移要求、字段对照、批量脚本 |
| [`上传到GitHub-操作指南.md`](./上传到GitHub-操作指南.md) | git 上传、.gitignore、踩坑 |

---

## 尚未完成

诚实地说，原始设想里还有几项没做完：

- [ ] **移动端适配** — 基础代码（`useIsMobile`、全屏卡片分支）已就位，缺开始菜单全屏和磁贴两列布局
- [ ] **开始菜单磁贴还原** — 目前支持手动配置，还没做分组标题、图片型磁贴内容
- [ ] **磁贴拖动排序** — `buildTiles({ order })` 的排序逻辑已写好，缺拖拽交互
- [ ] **`cover` 字段接线** — schema 里有，但没有任何地方使用

---

## License

MIT
