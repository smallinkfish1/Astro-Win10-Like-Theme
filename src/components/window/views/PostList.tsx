import { useState, useMemo } from "react";
import { formatDate, readingMinutes, type ClientPost } from "../../../lib/markdown";
import { useT, fmtRelative } from "../../../i18n";

/**
 * 窗口内的文章列表（"我的文档"）。
 *
 * 交互设计上有一个取舍：
 *   双击卡片 = 打开文章窗口（和桌面图标一致的手感）
 *   单击卡片   = 选中（高亮），但不开
 *
 * 为什么不做成"单击就开"？因为桌面隐喻里，单击是「选中」，
 * 双击才是「打开」。保持这个一致性，用户不用学两套规则。
 * 但在触屏上没法双击，所以移动端退化成单击打开。
 */
export default function PostList({
  posts,
  title,
}: {
  posts: ClientPost[];
  title?: string;
}) {
  const { t } = useT();

  /**
   * ⚠️ 标题的默认值必须在这里算，不能写成参数默认值 `title = "全部文章"`。
   *    因为默认参数在那个位置上调用不了 hook —— t 还没拿到。
   */
  const heading = title ?? t("post.allPosts");

  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  /** 本地过滤：只搜标题/摘要/标签，不拉全文索引（那个是搜索窗口的活） */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [posts, query]);

  /** 打开文章窗口。用 CustomEvent 发给 WindowManager —— 列表不直接改 store，
   *  保证「开窗口」这件事只有一个入口，URL 同步逻辑不会漏掉。 */
  const openPost = (p: ClientPost) => {
    window.dispatchEvent(
      new CustomEvent("os:open-post", {
        detail: { slug: p.slug, title: p.title, icon: "📄" },
      })
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* ── 顶部：标题 + 本地过滤 ── */}
      <div className="mb-3 flex shrink-0 items-center gap-3">
        <div className="text-[13px] font-semibold text-[#16202c]">
          {heading}
          <span className="ml-2 font-normal text-[#8a94a3]">
            {t("post.count", { n: filtered.length })}
          </span>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("post.filterPlaceholder")}
          className="no-drag ml-auto w-44 rounded border border-[#d8dee6] px-2 py-1 text-[12px]
                     outline-none transition-colors focus:border-[#2b579a]"
        />
      </div>

      {/* ── 列表 ── */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className="grid h-full place-items-center text-[12px] text-[#98a1ae]">
            {posts.length === 0 ? t("post.noPosts") : t("post.noMatch")}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((p) => {
              const isSel = selected === p.slug;
              return (
                <div
                  key={p.slug}
                  role="button"
                  tabIndex={0}
                  aria-label={t("post.openAria", { title: p.title })}
                  onDoubleClick={() => openPost(p)}
                  onClick={() => setSelected(p.slug)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openPost(p);
                    }
                  }}
                  onTouchEnd={() => openPost(p)}
                  className={`post-card cursor-default ${
                    isSel ? "border-[#2b579a] bg-[#f2f6fb]" : ""
                  }`}
                  style={p.accent ? { borderLeftColor: p.accent } : undefined}
                >
                  <h3 className="post-card-title">{p.title}</h3>
                  <p className="post-card-desc">{p.description || t("post.noSummary")}</p>

                  <div className="post-card-foot">
                    <span>{formatDate(p.pubDate)}</span>
                    <span>·</span>
                    <span>{t("time.readingTime", { n: readingMinutes(p.body) })}</span>
                    <span>·</span>
                    <span className="text-[#41566f]">{p.category}</span>

                    {p.tags.slice(0, 3).map((t) => (
                      <span key={t} className="md-chip">
                        #{t}
                      </span>
                    ))}

                    {/* 静态页入口：Ctrl/中键点击走正常网页跳转 */}
                    <a
                      className="no-drag ml-auto text-[11px] text-[#2b579a] hover:underline"
                      href={`/posts/${p.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t("post.staticPage")}
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 底部提示：讲清楚"双击"这个隐藏操作 ── */}
      {filtered.length > 0 && (
        <div className="mt-2 shrink-0 border-t border-[#eceff2] pt-2 text-[11px] text-[#98a1ae]">
          {t("post.footerTip", { date: fmtRelative(posts[0]?.pubDate ?? "", t) })}
        </div>
      )}
    </div>
  );
}
