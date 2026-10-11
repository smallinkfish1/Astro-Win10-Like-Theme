import type { ClientPost } from "../../../lib/markdown";
import { useT } from "../../../i18n";

export interface TagInfo {
  name: string;
  count: number;
}

/**
 * 标签视图。
 *
 * 两种入口共用这个组件：
 *   - "标签"图标 → 显示全部标签的云 + 统计（filter 为空）
 *   - 点某个标签 / 开始菜单的标签磁贴 → 直接显示该标签下的文章（filter 有值）
 *
 * 标签云用「字号随文章数变化」来做视觉分层 —— 这是标签云唯一真正有用的
 * 信息量所在，纯随机大小只是装饰。
 */
export default function TagsView({
  tags,
  categories,
  posts,
  filter = null,
  filterType = "tag",
}: {
  tags: TagInfo[];
  categories: TagInfo[];
  posts: ClientPost[];
  filter?: string | null;
  filterType?: "tag" | "category";
}) {
  const { t } = useT();

  const openPost = (p: ClientPost) => {
    window.dispatchEvent(
      new CustomEvent("os:open-post", {
        detail: { slug: p.slug, title: p.title, icon: "📄" },
      })
    );
  };

  /** 在桌面里切换到另一个标签/分类窗口 */
  const openFilter = (name: string, type: "tag" | "category") => {
    window.dispatchEvent(
      new CustomEvent("os:open-window", {
        detail: {
          id: `${type}:${name}`,
          title: type === "tag" ? t("win.tagTitle", { name }) : t("win.categoryTitle", { name }),
          icon: "🏷️",
          path:
            type === "tag"
              ? `/tags/${encodeURIComponent(name)}`
              : `/category/${encodeURIComponent(name)}`,
        },
      })
    );
  };

  /** 当前筛选出的文章 */
  const matched = filter
    ? posts.filter((p) =>
        filterType === "tag" ? p.tags.includes(filter) : p.category === filter
      )
    : [];

  /** 标签云的相对字号：最少 11px，最多 19px */
  /**
   * ⚠️ 回调参数叫 tag 而不是 t ——
   *    组件作用域里的 t 是翻译函数，再叫 t 会把它遮蔽掉。
   */
  const maxCount = Math.max(1, ...tags.map((tag) => tag.count));
  const sizeOf = (n: number) => 11 + Math.round(((n - 1) / Math.max(1, maxCount - 1)) * 8);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      {/* ── 标签云 ── */}
      <section className="shrink-0">
        <h4 className="mb-2 text-[12px] font-semibold text-[#16202c]">
          {t("tags.cloud")}
          <span className="ml-2 font-normal text-[#8a94a3]">
            {t("tags.tagCount", { n: tags.length })}
          </span>
        </h4>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          {tags.map((tag) => {
            const active = filterType === "tag" && filter === tag.name;
            return (
              <button
                key={tag.name}
                onClick={() => openFilter(tag.name, "tag")}
                title={t("tags.postCount", { n: tag.count })}
                style={{ fontSize: sizeOf(tag.count) }}
                className={`no-drag leading-none transition-colors ${
                  active
                    ? "font-semibold text-[#2b579a]"
                    : "text-[#41566f] hover:text-[#2b579a]"
                }`}
              >
                #{tag.name}
                <sub className="ml-0.5 text-[9px] text-[#98a1ae]">{tag.count}</sub>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── 分类 ── */}
      <section className="shrink-0">
        <h4 className="mb-2 text-[12px] font-semibold text-[#16202c]">
          {t("tags.categories")}
          <span className="ml-2 font-normal text-[#8a94a3]">
            {t("tags.categoryCount", { n: categories.length })}
          </span>
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => {
            const active = filterType === "category" && filter === c.name;
            return (
              <button
                key={c.name}
                onClick={() => openFilter(c.name, "category")}
                className={`no-drag rounded border px-2 py-0.5 text-[11.5px] transition-colors ${
                  active
                    ? "border-[#2b579a] bg-[#eaf1fa] text-[#2b579a]"
                    : "border-[#e0e5eb] text-[#41566f] hover:border-[#2b579a] hover:text-[#2b579a]"
                }`}
              >
                📂 {c.name}
                <span className="ml-1 text-[#98a1ae]">{c.count}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── 筛选结果（有 filter 时才显示） ── */}
      {filter && (
        <section className="min-h-0 flex-1">
          <h4 className="mb-2 border-b border-[#e6e8eb] pb-1.5 text-[12px] font-semibold text-[#16202c]">
            {filterType === "tag" ? `#${filter}` : filter}
            <span className="ml-2 font-normal text-[#8a94a3]">
              {t("post.count", { n: matched.length })}
            </span>
          </h4>

          {matched.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-[#98a1ae]">{t("tags.noPosts")}</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {matched.map((p) => (
                <div
                  key={p.slug}
                  role="button"
                  tabIndex={0}
                  onDoubleClick={() => openPost(p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      openPost(p);
                    }
                  }}
                  onTouchEnd={() => openPost(p)}
                  className="flex cursor-default items-center gap-2 rounded px-2 py-1.5
                             text-[12.5px] text-[#24292f] transition-colors
                             hover:bg-[#f2f6fb] focus:bg-[#e8f0fa] focus:outline-none"
                >
                  <span className="shrink-0">📄</span>
                  <span className="min-w-0 flex-1 truncate">{p.title}</span>
                  <span className="shrink-0 text-[11px] text-[#98a1ae]">
                    {p.pubDate.slice(0, 10)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
