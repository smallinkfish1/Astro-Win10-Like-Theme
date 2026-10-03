import { useEffect, useCallback } from "react";
import { AnimatePresence } from "motion/react";
import { useWindowStore } from "../../store/windowStore";
import type { ClientPost } from "../../lib/markdown";
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

/** 用 replaceState 而不是 pushState：连点多个图标不会塞满历史记录 */
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
   *   post:<slug>                                 → 文章
   *   tag:<name> / category:<name>                → 筛选视图
   */
  const renderContent = useCallback(
    (id: string) => {
      // ── 固定视图 ──
      switch (id) {
        // 此电脑 → 仿资源管理器：左树 + 右列表
        case "pc":
          return <ExplorerView posts={posts} categories={categories} />;
        // 记事本 → 纯文本读 Markdown 原文
        case "notepad":
          return <NotepadView posts={posts} />;
        // 浏览器 → 友情链接 / 找到我
        case "browser":
          return <BrowserView />;
        // 回收站 → 草稿箱
        case "recycle":
          return <DraftsView posts={drafts} />;
        // 控制面板 → 外观开关
        case "control":
          return <ControlPanelView />;
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
   * 2. 文章列表内部 → 打开文章窗口。
   *
   * 为什么不让 PostList 直接调用 store？
   *   因为「开窗口」这件事必须连带做 URL 同步。如果每个组件都自己调 open()，
   *   迟早有人忘了同步 URL，浏览器地址栏就会和窗口状态对不上。
   *   统一走这个事件，URL 逻辑只写一处。
   */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.slug) return;
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
  }, [open]);

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

    // 固定图标路径
    const match = ICON_ROUTES.find((r) => r.path === path);
    if (match) open(match);
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

      const match = ICON_ROUTES.find((r) => r.path === path);
      if (match) open(match);
      else useWindowStore.setState({ windows: [] });
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
