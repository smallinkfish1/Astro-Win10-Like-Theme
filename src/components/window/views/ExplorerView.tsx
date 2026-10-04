import { useMemo } from "react";
import type { ClientPost } from "../../../lib/markdown";
import FileManagerShell from "./explorer/FileManagerShell";
import { buildTree, type FileNode } from "./explorer/types";

/**
 * 「此电脑」—— 仿 Win10 文件资源管理器。
 * ================================================================
 *
 * 为什么用文件管理器来承载文章列表？
 *   因为「用文件夹看文章」是用户对这块桌面的第一直觉。
 *   把文章列表做成一张 CSV 式的表太"网页"了，而
 *   左侧导航树 + 右侧详细列表（名称 / 类型 / 修改日期）
 *   才是这个隐喻该有的样子。
 *
 * ── 文件夹结构怎么来的 ──
 *
 *   由文章的 category 字段生成。category 支持用斜杠表达层级：
 *
 *     category: 技术              → 技术/ 文件夹里有这篇文章
 *     category: 技术/Hexo         → 技术/Hexo/ 两层文件夹
 *
 *   详细规则见 explorer/types.ts 里的 splitCategory。
 *
 * ⚠️ 为什么这个组件不接收 categories prop？
 *
 *    因为分类层级是从文章里【算出来】的，不需要外部再传一份。
 *    传两份的风险是它们可能不一致 —— 比如筛选逻辑变了、
 *    某篇文章的 category 改了而统计数据没更新，
 *    就会出现"左树有 6 个分类，点进去有 7 个"这种怪事。
 *
 *    单一数据源（posts）→ 派生一切，是这里的关键设计。
 */

export interface ExplorerViewProps {
  /** 已发布的文章（不含草稿） */
  posts: ClientPost[];
}

export default function ExplorerView({ posts }: ExplorerViewProps) {
  /**
   * 构建分类文件夹树。
   *
   * ⚠️ useMemo 的依赖是 [posts]，不是 [] 也不是 [posts.length]。
   *    · 用 []  → 第一次渲染后就不再重算，posts 变了树也不更新
   *    · 用 [posts.length] → 文章数没变但分类改了（编辑了 frontmatter）
   *      就检测不到 —— 这是最阴险的一种，因为"看起来对"
   *
   *    这里也不是性能问题，而是正确性问题。
   */
  const tree = useMemo(() => buildTree(posts, { kind: "post" }), [posts]);

  /**
   * 平铺视图的数据源。
   *
   * ⚠️ 需求明确说「平铺展示所有文章，不显示文件夹层级」。
   *    所以这里递归把树摊平，只保留文章节点。
   *    不传的话外壳也会自己做同样的事，这里显式传是
   *    为了让"平铺=全部文章"这个语义在调用方就能看见。
   */
  const flat = useMemo(() => {
    const collect = (nodes: FileNode[]): FileNode[] =>
      nodes.flatMap((n) => (n.kind === "folder" ? collect(n.children ?? []) : [n]));
    return collect(tree);
  }, [tree]);

  /**
   * 双击一篇文章 → 在窗口里打开它。
   *
   * ⚠️ 用自定义事件而不是直接调 store，是历史原因：
   *    WindowManager 监听 "os:open-post"，这样任何地方
   *    （桌面图标、回收站、别的地方）想"打开某篇文章"
   *    都只要发一个事件，不用各自 import store。
   *
   *    好处是解耦：这些 view 组件不需要知道 store 的存在，
   *    它们可以脱离窗口系统单独测试。
   *
   * ⚠️⚠️ view: "notepad" —— 这一条是本组件【独有】的。
   *
   *    在文件管理器里双击一个 .md 文件，用户的心智模型是
   *    "用记事本打开这个文本文件"，而不是"打开一篇排版好的博客"。
   *    所以这里显式要求用记事本外壳（能切源码视图）。
   *
   *    别的地方（文章列表、标签页、搜索）不传 view，
   *    走默认的阅读排版视图 —— 那些场景要的就是"读文章"。
   */
  const openPost = (node: FileNode) => {
    if (!node.post) return;
    window.dispatchEvent(
      new CustomEvent("os:open-post", {
        detail: {
          slug: node.post.slug,
          title: node.post.title,
          icon: "/icons/notepad.png",
          view: "notepad",
        },
      }),
    );
  };

  return (
    <FileManagerShell
      tree={tree}
      flatList={flat}
      rootIcon="/icons/pc.png"
      rootLabel="此电脑"
      onOpen={openPost}
      emptyText={
        posts.length === 0
          ? "还没有文章。在 src/content/blog/ 下新建一个 .md 就会出现在这里。"
          : "这个文件夹是空的"
      }
    />
  );
}
