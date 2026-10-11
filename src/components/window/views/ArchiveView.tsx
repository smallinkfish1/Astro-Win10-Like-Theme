import { useMemo, useState } from "react";
import { formatDate } from "../../../lib/markdown";
import type { ClientPost } from "../../../lib/markdown";
import { useT } from "../../../i18n";

/**
 * 归档视图（对应桌面上的"此电脑"）。
 *
 * 为什么"此电脑"映射到归档？
 *   因为归档的本质就是「按文件系统的方式浏览内容」—— 年份是文件夹，
 *   月份是子文件夹，文章是文件。这个映射几乎不需要解释。
 *
 * 交互上模仿资源管理器的「详细信息」视图：可排序列、可展开折叠。
 */
export default function ArchiveView({ posts }: { posts: ClientPost[] }) {
  const { t } = useT();

  /** 按年分组 */
  const years = useMemo(() => {
    const map = new Map<number, ClientPost[]>();
    for (const p of posts) {
      const y = new Date(p.pubDate).getFullYear();
      if (!map.has(y)) map.set(y, []);
      map.get(y)!.push(p);
    }
    return [...map.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, list]) => ({
        year,
        posts: list.sort((a, b) => (a.pubDate < b.pubDate ? 1 : -1)),
        months: new Set(list.map((p) => new Date(p.pubDate).getMonth() + 1)).size,
      }));
  }, [posts]);

  /** 折叠状态：默认全部展开，点年份标题可以收起 */
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const toggle = (y: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(y) ? next.delete(y) : next.add(y);
      return next;
    });

  const openPost = (p: ClientPost) => {
    window.dispatchEvent(
      new CustomEvent("os:open-post", {
        detail: { slug: p.slug, title: p.title, icon: "📄" },
      })
    );
  };

  if (posts.length === 0) {
    return (
      <div className="grid h-full place-items-center text-[12px] text-[#98a1ae]">
        {t("archive.empty")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* 表头：模仿资源管理器的列头 */}
      <div className="mb-1 flex shrink-0 items-center gap-3 border-b border-[#e6e8eb] px-2 pb-1.5
                      text-[11px] font-medium text-[#6b7280]">
        <span className="flex-1">{t("ex.name")}</span>
        <span className="w-20 shrink-0">{t("post.categoryLabel")}</span>
        <span className="w-20 shrink-0 text-right">{t("ex.dateModified")}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {years.map(({ year, posts: list, months }) => {
          const isCollapsed = collapsed.has(year);
          return (
            <div key={year} className="mb-2">
              {/* 年份行 */}
              <button
                onClick={() => toggle(year)}
                className="no-drag flex w-full items-center gap-2 rounded px-2 py-1 text-left
                           transition-colors hover:bg-[#f2f6fb]"
              >
                <span className="w-3 text-[9px] text-[#8a94a3]">
                  {isCollapsed ? "▶" : "▼"}
                </span>
                <span className="text-[13px] font-semibold text-[#16202c]">
                  {t("archive.yearUnit", { n: year })}
                </span>
                <span className="text-[11px] text-[#98a1ae]">
                  {t("post.count", { n: list.length })} · {t("archive.monthUnit", { n: months })}
                </span>
              </button>

              {/* 文章行 */}
              {!isCollapsed &&
                list.map((p) => (
                  <div
                    key={p.slug}
                    role="button"
                    tabIndex={0}
                    aria-label={t("post.openAria", { title: p.title })}
                    onDoubleClick={() => openPost(p)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        openPost(p);
                      }
                    }}
                    onTouchEnd={() => openPost(p)}
                    className="flex cursor-default items-center gap-3 rounded px-2 py-1.5 pl-5
                               transition-colors hover:bg-[#f2f6fb] focus:bg-[#e8f0fa] focus:outline-none"
                  >
                    <span className="shrink-0 text-[13px]">📄</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#24292f]">
                      {p.title}
                    </span>
                    <span className="w-20 shrink-0 truncate text-[11.5px] text-[#6b7280]">
                      {p.category}
                    </span>
                    <span className="w-20 shrink-0 text-right text-[11.5px] tabular-nums text-[#8a94a3]">
                      {formatDate(p.pubDate).slice(5)}
                    </span>
                  </div>
                ))}
            </div>
          );
        })}
      </div>

      <div className="mt-2 shrink-0 border-t border-[#eceff2] pt-2 text-[11px] text-[#98a1ae]">
        {t("archive.footer", { n: posts.length })}
      </div>
    </div>
  );
}
