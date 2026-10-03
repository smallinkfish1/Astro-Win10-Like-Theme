export interface AboutStats {
  postCount: number;
  categoryCount: number;
  tagCount: number;
  wordCount: number;
  latest: string | null;
}

/**
 * 关于页（对应桌面上的"网络"图标）。
 *
 * "网络"映射到"关于"是个不那么直观的对应 —— 原始需求里就是这么定的。
 * 从语义上讲它是"通向外部世界的窗口"（GitHub、RSS、邮箱都在这一块），
 * 所以我把它做成一个"站点信息 + 联系方式"的着陆页。
 */
export default function AboutView({ stats }: { stats: AboutStats }) {
  const words = stats.wordCount.toLocaleString("en-US");

  const links = [
    { icon: "🐙", label: "GitHub", href: "https://github.com", note: "源码" },
    { icon: "📡", label: "RSS", href: "/rss.xml", note: "订阅" },
    { icon: "✉️", label: "Email", href: "mailto:me@example.com", note: "联系" },
    { icon: "🗺️", label: "Sitemap", href: "/sitemap.xml", note: "站点地图" },
  ];

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto pr-1">
      {/* ── 头像 + 一句话介绍 ── */}
      <section className="flex items-start gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full
                        bg-gradient-to-br from-[#2b579a] to-[#1b6fb5] text-[24px]
                        text-white shadow-inner">
          👤
        </div>
        <div className="min-w-0">
          <h3 className="mb-1 text-[15px] font-semibold text-[#10151c]">你好，我是站长</h3>
          <p className="text-[12.5px] leading-relaxed text-[#57606a]">
            这里是一个把博客做成了 Windows 10 桌面的地方。
            双击图标开窗口，任务栏切换窗口，开始菜单里是真实的分类和标签。
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#57606a]">
            界面看起来像个壳，但每一篇文章都有独立的静态页 ——
            体验归体验，内容归内容。
          </p>
        </div>
      </section>

      {/* ── 站点统计 ── */}
      <section>
        <h4 className="mb-2 text-[12px] font-semibold text-[#16202c]">站点统计</h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { k: "文章", v: stats.postCount, u: "篇" },
            { k: "分类", v: stats.categoryCount, u: "个" },
            { k: "标签", v: stats.tagCount, u: "个" },
            { k: "字数", v: words, u: "约" },
          ].map((s) => (
            <div
              key={s.k}
              className="rounded border border-[#e8ebef] bg-[#fafbfc] px-3 py-2 text-center"
            >
              <div className="text-[17px] font-semibold tabular-nums text-[#2b579a]">
                {s.v}
              </div>
              <div className="text-[10.5px] text-[#8a94a3]">
                {s.u} {s.k}
              </div>
            </div>
          ))}
        </div>
        {stats.latest && (
          <p className="mt-2 text-[11.5px] text-[#8a94a3]">
            最近更新：{stats.latest.slice(0, 10)}
          </p>
        )}
      </section>

      {/* ── 外链 ── */}
      <section>
        <h4 className="mb-2 text-[12px] font-semibold text-[#16202c]">找到我</h4>
        <div className="grid grid-cols-2 gap-2">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="no-drag flex items-center gap-2 rounded border border-[#e8ebef]
                         px-3 py-2 text-[12.5px] text-[#24292f] no-underline
                         transition-colors hover:border-[#2b579a] hover:bg-[#f7fafd]"
            >
              <span className="text-[15px] leading-none">{l.icon}</span>
              <span className="flex-1 truncate">{l.label}</span>
              <span className="text-[10.5px] text-[#98a1ae]">{l.note} ↗</span>
            </a>
          ))}
        </div>
      </section>

      {/* ── 技术栈 ── */}
      <section className="border-t border-[#eceff2] pt-4">
        <h4 className="mb-2 text-[12px] font-semibold text-[#16202c]">技术栈</h4>
        <div className="flex flex-wrap gap-1.5">
          {["Astro", "React", "TypeScript", "Tailwind CSS", "Zustand", "react-rnd", "marked"].map(
            (t) => (
              <span key={t} className="md-chip">
                {t}
              </span>
            )
          )}
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-[#8a94a3]">
          静态页由 Astro 在构建期渲染，窗口系统是唯一的 React 岛屿。
          两边的正文排版共用同一个 <code className="rounded bg-[#eef2f7] px-1">.md-body</code> 类，
          所以不会出现"站内两处正文长得不一样"。
        </p>
      </section>
    </div>
  );
}
