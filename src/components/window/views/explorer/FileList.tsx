import { useEffect, useRef } from "react";
import { countPosts, type FileNode, type SortDir, type SortKey } from "./types";
import { useT, fmtDate } from "../../../../i18n";
import type { Dict } from "../../../../i18n/types";

/**
 * 详细列表（右侧）。
 * ================================================================
 *
 * 对应 Win10 资源管理器右侧那张表：名称 / 修改日期（可排序）。
 *
 * ⚠️ 交互约定（必须和桌面图标、开始菜单磁贴保持一致）：
 *    单击 = 选中
 *    双击 = 打开
 *
 *    这个约定在三处地方都要一样，否则用户会混乱。
 *    触摸设备上没有"双击"这个概念，所以额外加了
 *    onTouchEnd → 打开（靠"单击选中"在触屏上本来就没意义）。
 */

export interface FileListProps {
  nodes: FileNode[];
  selectedId: string | null;
  onSelect: (node: FileNode) => void;
  onOpen: (node: FileNode) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggleSort: (key: SortKey) => void;
}

export default function FileList({
  nodes,
  selectedId,
  onSelect,
  onOpen,
  sortKey,
  sortDir,
  onToggleSort,
}: FileListProps) {
  const { t, lang, regional } = useT();
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  /**
   * 节点的显示名。
   *
   * ⚠️ 分两种情况，别一律 t() —— 见 explorer/types.ts 里 nameKey 的说明：
   *    文件夹名和文章标题来自内容（不翻译），
   *    只有兜底的「未分类」带 nameKey，才需要翻译。
   */
  const nodeLabel = (node: FileNode) =>
    node.nameKey ? t(node.nameKey as keyof Dict) : node.name;

  /**
   * 选中项滚进视野。
   *
   * ⚠️ 什么时候需要这个？
   *    当选中是通过【键盘】或【地址栏跳转】改变时，
   *    选中行可能在滚动区外面 —— 用户看不到自己选了什么。
   *    用 scrollIntoView 把它带进来。
   *
   * ⚠️ 但鼠标点击时【不能】这么做。因为点击本身就是用户
   *    在可见区域内的操作，再滚一次会让列表"跳"一下，
   *    手感很怪。所以这里用 "nearest" 而不是 "center" ——
   *    已经在视野内时它什么都不做。
   *
   * capture 阶段先跑，说明这是"应对环境变化"而不是"响应用户点击"，
   * 用 nearest 正好。
   */
  useEffect(() => {
    if (!selectedId) return;
    const row = bodyRef.current?.querySelector(`[data-node-id="${CSS.escape(selectedId)}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  if (nodes.length === 0) {
    return (
      <div className="grid h-full place-items-center text-[12px] text-[var(--fg-faint)]">
        {t("ex.emptyFolder")}
      </div>
    );
  }

  return (
    <table className="w-full border-collapse text-[12px]">
      <thead className="sticky top-0 z-10 bg-[var(--surface-2)]">
        <tr className="text-left text-[11px] text-[var(--fg-dim)]">
          <Th
            onClick={() => onToggleSort("name")}
            active={sortKey === "name"}
            dir={sortDir}
            className="min-w-[180px]"
          >
            {t("ex.name")}
          </Th>
          <Th
            onClick={() => onToggleSort("kind")}
            active={sortKey === "kind"}
            dir={sortDir}
            className="hidden w-[110px] sm:table-cell"
          >
            {t("ex.type")}
          </Th>
          <Th
            onClick={() => onToggleSort("date")}
            active={sortKey === "date"}
            dir={sortDir}
            className="w-[104px]"
          >
            {t("ex.dateModified")}
          </Th>
        </tr>
      </thead>

      <tbody ref={bodyRef}>
        {nodes.map((node) => {
          const isSel = selectedId === node.id;
          const isFolder = node.kind === "folder";

          return (
            <tr
              key={node.id}
              data-node-id={node.id}
              tabIndex={0}
              role="button"
              aria-label={`${isFolder ? t("ex.folder") : t("ex.postKind")} ${nodeLabel(node)}`}
              aria-selected={isSel}
              onClick={() => onSelect(node)}
              onDoubleClick={() => onOpen(node)}
              onKeyDown={(e) => {
                // 回车/空格 = 打开（键盘用户没有"双击"）
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen(node);
                }
              }}
              /**
               * ⚠️ 触屏兜底：单击直接打开。
               *
               *    触屏上没有 hover、没有双击，如果只绑 onClick，
               *    用户点一下只是"选中"，永远打不开东西 —— 会以为坏了。
               *    所以触屏上让单击等于打开。
               */
              onTouchEnd={() => onOpen(node)}
              className={`cursor-default border-b border-[var(--surface-border)]/50
                          transition-colors ${
                            isSel
                              ? "bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]"
                              : "hover:bg-[var(--hover)]"
                          }`}
            >
              <td className="px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <NodeIcon node={node} />
                  <span className="truncate text-[var(--fg)]">{nodeLabel(node)}</span>
                  {isFolder && (
                    <span className="shrink-0 text-[10px] text-[var(--fg-faint)]">
                      ({countPosts(node)})
                    </span>
                  )}
                </div>
              </td>

              <td className="hidden px-2 py-1.5 sm:table-cell">
                <span className="rounded-sm bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--fg-dim)]">
                  {isFolder ? t("ex.folder") : (node.post?.category ?? t("ex.uncategorized"))}
                </span>
              </td>

              <td className="px-2 py-1.5 tabular-nums text-[var(--fg-dim)]">
                {node.post ? fmtDate(node.post.pubDate, lang, regional) : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── 小零件 ── */

/**
 * 节点图标。
 *
 * ⚠️ 文件夹用 Win10 那个经典的黄色文件夹 emoji（📁），
 *    文章用记事本图标（📄）。
 *    为什么不用 PNG？因为文件夹没有对应的 PNG 资源，
 *    而混用 emoji 和 PNG 在小尺寸下反而不突兀 ——
 *    emoji 在这两种尺寸下渲染得足够清楚。
 */
function NodeIcon({ node }: { node: FileNode }) {
  const { t } = useT();

  if (node.kind === "folder") {
    return (
      <span className="w-3.5 shrink-0 text-center text-[12px] leading-none" aria-hidden="true">
        📁
      </span>
    );
  }

  return (
    <span
      className="w-3.5 shrink-0 text-center text-[12px] leading-none"
      aria-hidden="true"
      title={node.kind === "draft" ? t("ex.draftKind") : t("ex.postKind")}
    >
      {node.kind === "draft" ? "🗑️" : "📄"}
    </span>
  );
}

/**
 * 可排序的列头。
 *
 * ⚠️ 箭头方向：
 *    asc（升序） → ▲  小的在上面
 *    desc（降序） → ▼ 大的在上面
 *
 *    这两个符号是纯文字（不是 svg），因为在 11px 字号下，
 *    svg 图标很难画得清楚，而三角字符在系统字体里就有。
 */
function Th({
  children,
  onClick,
  active,
  dir,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: SortDir;
  className?: string;
}) {
  const { t } = useT();

  return (
    <th className={`border-b border-[var(--surface-border)] p-0 font-normal ${className}`}>
      <button
        type="button"
        onClick={onClick}
        title={t("ex.sortTip", { name: String(children) })}
        className={`flex w-full items-center gap-1 px-2 py-1.5 text-left transition-colors
                    hover:bg-[var(--hover)] ${active ? "font-medium text-[var(--fg)]" : ""}`}
      >
        {children}
        {active && (
          <span className="text-[9px] text-[var(--accent)]">{dir === "asc" ? "▲" : "▼"}</span>
        )}
      </button>
    </th>
  );
}
