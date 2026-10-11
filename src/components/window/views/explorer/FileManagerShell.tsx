import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import FileList from "./FileList";
import { useSortable } from "./useSortable";
import {
  childrenAt,
  countPosts,
  crumbsOf,
  type FileNode,
} from "./types";
import { useT } from "../../../../i18n";
import type { Dict } from "../../../../i18n/types";

/**
 * 文件管理器外壳。
 * ================================================================
 *
 * 「此电脑」和「回收站」共用这个骨架。它负责：
 *   · 顶部菜单栏（装饰性按钮 + 视图切换）
 *   · 地址栏（面包屑 + 返回）
 *   · 左侧导航树（文件夹层级）
 *   · 右侧内容区（文件夹视图 / 平铺视图）
 *   · 底部状态栏
 *
 * 两个应用只需要传进来「树」和「打开时做什么」。
 *
 * ── 两种视图模式 ──
 *
 *   文件夹视图（默认）  按分类层级看，可以点进文件夹
 *   平铺视图            所有文章铺平，一个不落，适合搜索式浏览
 *
 *   这个切换是需求明确要的，放在菜单栏右侧。
 */

export interface FileManagerShellProps {
  /** 文件树根节点 */
  tree: FileNode[];

  /** 地址栏最左边显示的图标 */
  rootIcon: string;

  /** 根节点标签，比如「此电脑」或「回收站」 */
  rootLabel: string;

  /** 双击一个节点时做什么 */
  onOpen: (node: FileNode) => void;

  /**
   * 自定义「平铺视图」的数据源。
   *
   * ⚠️ 为什么不让外壳自己从 tree 里摊平？
   *    因为「此电脑」和「回收站」对"平铺"的定义可能不同 ——
   *    回收站可能只想要草稿，此电脑想要全部。
   *    让它自己算会有隐含假设，不如让调用方明确给一份。
   *
   *    不传的话，外壳会默认把 tree 递归摊平成所有文章。
   */
  flatList?: FileNode[];

  /** 空状态文案 */
  emptyText?: string;

  /** 菜单栏右侧的额外内容（比如"新建文件夹"之类） */
  toolbarExtra?: ReactNode;
}

