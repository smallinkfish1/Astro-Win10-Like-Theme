# Win10 Blog

一个把博客做成 **Windows 10 桌面**的 Astro 主题。文章是文件，分类是磁贴，归档是"此电脑"，草稿丢进"回收站"。

```bash
npm install
npm run dev      # → http://localhost:4321
```

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
