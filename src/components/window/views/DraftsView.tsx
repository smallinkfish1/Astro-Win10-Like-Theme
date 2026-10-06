import { useMemo } from "react";
import type { ClientPost } from "../../../lib/markdown";
import FileManagerShell from "./explorer/FileManagerShell";
import { buildTree, type FileNode } from "./explorer/types";

/**
 * 回收站（草稿箱）
 * ================================================================
 *
 * 对应 frontmatter 里 draft: true 的文章。
 * 不写 draft、或者写 draft: false 的，都是正式文章，不会出现在这里。
 *
 * ── 这次重构改了什么 ──
 *
 *   以前这里是「自己写的一列卡片」，长得跟「此电脑」完全不一样：
 *   没有左侧导航树、没有地址栏、没有列头、不能排序。
 *
 *   现在换成和「此电脑」【同一个外壳】FileManagerShell，
 *   于是白拿了：左右分栏、面包屑、按名称/日期点列头排序、
 *   文件夹视图/平铺视图切换、底部状态栏、选中高亮。
 *
 *   ⚠️ 这就是当初把文件管理器拆成「外壳 + 数据」的回报 ——
 *      ExplorerView 只传了 tree 和一个 onOpen，回收站也只需做同样的事。
 *
 * ── 双击草稿会发生什么 ──
 *
 *   打开一个【只读的记事本窗口】，里面显示 .md 原文（含未渲染的 LaTeX）。
 *
 *   ⚠️ 为什么不是"在回收站窗口里就地展开源码"？
 *      因为双击 = 打开，这是 Windows 的心智模型。
 *      就地展开会让「双击」在同一棵树上有两种含义
 *      （文件夹是进入、文件是展开），很容易误操作。
 *
 *   ⚠️⚠️ detail 里的 onlySource: true 是关键。
 *      它让记事本进入「只读 + 锁定源码视图」模式。
 *      少了它，用户按 F9 就能切到渲染视图 —— 那就不是"看原始字符"了。
 */

export default function DraftsView({ posts }: { posts: ClientPost[] }) {
  /**
   * 建分类文件夹树。
   *
   * ⚠️ kind: "draft" 而不是 "post" —— 节点类型决定了列表里显示什么图标、
   *    状态栏怎么措辞。explorer/types.ts 里早就预留了这个值。
   *
   * ⚠️⚠️ 回收站的数据【必须带 raw】。
   *    它是在 index.astro 里序列化时带上的（toClientPosts(drafts, { withRaw: true })），
   *    不是在这里传的 —— 这里根本拿不到 Post 对象。
   *    如果哪天发现"回收站里点开记事本是空的"，
   *    第一个要查的就是 index.astro 里 getDrafts() 那一行有没有传 withRaw。
   */
  const tree = useMemo(() => buildTree(posts, { kind: "draft" }), [posts]);

  /**
   * 平铺视图的数据源：所有草稿铺平，不带文件夹层级。
   *
   * ⚠️ 从 tree 递归摊平，而不是直接用 posts。
   *    因为 tree 里的节点带上了「路径 id」这些派生信息，
   *    直接用 posts 会让平铺视图里的节点和文件夹视图里的不是同一批对象 ——
   *    表现出来就是"平铺里双击能开、切回文件夹视图双击同一个文件却没反应"。
   */
  const flat = useMemo(() => {
    const collect = (nodes: FileNode[]): FileNode[] =>
      nodes.flatMap((n) => (n.kind === "folder" ? collect(n.children ?? []) : [n]));
    return collect(tree);
  }, [tree]);

  /**
   * 双击一篇草稿 → 用【只读记事本】打开它。
   *
   * ⚠️ 用自定义事件而不是直接调 store。
   *    这样 DraftsView 不需要知道 windowStore 的存在，
   *    可以脱离窗口系统单独测试。WindowManager 监听 "os:open-post"。
   */
  const openDraft = (node: FileNode) => {
    if (!node.post) return;
    window.dispatchEvent(
      new CustomEvent("os:open-post", {
        detail: {
          slug: node.post.slug,
          title: node.post.title,
          icon: "/icons/notepad.png",
          /*
            ⚠️⚠️ 这两个字段是本组件【独有】的：
              view: "notepad"     → 用记事本外壳打开（不是阅读排版）
              onlySource: true    → 只读 + 只能看源码

            别的地方（此电脑、文章列表、搜索）都不传这两个，
            它们要的是"读文章"。
          */
          view: "notepad",
          onlySource: true,
        },
      }),
    );
  };

  return (
    <FileManagerShell
      tree={tree}
      flatList={flat}
      rootIcon="/icons/recycle.png"
      rootLabel="回收站"
      onOpen={openDraft}
      emptyText="回收站是空的。在文章 frontmatter 里写 draft: true，它就会出现在这里。"
      /* 菜单栏右侧的说明。措辞和「此电脑」有意不同 ——
         让"这是没公开的东西"这件事在界面上就能感觉到。 */
      toolbarExtra={
        <span className="text-[11px] text-[#8a94a3]">
          {posts.length} 篇草稿 · 不会出现在公开列表中
        </span>
      }
    />
  );
}