export default function FileManagerShell({
  tree,
  rootIcon,
  rootLabel,
  onOpen,
  flatList,
  emptyText,
  toolbarExtra,
}: FileManagerShellProps) {
  const { t } = useT();

  /**
   * 节点的显示名。
   *
   * ⚠️ 带 nameKey 的走词典，其余原样 —— 见 explorer/types.ts 里的说明。
   *    文件夹名 / 文章标题是内容，不翻译；只有兜底的「未分类」要翻。
   */
  const nodeLabel = (node: FileNode) =>
    node.nameKey ? t(node.nameKey as keyof Dict) : node.name;

  /** 当前所在路径。"/" 是根（此电脑 / 回收站） */
  const [path, setPath] = useState("/");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"folder" | "flat">("folder");
  const { key, dir, toggle, apply } = useSortable("date", "desc");

  /**
   * 当前要显示的行。
   *
   * ⚠️ 这里有两个独立维度，别搞混：
   *    1. 【范围】文件夹视图=当前路径下的直接子节点；平铺=全部文章
   *    2. 【排序】由 useSortable 决定
   *
   *    顺序是先取范围、再排序。反过来（先全局排序再过滤）
   *    会让文件夹优先规则失效，因为过滤后剩下的顺序是全局排的。
   */
  const rows = useMemo(() => {
    if (view === "flat") {
      // 平铺：递归收集所有文章，跳过文件夹节点本身
      const collect = (nodes: FileNode[]): FileNode[] =>
        nodes.flatMap((n) => (n.kind === "folder" ? collect(n.children ?? []) : [n]));

      return apply(flatList ?? collect(tree));
    }
    return apply(childrenAt(tree, path));
  }, [view, tree, path, apply, flatList]);

  /** 左树：把文件夹层级画出来（缩进按深度） */
  const navNodes = useMemo(() => {
    const out: { node: FileNode; depth: number }[] = [];

    const walk = (nodes: FileNode[], depth: number) => {
      for (const n of nodes) {
        if (n.kind !== "folder") continue;
        out.push({ node: n, depth });
        walk(n.children ?? [], depth + 1);
      }
    };

    walk(tree, 0);
    return out;
  }, [tree]);

  const crumbs = crumbsOf(path, rootLabel);

  /** 返回上一级。已经在根就什么都不做 */
  const goUp = () => {
    if (path === "/") return;
    const parent = path.slice(0, path.lastIndexOf("/")) || "/";
    setPath(parent);
    setSelectedId(null);
  };

  /** 点开一个节点：文件夹就进去，文章就交给调用方 */
  const open = (node: FileNode) => {
    if (node.kind === "folder") {
      setPath(node.id);
      setSelectedId(null);
      // ⚠️ 进文件夹时自动切回文件夹视图。
      //    否则会出现「在平铺视图下点了文件夹，路径变了但列表没变」
      //    的怪状态（因为平铺视图不理会路径）。
      setView("folder");
      return;
    }
    onOpen(node);
  };

  const selectedNode = selectedId
    ? rows.find((r) => r.id === selectedId) ?? null
    : null;

  return (
    <div className="flex h-full flex-col text-[12px]">
      {/* ══ 1. 菜单栏 ══ */}
      <div className="flex shrink-0 items-center gap-1 border-b border-[var(--surface-border)] bg-[var(--surface-2)] px-2 py-1">
        {[
          { k: "ex.new" as const, i: "🗋" },
          { k: "ex.share" as const, i: "⇪" },
          { k: "ex.delete" as const, i: "🗑" },
        ].map((b) => (
          <button
            key={b.k}
            type="button"
            title={t("ex.demoOnly", { name: t(b.k) })}
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[var(--fg-dim)]
                       transition-colors hover:bg-[var(--hover)]"
          >
            <span className="text-[13px] leading-none">{b.i}</span>
            {t(b.k)}
          </button>
        ))}

        {toolbarExtra}

        {/*
          视图切换。
          ⚠️ 放在菜单栏右侧（ml-auto）而不是地址栏旁边 ——
             因为它是一个"模式"级别的开关，和「新建/删除」这些
             一次性的动作不是一类东西。分开摆更符合视觉分组。

          ⚠️ 用两段式的分段控件（segmented control）而不是单个切换按钮：
             因为只有两个互斥状态，分段控件能同时显示"当前是哪个"
             和"另一个是什么"，比一个需要点击才知道含义的按钮清楚。
        */}
        <div className="ml-auto flex items-center rounded border border-[var(--surface-border)] p-0.5">
          <SegBtn
            active={view === "folder"}
            onClick={() => setView("folder")}
            title={t("ex.viewFolderTip")}
          >
            📁 {t("ex.viewFolder")}
          </SegBtn>
          <SegBtn active={view === "flat"} onClick={() => setView("flat")} title={t("ex.viewListTip")}>
            ☰ {t("ex.viewList")}
          </SegBtn>
        </div>
      </div>

      {/* ══ 2. 地址栏 ══ */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--surface-border)] px-2 py-1.5">
        <button
          type="button"
          onClick={goUp}
          title={t("ex.back")}
          disabled={path === "/" || view === "flat"}
          className="grid h-6 w-6 place-items-center rounded text-[var(--fg-dim)]
                     transition-colors hover:bg-[var(--hover)] disabled:opacity-35"
        >
          ←
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-1 rounded border border-[var(--surface-border)] bg-[var(--surface)] px-2 py-1">
          <img src={rootIcon} alt="" className="h-3.5 w-3.5 shrink-0 object-contain" />

          {view === "flat" ? (
            // 平铺视图不分层级，"地址"显示成一句说明更诚实
            <span className="truncate text-[11px] text-[var(--fg-dim)]">
              {rootLabel} · {t("ex.allItems")}
            </span>
          ) : (
            crumbs.map((c, i) => (
              <span key={c.path} className="flex min-w-0 items-center gap-1">
                {i > 0 && <span className="shrink-0 text-[var(--fg-faint)]">›</span>}
                <button
                  type="button"
                  onClick={() => {
                    setPath(c.path);
                    setSelectedId(null);
                  }}
                  className={`truncate text-[11px] transition-colors hover:underline ${
                    i === crumbs.length - 1 ? "font-medium" : ""
                  }`}
                >
                  {c.label}
                </button>
              </span>
            ))
          )}
        </div>

        <input
          className="no-drag w-32 shrink-0 rounded border border-[var(--surface-border)] bg-[var(--surface)]
                     px-2 py-1 text-[11px] outline-none focus:border-[var(--accent)]"
          placeholder={`${t("ex.search")} ${rootLabel}`}
          readOnly
          title={t("ex.searchTip")}
        />
      </div>

      {/* ══ 3. 主体 ══ */}
      {/*
        ⚠️ min-h-0 是必须的，不能省。
        flex 子项的默认 min-height 是 auto，意味着它【不会小于内容高度】。
        表格内容一长，这个容器就会被撑高，把下面的状态栏挤出可视区
        （表现是状态栏被窗口底边裁掉一半）。
      */}
      <div className="flex min-h-0 flex-1">
        {/* ── 左：导航树 ── */}
        <nav className="w-[168px] shrink-0 overflow-y-auto border-r border-[var(--surface-border)] bg-[var(--surface-2)] py-1">
          <NavRow
            icon={rootIcon}
            label={rootLabel}
            count={tree.reduce((n, t) => n + countPosts(t), 0)}
            active={view === "folder" && path === "/"}
            onClick={() => {
              setPath("/");
              setSelectedId(null);
              setView("folder");
            }}
          />

          {navNodes.length > 0 && (
            <div className="my-1 border-t border-[var(--surface-border)]" />
          )}

          {navNodes.map(({ node, depth }) => (
            <NavRow
              key={node.id}
              folder
              label={nodeLabel(node)}
              count={countPosts(node)}
              // ⚠️ 缩进用 padding 而不是 margin：
              //    padding 在盒模型内部，不会把文字挤出容器；
              //    margin 会把元素整体右移，深层级时右边会被裁掉。
              indent={depth + 1}
              active={view === "folder" && path === node.id}
              onClick={() => {
                setPath(node.id);
                setSelectedId(null);
                setView("folder");
              }}
            />
          ))}
        </nav>

        {/* ── 右：内容 ── */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto">
            {rows.length === 0 ? (
              <div className="grid h-full place-items-center px-6 text-center text-[12px] text-[var(--fg-faint)]">
                {emptyText ?? t("ex.emptyFolder")}
              </div>
            ) : (
              <FileList
                nodes={rows}
                selectedId={selectedId}
                onSelect={(n) => setSelectedId(n.id)}
                onOpen={open}
                sortKey={key}
                sortDir={dir}
                onToggleSort={toggle}
              />
            )}
          </div>

          {/* ── 状态栏 ── */}
          <div className="flex shrink-0 items-center gap-3 border-t border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-1 text-[11px] text-[var(--fg-dim)]">
            <span>{t("ex.itemCount", { n: rows.length })}</span>
            {selectedNode && (
              <span className="truncate text-[var(--fg)]">
                {t("ex.selected", { name: nodeLabel(selectedNode) })}
              </span>
            )}
            <span className="ml-auto shrink-0 text-[var(--fg-faint)]">
              {view === "flat" ? t("ex.allItems") : t("ex.doubleClickOpen")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 小零件 ── */

function SegBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`rounded-sm px-2 py-0.5 text-[11px] transition-colors ${
        active
          ? "bg-[color-mix(in_srgb,var(--accent)_88%,transparent)] text-white"
          : "text-[var(--fg-dim)] hover:bg-[var(--hover)]"
      }`}
    >
      {children}
    </button>
  );
}

function NavRow({
  icon,
  folder,
  label,
  count,
  indent = 0,
  active,
  onClick,
}: {
  icon?: string;
  folder?: boolean;
  label: string;
  count: number;
  indent?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      style={{ paddingLeft: 10 + indent * 12 }}
      className={`flex w-full items-center gap-1.5 py-1 pr-2 text-left text-[11.5px]
                  transition-colors ${
                    active
                      ? "bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] font-medium"
                      : "hover:bg-[var(--hover)]"
                  }`}
    >
      {icon ? (
        <img src={icon} alt="" className="h-3.5 w-3.5 shrink-0 object-contain" />
      ) : (
        <span className="w-3.5 shrink-0 text-center text-[12px] leading-none" aria-hidden="true">
          {folder ? "📁" : "📄"}
        </span>
      )}
      <span className="truncate">{label}</span>
      <span className="ml-auto shrink-0 text-[10px] text-[var(--fg-faint)]">{count}</span>
    </button>
  );
}
