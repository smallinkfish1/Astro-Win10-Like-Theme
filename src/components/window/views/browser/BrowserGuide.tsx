import { useState, useMemo, useEffect } from "react";
import { renderMarkdown } from "../../../../lib/markdown";
import type { Guide } from "../../../../lib/guide";

/**
 * 浏览器 → 「使用教程」标签页
 * ================================================================
 *
 * 教程内容用 .md 当源文件，在这里渲染成 HTML。
 *
 * ── 数据从哪来 ──
 *
 *   src/content/guide/*.md
 *      ↓ 构建期由 src/lib/guide.ts 读出来（用 fs）
 *      ↓ 序列化成 props 传给窗口
 *      ↓ 这里用 renderMarkdown() 渲染
 *
 * ── 为什么不用 Astro 直接把 md 编译成 HTML 传过来？ ──
 *
 *   因为这属于「运行时渲染」，和文章阅读器（ArticleView）走的是同一条路：
 *   详情见那篇文章里的说明。简单说，窗口内容都是客户端渲染的，
 *   构建期把 HTML 字符串塞进 props 也行，但那样就无法复用
 *   ArticleView 那套已经调好的排版样式了。
 *
 *   复用 renderMarkdown() 的好处是：代码高亮、KaTeX 公式、
 *   表格样式全都自动就有 —— 和读文章看到的是同一套。
 *
 * ⚠️ renderMarkdown 返回的是【HTML 字符串】，要配合
 *    dangerouslySetInnerHTML 使用。这在这里是安全的：
 *    内容是构建期从我们自己仓库的 .md 读出来的，
 *    不是用户输入 —— 没有注入风险。
 *    但如果以后教程允许访客投稿，这里就必须上 sanitize。
 */

/** 左侧目录里的一行 */
function GuideItem({
  g,
  active,
  onClick,
}: {
  g: Guide;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`no-drag w-full rounded px-2.5 py-2 text-left transition-colors ${
        active
          ? "bg-[var(--accent)] text-white"
          : "text-[var(--fg-dim)] hover:bg-[var(--hover)]"
      }`}
    >
      <span className="block text-[12.5px] leading-snug">{g.title}</span>
    </button>
  );
}

export default function BrowserGuide({ guides }: { guides: Guide[] }) {
  const [slug, setSlug] = useState<string | null>(guides[0]?.slug ?? null);

  const active = useMemo(
    () => guides.find((g) => g.slug === slug) ?? guides[0],
    [guides, slug],
  );

  /**
   * 渲染成 HTML。
   *
   * ⚠️ 做成 useMemo 而不是每次渲染都调 ——
   *    renderMarkdown 内部要跑 marked + KaTeX，
   *    KaTeX 尤其慢（它要解析公式、生成一堆嵌套 span）。
   *    不缓存的话，用户每点一下（哪怕点的是不相关的东西）
   *    都要把整篇教程重渲染一遍，切换时会明显卡顿。
   *
   * ⚠️ 依赖是 active?.body，不是 active ——
   *    切到另一篇时 body 变了才重算。如果依赖整个 active 对象，
   *    guides 数组每次渲染都是新引用的话会白白重算。
   */
  const html = useMemo(() => (active ? renderMarkdown(active.body) : ""), [active]);

  /**
   * 切换教程时把内容区滚回顶部。
   *
   * ⚠️ 不做这件事的后果：你在第一篇里滚到很下面，
   *    点第二篇 —— 内容换了，但滚动位置还在原来的高度，
   *    看起来就像"点了个空的"或者"内容只剩一半"。
   *
   *    依赖是 slug：只有真的换了篇才滚，同一篇里重新渲染不打扰。
   */
  useEffect(() => {
    document.querySelector("[data-guide-body]")?.scrollTo({ top: 0 });
  }, [slug]);

  if (guides.length === 0) {
    return (
      <div className="grid h-full place-items-center text-center text-[12px] text-[var(--fg-faint)]">
        <div>
          <div className="mb-2 text-[28px] leading-none opacity-40">📖</div>
          还没有教程
          <div className="mt-1 text-[11px]">
            在 <code>src/content/guide/</code> 下新建 .md 就会出现在这里
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 gap-3">
      {/* ── 左侧目录 ── */}
      <nav className="w-[150px] shrink-0 overflow-y-auto border-r border-[var(--surface-border)] pr-2">
        <div className="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--fg-faint)]">
          目录
        </div>
        <div className="flex flex-col gap-0.5">
          {guides.map((g) => (
            <GuideItem key={g.slug} g={g} active={g.slug === active?.slug} onClick={() => setSlug(g.slug)} />
          ))}
        </div>
      </nav>

      {/* ── 右侧正文 ── */}
      <div data-guide-body className="min-w-0 flex-1 overflow-y-auto pr-1">
        {active && (
          <>
            {active.desc && (
              <p className="mb-3 border-l-2 border-[var(--accent)] pl-2.5 text-[11.5px] leading-relaxed text-[var(--fg-dim)]">
                {active.desc}
              </p>
            )}

            {/*
              ⚠️ 这个类名必须保留 —— 它是 .md 渲染出来的 HTML 的【全部版式来源】。
                 里面定义了 h2/h3、p、ul、table、code、pre 的间距和配色。
                 删掉它，渲染出来的就是一堆没有排版的裸标签。

              ⚠️ 用的是 .md-body，和文章阅读器 ArticleView 是【同一个类】。
                 所以教程里的代码块、表格、公式，长得和读文章时一模一样 ——
                 不用为教程再维护一套排版。这是有意的复用。
            */}
            <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />
          </>
        )}
      </div>
    </div>
  );
}
