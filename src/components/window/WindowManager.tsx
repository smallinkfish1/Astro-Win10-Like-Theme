import { useEffect, useCallback } from "react";
import { AnimatePresence } from "motion/react";
import { useWindowStore } from "../../store/windowStore";
import type { ClientPost } from "../../lib/markdown";
import {
  DEFAULT_SETTINGS_SECTION,
  findSection,
  normalizeSection,
} from "../../lib/settings-sections";
import Window from "./Window";
import ArticleView from "./views/ArticleView";
import ArchiveView from "./views/ArchiveView";
import DraftsView from "./views/DraftsView";
import TagsView, { type TagInfo } from "./views/TagsView";
import AboutView, { type AboutStats } from "./views/AboutView";
import ControlPanelView from "./views/ControlPanelView";
import ExplorerView from "./views/ExplorerView";
import NotepadView from "./views/NotepadView";
import BrowserView from "./views/BrowserView";

/**
 * 与桌面图标一一对应，URL 同步和反向还原都依赖这张表。
 * 注意这里的 path 要和静态路由保持一致（见 src/pages/ 下的对应文件）。
 *
 * ⚠️ 这张表和 Desktop.astro 里的 icons 数组是【两份手写数据】，
 *    改一边必须改另一边。两边 id 不一致的表现是：双击图标派发了事件，
 *    但这里找不到同 id 的项，窗口层不知道开什么 —— 看起来像"点了没反应"。
 *    （verify-desktop.mjs 里有一条断言专门盯着这个。）
 */
export const ICON_ROUTES = [
  { id: "pc", title: "此电脑", icon: "/icons/pc.png", path: "/archive" },
  { id: "notepad", title: "记事本", icon: "/icons/notepad.png", path: "/posts" },
  { id: "browser", title: "浏览器", icon: "/icons/browser.png", path: "/about" },
  { id: "recycle", title: "回收站", icon: "/icons/recycle.png", path: "/drafts" },
  { id: "control", title: "控制面板", icon: "/icons/control.png", path: "/settings" },
];

/**
 * 用 replaceState 而不是 pushState：连点多个图标不会塞满历史记录。
 *
 * ⚠️⚠️ query 和 hash 必须清掉。
 *
 *    replaceState 的第三个参数如果是 "/settings/appearance" 这种
 *    【不带 query】的字符串，浏览器会把它当成完整的 URL 替换掉 ——
 *    原来的 ?foo=1 和 #bar 都会被丢掉。这通常是想要的效果。
 *
 *    但正因为如此，如果哪天想保留它们，就不能这么写。
 *    这里明确说明"我们是有意丢掉的"：窗口的 URL 只表达"开着哪个窗口"，
 *    搜索词、锚点属于静态页的语境，切到窗口语境下没有意义。
 */
function syncUrl(path: string) {
  if (window.location.pathname === path) return;
  window.history.replaceState({ path }, "", path);
}

/**
 * WindowManager 需要的数据。全部由 Astro 页面在构建期算好、序列化后传进来。
 *
 * ⚠️ 为什么不能在岛屿里 import getPosts？
 *    因为 getPosts 依赖 astro:content 的编译期机制，React 运行时会炸。
 *    数据只能「构建期算好 → 序列化成 props → 运行时消费」。
 */
export interface WindowManagerProps {
  posts: ClientPost[];
  drafts: ClientPost[];
  tags: TagInfo[];
  categories: TagInfo[];
  stats: AboutStats;
}

/** 文章窗口用的大尺寸：文章是要读的，不是要瞥一眼的 */
function articleSize() {
  if (typeof window === "undefined") return { w: 760, h: 600 };
  return {
    w: Math.min(760, window.innerWidth - 40),
    h: Math.min(600, window.innerHeight - 120),
  };
}

/**
 * 窗口管理器：整个桌面只有这一个 React 岛屿。
 *
 * ⚠️ 注意最外层这个 div。
 * Astro 的 client:only 会在外面再套一层 <astro-island>，而那一层是 0×0 的。
 * react-rnd 的 bounds="parent" 认的是「DOM 里的直接父元素」，
 * 所以这里必须自己提供一个满屏、带定位的容器，拖拽边界才算得对。
 * 少了这个 div，窗口一拖就会被钳回 (0,0) —— 这是本项目最容易踩的坑之一。
 */
