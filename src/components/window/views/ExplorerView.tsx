import { useState, useMemo } from "react";
import { formatDate, type ClientPost } from "../../../lib/markdown";

/**
 * 「此电脑」窗口 —— 仿 Win10 文件资源管理器。
 *
 * 为什么要仿资源管理器？
 *   因为「用文件夹看文章」是用户对这块桌面的第一直觉。直接把
 *   文章列表做成一张 CSV 式的表太"网页"了，而左侧导航树 + 右侧
 *   详细列表（名称 / 分类 / 修改日期）才是这个隐喻该有的样子。
 *
 * 三层结构，从上到下：
 *   1. 功能区（ribbon）：只有装饰性的几个按钮，不做真实功能 ——
 *      但每一个都给了 title 提示，让人知道"这里本该有什么"。
 *   2. 地址栏：面包屑，显示当前所在位置，可以点"此电脑"回到根。
 *   3. 主体：左侧导航树（按分类） + 右侧文件列表。底部是状态栏。
 *
 * 交互沿用桌面的规则：单击选中，双击打开。
 */

/** 导航树的一项 —— 分类 */
interface NavCategory {
  name: string;
  count: number;
}

/** 列表排序方式 */
type SortKey = "name" | "date" | "category";

/** 图标的小工具：分类色块。用色相区分分类，比纯文字更快扫读 */
const CATEGORY_HUES = [207, 280, 168, 8, 32, 145, 220];

function hueOf(name: string, all: string[]): number {
  const i = all.indexOf(name);
  return CATEGORY_HUES[(i < 0 ? 0 : i) % CATEGORY_HUES.length];
}

