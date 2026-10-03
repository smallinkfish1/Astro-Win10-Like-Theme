import { formatDate } from "../../../lib/markdown";
import type { ClientPost } from "../../../lib/markdown";

/**
 * 回收站（草稿箱）。
 *
 * 这里对应的是 frontmatter 里 draft: true 的文章。
 *
 * 一个刻意的设计：草稿在窗口里【用纯文本预览】而不是渲染成 HTML。
 * 理由是想让"这是未完成的东西"这件事在视觉上就能感觉到 ——
 * 渲染得跟正式文章一样漂亮，反而会让人忘记它还没准备好。
 *
 * 另外，草稿的静态页 /posts/[slug] 是能访问的（方便自己分享预览链接），
 * 但它不会出现在列表、归档、标签页和 search-index.json 里。
 */
export default function DraftsView({ posts }: { posts: ClientPost[] }) {
  const openPost = (p: ClientPost) => {
    window.dispatchEvent(
      new CustomEvent("os:open-post", {
        detail: { slug: p.slug, title: p.title, icon: "📝" },
      })
    );
  };

  if (posts.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-[#98a1ae]">
        <div className="text-[34px] leading-none opacity-40">🗑️</div>
        <div className="text-[12px]">回收站是空的</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex shrink-0 items-baseline gap-2 border-b border-[#e6e8eb] pb-2">
        <span className="text-[13px] font-semibold text-[#16202c]">草稿</span>
        <span className="text-[11.5px] text-[#8a94a3]">
          {posts.length} 篇 · 不会出现在公开列表中
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="flex flex-col gap-3">
          {posts.map((p) => (
            <div
              key={p.slug}
              className="rounded border border-dashed border-[#d8dee6] bg-[#fbfcfd] p-3"
            >
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-[13px]">📝</span>
                <span className="flex-1 truncate text-[13px] font-medium text-[#3d4653]">
                  {p.title}
                </span>
                <span className="shrink-0 rounded bg-[#eef2f7] px-1.5 py-px text-[10px] text-[#6b7280]">
                  草稿
                </span>
              </div>

              {/* 纯文本预览：限制高度，超出滚动 */}
              <div className="mb-2 max-h-40 overflow-y-auto rounded bg-white p-2
                              font-mono text-[11px] leading-relaxed text-[#57606a]
                              whitespace-pre-wrap">
                {p.body.slice(0, 600)}
                {p.body.length > 600 ? "\n…" : ""}
              </div>

              <div className="flex items-center gap-3 text-[11px] text-[#8a94a3]">
                <span>{formatDate(p.pubDate)}</span>
                <span>{p.body.length} 字符</span>
                <button
                  onClick={() => openPost(p)}
                  className="no-drag ml-auto rounded border border-[#d8dee6] bg-white px-2 py-0.5
                             text-[11px] text-[#41566f] transition-colors hover:border-[#2b579a]
                             hover:text-[#2b579a]"
                >
                  渲染预览
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