export default function WindowManager({
  posts,
  drafts,
  tags,
  categories,
  stats,
}: WindowManagerProps) {
  const windows = useWindowStore((s) => s.windows);
  const open = useWindowStore((s) => s.open);

  /**
   * 按窗口 id 决定这个窗口里渲染什么。
   *
   * 这是本项目「一个岛屿管全部窗口」的关键：窗口的 id 就代表了内容类型，
   * 不需要在 store 里存组件引用 —— 那样既没法序列化，也会让 store 反过来
   * 依赖 React，把状态层和视图层搅在一起。
   *
   * id 约定：
   *   pc / notepad / browser / recycle / control  → 五个桌面图标对应的固定视图
   *   tags / about / posts                        → 兼容用，暂不挂图标
   *   post:<slug>                                 → 文章窗口（阅读排版）
   *   notepad:<slug>                              → 用记事本界面打开某篇（可看源码）
   *   control:<section>                           → 控制面板的某个分类
   *   tag:<name> / category:<name>                → 筛选视图
   *
   * ⚠️⚠️ 关于 notepad:<slug> —— 为什么"从此电脑打开文章"要换成记事本？
   *
   *    因为需求就是这样，而且它符合直觉：
   *    用户在「此电脑」里双击的是一个 .md 文件，
   *    用记事本打开一个文本文件是 Win 上最自然的联想。
   *    ArticleView（阅读排版）则留给"从文章列表/静态页进来"的场景。
   *
   *    两者共用同一个 NotepadView/ArticleView 组件，
   *    区别只是 id 前缀不同 → 走不同分支 → 渲染不同外壳。
   */
  const renderContent = useCallback(
    (id: string) => {
      // ── 固定视图 ──
      switch (id) {
        // 此电脑 → 仿资源管理器：左树 + 右列表
        case "pc":
          return <ExplorerView posts={posts} />;
        // 记事本（不带 slug）→ 随机挑一篇
        case "notepad":
          return <NotepadView posts={posts} />;
        // 浏览器 → 友情链接 / 找到我
        case "browser":
          return <BrowserView />;
        // 回收站 → 草稿箱
        case "recycle":
          return <DraftsView posts={drafts} />;
        // 控制面板（不带 section）→ 默认落到「外观」
        case "control":
          return <ControlPanelView section={DEFAULT_SETTINGS_SECTION} />;
        // 「标签」视图保留给 tag:/category: 窗口内部的跳转用，
        // 桌面上没有图标了，但文章页里的分类/标签芯片还会开它
        case "tags":
          return <TagsView tags={tags} categories={categories} posts={posts} />;
        case "about":
          return <AboutView stats={stats} />;
        // 兼容旧路径 /posts：直接进文章列表视图
        case "posts":
          return <ArchiveView posts={posts} />;
        default:
          break;
      }

      /**
       * ── 记事本打开某篇：id 形如 notepad:why-win10 ──
       *
       * ⚠️⚠️ 这个分支必须放在 post: 分支【之前】判断吗？
       *    不必须，两者的前缀不同不会互相吃掉。
       *    但顺序上先写更具体的（带冒号）是个好习惯 ——
       *    以后如果有人加一个 startsWith("note") 的模糊匹配，
       *    放前面就会把 notepad:xxx 先吃掉。
       */
      if (id.startsWith("notepad:")) {
        const slug = id.slice("notepad:".length);
        const article = [...posts, ...drafts].find((p) => p.slug === slug);
        if (!article) {
          return (
            <div className="grid h-full place-items-center text-[12px] text-[var(--fg-faint)]">
              找不到文章：{slug}
            </div>
          );
        }
        return <NotepadView posts={posts} slug={slug} />;
      }

      /**
       * ── 控制面板的某个分类：id 形如 control:appearance ──
       *
       * ⚠️ normalizeSection 会兜底非法值 —— URL 里被手改成一个
       *    不存在的分类时（/settings/xyz），落到默认分类，
       *    而不是显示空白面板。
       */
      if (id.startsWith("control:")) {
        return <ControlPanelView section={normalizeSection(id.slice("control:".length))} />;
      }

      // ── 文章窗口：id 形如 post:why-win10 ──
      if (id.startsWith("post:")) {
        const slug = id.slice(5);
        const article = [...posts, ...drafts].find((p) => p.slug === slug);
        if (article) return <ArticleView article={article} />;
        return (
          <div className="grid h-full place-items-center text-[12px] text-[#98a1ae]">
            找不到文章：{slug}
          </div>
        );
      }

      // ── 标签 / 分类筛选窗口 ──
      if (id.startsWith("tag:")) {
        const name = id.slice(4);
        return (
          <TagsView
            tags={tags}
            categories={categories}
            posts={posts}
            filter={name}
            filterType="tag"
          />
        );
      }
      if (id.startsWith("category:")) {
        const name = id.slice(9);
        return (
          <TagsView
            tags={tags}
            categories={categories}
            posts={posts}
            filter={name}
            filterType="category"
          />
        );
      }

      // 理论上不该走到这里（上面所有分支都覆盖了），
      // 留个兜底提示比返回 undefined 好 —— 至少能看出是 id 拼错了
      return (
        <div className="grid h-full place-items-center text-[12px] text-[var(--fg-faint)]">
          未知窗口类型：{id}
        </div>
      );
    },
    [posts, drafts, tags, categories, stats]
  );

  /**
   * 1. 桌面图标 / 各处链接（Astro 侧或视图内）→ 打开窗口。
   *
   * ⚠️ 尺寸补齐统一在 store.open() 里做（见 windowStore.ts 的 APP_SIZE）。
   *    这里只负责转发 + 同步 URL，不掺和尺寸 ——
   *    因为除这里之外，开始菜单的快捷方式也是直接调 store.open() 的，
   *    如果尺寸逻辑只写在这儿，从开始菜单打开记事本就会是默认的 480 高。
   *    凡是"所有入口都要生效"的规则，都必须放在 store 层。
   */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.id) return;
      open(detail);
      syncUrl(detail.path);
    };
    window.addEventListener("os:open-window", handler);
    return () => window.removeEventListener("os:open-window", handler);
  }, [open]);

  /**
   * 2. 列表/资源管理器内部 → 打开某篇文章。
   *
   * 为什么不让 PostList 直接调用 store？
   *   因为「开窗口」这件事必须连带做 URL 同步。如果每个组件都自己调 open()，
   *   迟早有人忘了同步 URL，浏览器地址栏就会和窗口状态对不上。
   *   统一走这个事件，URL 逻辑只写一处。
   *
   * ⚠️⚠️ detail.view 决定"用哪个外壳打开"：
   *
   *     detail.view === "notepad" → id 前缀 notepad:（记事本外壳，能看 .md 源码）
   *     其它 / 不传               → id 前缀 post:   （阅读排版外壳）
   *
   *    为什么默认是 post:（阅读视图）而不是 notepad:？
   *      因为这个事件最常从文章列表、标签页、搜索进来 ——
   *      那些场景下用户要的是"读文章"。只有从此电脑双击 .md 文件时，
   *      才由 ExplorerView 显式传 view: "notepad"。
   *
   *    ⚠️ 两种外壳的窗口 id 不同，所以【会同时开两个窗口】。
   *       这是有意的：一个是你双击 md 文件想看的源码，
   *       一个是你在列表里点了标题想读的正文，它们是两件事。
   *       想统一的话得改 id 生成规则，那会让"关掉一个不影响另一个"
   *       这个特性消失，不值得。
   *
   * ⚠️ URL 都同步成 /posts（不带 slug）。
   *    原因：notepad:<slug> 和 post:<slug> 两个窗口如果都同步成
   *    /posts/<slug>，刷新时就无法判断该还原成哪一个 —— 
   *    地址栏里那份信息不足以区分"我是用记事本开的还是用文章页开的"。
   *    与其猜，不如让 URL 只表达"我打开了文章相关的东西"，
   *    刷新后从 /posts 这个列表页重新开始，语义清晰且可预测。
   */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.slug) return;
      const asNotepad = detail.view === "notepad";

      if (asNotepad) {
        const article = [...posts, ...drafts].find((p) => p.slug === detail.slug);
        open({
          id: `notepad:${detail.slug}`,
          // 标题加个后缀，任务栏上一眼能区分两个窗口
          title: `${article?.title ?? detail.title ?? detail.slug}`,
          icon: "/icons/notepad.png",
          path: "/posts",
          ...articleSize(),
        });
        syncUrl("/posts");
        return;
      }

      const { w, h } = articleSize();
      open({
        id: `post:${detail.slug}`,
        title: detail.title,
        icon: "📄",
        path: `/posts/${detail.slug}`,
        w,
        h,
      });
      syncUrl(`/posts/${detail.slug}`);
    };
    window.addEventListener("os:open-post", handler);
    return () => window.removeEventListener("os:open-post", handler);
  }, [open, posts, drafts]);

  /**
   * 2b. 控制面板内部点了左侧分类 → 换右侧内容 + 更新 URL 和标题。
   *
   * ⚠️ 为什么这一段必须由窗口层处理，而不是 ControlPanelView 自己改 URL？
   *
   *    因为点分类要做三件事：
   *      1. 换窗口 id（这决定右侧渲染哪个分类）
   *      2. 改 URL（可刷新、可分享）
   *      3. 改窗口标题（标题栏上应该能看到"外观 - 控制面板"）
   *
   *    第 1 条只有窗口层能做（id 是窗口层的东西）。
   *    如果让视图层只管 2、不碰 1，那么 id 不变 → 组件不重新挂载
   *    → 只能靠组件内部的 state 切换 → 但又和 URL 对不上。
   *
   *    统一收到这里，三件事一次做完，永远不会漂移。
   *
   * ⚠️⚠️ 这里没有调 open()。
   *    因为 open() 对已存在的 id 是"还原 + 置顶"，
   *    而 control:appearance → control:about 是两个不同的 id，
   *    调 open 会【再开一个新窗口】而不是在同一个窗口里切换 ——
   *    这正是需求明确禁止的行为（"不要新开窗口"）。
   *
   *    正确做法是：把当前那个 control:* 窗口的 id 和标题原地改掉。
   *    这样 React 认为是同一个 Window 组件（key 变了其实会重建，
   *    但位置、尺寸、层级都保持），视觉上就是"右侧内容换了"。
   */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const section = normalizeSection(detail?.section);

      const store = useWindowStore.getState();
      // 找当前开着的控制面板（不论它是哪个分类）
      const panel = store.windows.find((w) => w.id === "control" || w.id.startsWith("control:"));
      if (!panel) return;

      const s = findSection(section);
      // 原地改 id：内容会跟着变，但窗口的几何/层级不动
      useWindowStore.setState({
        windows: store.windows.map((w) =>
          w.id === panel.id ? { ...w, id: `control:${section}`, title: `控制面板 - ${s.name}` } : w
        ),
      });

      syncUrl(`/settings/${section}`);
    };
    window.addEventListener("os:switch-settings", handler);
    return () => window.removeEventListener("os:switch-settings", handler);
  }, []);

  /**
   * 3. 直接带着 /posts/why-win10 这类路径进站时，自动还原对应窗口。
   *
   * 这一步是 SEO 和体验的接合点：
   *   爬虫 / 新标签页直接访问 → 看到的是完整静态 HTML
   *   站内导航进来           → 立刻变成桌面上的一个窗口
   * 两者用的是同一个 URL，呈现方式按场景各不相同 —— 这就是
   * 「静态页面 + 窗口化」这个方案的全部意义。
   */
  useEffect(() => {
    const path = decodeURIComponent(window.location.pathname);

    // /posts/<slug>
    const postMatch = path.match(/^\/posts\/(.+)$/);
    if (postMatch) {
      const slug = postMatch[1];
      const article = [...posts, ...drafts].find((p) => p.slug === slug);
      if (article) {
        open({
          id: `post:${slug}`,
          title: article.title,
          icon: "📄",
          path,
          ...articleSize(),
        });
        return;
      }
    }

    // /tags/<tag>
    const tagMatch = path.match(/^\/tags\/(.+)$/);
    if (tagMatch) {
      open({ id: `tag:${tagMatch[1]}`, title: `标签：${tagMatch[1]}`, icon: "🏷️", path });
      return;
    }

    // /category/<cat>
    const catMatch = path.match(/^\/category\/(.+)$/);
    if (catMatch) {
      open({
        id: `category:${catMatch[1]}`,
        title: `分类：${catMatch[1]}`,
        icon: "🏷️",
        path,
      });
      return;
    }

    /**
     * ⚠️⚠️ 控制面板分类：/settings/<section>
     *
     *    这个分支【必须放在下面的固定路径查找之前】。
     *
     *    因为下面的 ICON_ROUTES.find(r => r.path === path) 用的是
     *    【全等】匹配，"/settings/appearance" 不等于 "/settings"，
     *    所以它本来也匹配不上 —— 但那样就会直接掉到末尾什么都不开，
     *    用户从收藏夹打开 /settings/appearance 会看到一个空桌面。
     *
     *    这里用正则专门处理带分类的情况。
     *
     *    ⚠️ 为什么不用全等？因为分类是动态的（今天 4 个，明天可能 6 个），
     *       写死一张表就得跟着改。用前缀 + normalizeSection 兜底，
     *       以后往 SETTINGS_SECTIONS 里加一项就自动可用。
     */
    const settingsMatch = path.match(/^\/settings\/([^/]+)\/?$/);
    if (settingsMatch) {
      const section = normalizeSection(decodeURIComponent(settingsMatch[1]));
      const s = findSection(section);
      open({
        id: `control:${section}`,
        title: `控制面板 - ${s.name}`,
        icon: "/icons/control.png",
        path,
      });
      return;
    }

    // 固定图标路径
    const match = ICON_ROUTES.find((r) => r.path === path);
    if (match) {
      /**
       * ⚠️ control 这个图标打开时要带上默认分类，否则 id 是裸的 "control"，
       *    渲染出来是默认分类，但用户点左侧导航后 id 会变成 control:xxx ——
       *    从"裸 id"到"带分类 id"这一步也是原地改，没问题。
       *    这里统一成带分类的 id，让"控制面板窗口的 id 永远是 control:*"
       *    成为一条不变式，少一种状态就少一类 bug。
       */
      if (match.id === "control") {
        const s = findSection(DEFAULT_SETTINGS_SECTION);
        open({ ...match, id: `control:${s.id}`, title: `控制面板 - ${s.name}` });
        return;
      }
      open(match);
    }
    // ⚠️ 这个 effect 只在挂载时跑一次（有意为之）。
    // 如果依赖 posts/drafts，每次数据变化都会重新还原窗口，
    // 把用户已经关掉的窗口又弹回来。下面的数组是刻意留空的。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /**
   * 4. 浏览器前进/后退时，窗口跟着变。
   *
   * 注意我们用 replaceState 的地方不会产生历史记录，所以这个监听主要服务
   * 「用户自己按了后退」和「从静态页跳回来」这两种情况。
   * 没有匹配到任何路径时，关掉所有窗口回到干净桌面。
   */
  useEffect(() => {
    const onPop = () => {
      const path = decodeURIComponent(window.location.pathname);

      const postMatch = path.match(/^\/posts\/(.+)$/);
      if (postMatch) {
        const article = [...posts, ...drafts].find((p) => p.slug === postMatch[1]);
        if (article) {
          open({
            id: `post:${postMatch[1]}`,
            title: article.title,
            icon: "📄",
            path,
            ...articleSize(),
          });
          return;
        }
      }

      const tagMatch = path.match(/^\/tags\/(.+)$/);
      if (tagMatch) {
        open({ id: `tag:${tagMatch[1]}`, title: `标签：${tagMatch[1]}`, icon: "🏷️", path });
        return;
      }

      const catMatch = path.match(/^\/category\/(.+)$/);
      if (catMatch) {
        open({
          id: `category:${catMatch[1]}`,
          title: `分类：${catMatch[1]}`,
          icon: "🏷️",
          path,
        });
        return;
      }

      /**
       * ⚠️ popstate 里也要处理 /settings/<section>，和上面的初次还原是
       *    【对称】的。漏掉的症状很具体：
       *    用户在控制面板里点了「更新日志」（URL 变成 /settings/changelog），
       *    然后按浏览器后退 → 地址栏回到 /settings/appearance
       *    → 但窗口没有任何反应（因为这里没匹配到）
       *    → 地址栏和界面不一致了。
       */
      const settingsMatch = path.match(/^\/settings\/([^/]+)\/?$/);
      if (settingsMatch) {
        const section = normalizeSection(decodeURIComponent(settingsMatch[1]));
        const s = findSection(section);
        open({
          id: `control:${section}`,
          title: `控制面板 - ${s.name}`,
          icon: "/icons/control.png",
          path,
        });
        return;
      }

      const match = ICON_ROUTES.find((r) => r.path === path);
      if (match) {
        if (match.id === "control") {
          const s = findSection(DEFAULT_SETTINGS_SECTION);
          open({ ...match, id: `control:${s.id}`, title: `控制面板 - ${s.name}` });
          return;
        }
        open(match);
      } else {
        useWindowStore.setState({ windows: [] });
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open, posts, drafts]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/*
        ⚠️ AnimatePresence 是窗口【关闭动画】能播出来的前提。

        默认情况下，store 里一删掉窗口，React 立刻就把这个 Window 卸载了，
        DOM 瞬间消失 —— 退出动画根本没机会执行。

        AnimatePresence 会接管「子元素被移除」这个时机：
        它保留该元素直到其 exit 动画播完，再真正从 DOM 摘掉。
        子元素需要在被移除的那个瞬间仍然是「已挂载」的状态，
        这就需要它带一个稳定的 key（我们已经有了 w.id）。

        mode 用默认值（sync）而不是 "wait"：
        "wait" 会让新窗口等旧窗口动画播完才出现，
        多窗口同时开关时会出现明显延迟，不符合桌面系统的直觉。
      */}
      <AnimatePresence initial={false}>
        {windows.map((w) => (
          <Window key={w.id} win={w}>
            {renderContent(w.id)}
          </Window>
        ))}
      </AnimatePresence>
    </div>
  );
}