export default function ExplorerView({
  posts,
  categories,
}: {
  posts: ClientPost[];
  categories: NavCategory[];
}) {
  /** 当前选中的导航项。"all" 表示「此电脑」根节点 */
  const [scope, setScope] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("date");

  const categoryNames = useMemo(() => categories.map((c) => c.name), [categories]);

  /** 当前范围下的文章 */
  const rows = useMemo(() => {
    const base = scope === "all" ? posts : posts.filter((p) => p.category === scope);
    const sorted = [...base];
    sorted.sort((a, b) => {
      if (sort === "name") return a.title.localeCompare(b.title, "zh-CN");
      if (sort === "category") return a.category.localeCompare(b.category, "zh-CN");
      // date：新的在前
      return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
    });
    return sorted;
  }, [posts, scope, sort]);

  const openPost = (p: ClientPost) => {
    window.dispatchEvent(
      new CustomEvent("os:open-post", {
        detail: { slug: p.slug, title: p.title, icon: "/icons/notepad.png" },
      })
    );
  };

  /** 列头点击切换排序；点同一个列头就在 该列 / 日期 之间来回切 */
  const toggleSort = (key: SortKey) => setSort((s) => (s === key ? "date" : key));

  return (
    <div className="flex h-full flex-col text-[12px]">
      {/* ── 1. 功能区（纯装饰，还原视觉密度） ── */}
      <div className="flex shrink-0 items-center gap-1 border-b border-[var(--surface-border)] bg-[var(--surface-2)] px-2 py-1">
        {[
          { k: "新建", i: "🗋" },
          { k: "共享", i: "⇪" },
          { k: "查看", i: "▤" },
          { k: "删除", i: "🗑" },
        ].map((b) => (
          <button
            key={b.k}
            type="button"
            title={`${b.k}（演示界面，暂未实现）`}
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[var(--fg-dim)]
                       transition-colors hover:bg-[var(--hover)]"
          >
            <span className="text-[13px] leading-none">{b.i}</span>
            {b.k}
          </button>
        ))}
      </div>

      {/* ── 2. 地址栏：面包屑 ── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--surface-border)] px-2 py-1.5">
        <button
          type="button"
          onClick={() => setScope("all")}
          title="后退（回到此电脑）"
          className="grid h-6 w-6 place-items-center rounded text-[var(--fg-dim)]
                     transition-colors hover:bg-[var(--hover)] disabled:opacity-35"
          disabled={scope === "all"}
        >
          ←
        </button>

        <div className="flex flex-1 items-center gap-1 rounded border border-[var(--surface-border)] bg-[var(--surface)] px-2 py-1">
          <img src="/icons/pc.png" alt="" className="h-3.5 w-3.5 object-contain" />
          <button
            type="button"
            onClick={() => setScope("all")}
            className="text-[11px] hover:underline"
          >
            此电脑
          </button>
          {scope !== "all" && (
            <>
              <span className="text-[var(--fg-faint)]">›</span>
              <span className="text-[11px] font-medium">{scope}</span>
            </>
          )}
        </div>

        <input
          className="no-drag w-32 rounded border border-[var(--surface-border)] bg-[var(--surface)]
                     px-2 py-1 text-[11px] outline-none focus:border-[var(--accent)]"
          placeholder="搜索 此电脑"
          readOnly
          title="搜索请用开始菜单的搜索框"
        />
      </div>

      {/* ── 3. 主体：左树 + 右列表 ── */}
      {/*
        ⚠️ min-h-0 是必须的，不能省。
        flex 子项的默认 min-height 是 auto，意味着它【不会小于内容高度】。
        表格内容一长，这个容器就会被撑高，把下面的状态栏挤出可视区
        （表现是状态栏被窗口底边裁掉一半）。
        min-h-0 把这条隐含约束解掉，容器才肯乖乖收缩到剩余空间。
      */}
      <div className="flex min-h-0 flex-1">
        {/* 左侧导航 */}
        <nav className="w-[155px] shrink-0 overflow-y-auto border-r border-[var(--surface-border)] bg-[var(--surface-2)] py-1">
          <NavItem
            icon="/icons/pc.png"
            label="此电脑"
            count={posts.length}
            active={scope === "all"}
            onClick={() => setScope("all")}
          />
          <div className="my-1 border-t border-[var(--surface-border)]" />
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-faint)]">
            分类
          </div>
          {categories.map((c) => (
            <NavItem
              key={c.name}
              dot={`hsl(${hueOf(c.name, categoryNames)} 55% 48%)`}
              label={c.name}
              count={c.count}
              active={scope === c.name}
              onClick={() => setScope(c.name)}
            />
          ))}
        </nav>

        {/* 右侧列表 */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto">
            {rows.length === 0 ? (
              <div className="grid h-full place-items-center text-[var(--fg-faint)]">
                这个文件夹是空的
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10 bg-[var(--surface-2)]">
                  <tr className="text-left text-[11px] text-[var(--fg-dim)]">
                    <Th onClick={() => toggleSort("name")} active={sort === "name"}>
                      名称
                    </Th>
                    <Th
                      onClick={() => toggleSort("category")}
                      active={sort === "category"}
                      className="hidden w-[110px] sm:table-cell"
                    >
                      分类
                    </Th>
                    <Th
                      onClick={() => toggleSort("date")}
                      active={sort === "date"}
                      className="w-[92px]"
                    >
                      修改日期
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const isSel = selected === p.slug;
                    return (
                      <tr
                        key={p.slug}
                        tabIndex={0}
                        role="button"
                        aria-label={`打开 ${p.title}`}
                        onClick={() => setSelected(p.slug)}
                        onDoubleClick={() => openPost(p)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openPost(p);
                          }
                        }}
                        onTouchEnd={() => openPost(p)}
                        className={`cursor-default border-b border-[var(--surface-border)]/50
                                    transition-colors ${
                                      isSel
                                        ? "bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]"
                                        : "hover:bg-[var(--hover)]"
                                    }`}
                      >
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            <span className="w-3.5 shrink-0 text-center text-[12px]" aria-hidden="true">
                              📄
                            </span>
                            <span className="truncate text-[var(--fg)]">{p.title}</span>
                          </div>
                        </td>
                        <td className="hidden px-2 py-1.5 sm:table-cell">
                          <span className="rounded-sm bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--fg-dim)]">
                            {p.category}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 tabular-nums text-[var(--fg-dim)]">
                          {formatDate(p.pubDate)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* 状态栏 */}
          <div className="flex shrink-0 items-center gap-3 border-t border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-1 text-[11px] text-[var(--fg-dim)]">
            <span>{rows.length} 个项目</span>
            {selected && (
              <span className="truncate text-[var(--fg)]">
                已选中：{rows.find((r) => r.slug === selected)?.title}
              </span>
            )}
            <span className="ml-auto text-[var(--fg-faint)]">双击打开</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 小零件 ── */

function NavItem({
  icon,
  dot,
  label,
  count,
  active,
  onClick,
}: {
  icon?: string;
  dot?: string;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1 text-left text-[11.5px]
                  transition-colors ${
                    active
                      ? "bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] font-medium"
                      : "hover:bg-[var(--hover)]"
                  }`}
    >
      {icon ? (
        <img src={icon} alt="" className="h-3.5 w-3.5 shrink-0 object-contain" />
      ) : (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-sm"
          style={{ background: dot }}
          aria-hidden="true"
        />
      )}
      <span className="truncate">{label}</span>
      <span className="ml-auto text-[10px] text-[var(--fg-faint)]">{count}</span>
    </button>
  );
}

function Th({
  children,
  onClick,
  active,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  className?: string;
}) {
  return (
    <th className={`border-b border-[var(--surface-border)] p-0 font-normal ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-1 px-2 py-1.5 text-left
                   transition-colors hover:bg-[var(--hover)]"
        title="点击切换排序"
      >
        {children}
        {active && <span className="text-[9px] text-[var(--accent)]">▲</span>}
      </button>
    </th>
  );
}
