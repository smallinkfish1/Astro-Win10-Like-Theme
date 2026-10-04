import { useEffect, useMemo, useRef, useState } from "react";
import {
  renderMarkdown,
  extractToc,
  formatDate,
  readingTime,
  type ClientPost,
} from "../../../lib/markdown";
import Toc from "./Toc";

/**
 * 窗口内的文章阅读器。
 *
 * 这是「路径 B」——运行时用 marked 渲染 Markdown。
 *
 * ⚠️ dangerouslySetInnerHTML 里的 "dangerously" 不是装饰。
 *    如果 html 里含 <script> 或 onerror= 这类内容，会被真的执行（XSS）。
 *
 *    本项目这么用是安全的，因为：
 *      - 输入是仓库里我自己写的 .md 文件
 *      - 没有任何用户提交内容
 *      - 构建产物完全可控
 *
 *    但如果将来站里开始接受评论 / 富文本，就必须先净化：
 *      import DOMPurify from "dompurify";
 *      const safe = DOMPurify.sanitize(renderMarkdown(userInput));
 *
 *    判断标准很朴素：这个字符串的来源是谁。
 *    来源可控 → 可以用；来源是用户 → 必须先净化。
 *
 * 渲染出来的 HTML 套的是 .md-body —— 和静态文章页同一个类，
 * 所以两边的排版规则完全一致，不会出现「站内两处正文长得不一样」。
 *
 * ── 关于右侧目录（TOC）──
 *
 *   目录项从 Markdown 原文里扫出来（extractToc），
 *   而标题的 id 由 markdown.ts 里的 heading renderer 生成。
 *   两者的 id 规则必须一致 —— 对不上就是"点了没反应"，
 *   而且不报错，属于最难查的那类 bug。
 *
 *   ⚠️ 窗口很窄时不显示目录（见下面的 useIsNarrow）。
 *      300px 宽的窗口里再切出 180px 给目录，正文只剩 120px，
 *      一行放不下三个字 —— 那还不如没有目录。
 */
export default function ArticleView({ article }: { article: ClientPost }) {
  /**
   * ⚠️ body 可能几千字，渲染一次就够了，别每次重渲染都跑一遍 marked。
   *
   *   这里用 useMemo 做缓存，但【缓存键是 article.body】——
   *   即"同一篇文章无论重渲染多少次，都只解析一次"。
   *
   *   注意：窗口缩放【不会】导致这里重算。
   *   真正卡的是浏览器给渲染结果做布局（2.4 万个节点），
   *   那是 CSS 层面的事，靠 global.css 里的 content-visibility 解决。
   */
  const html = useMemo(() => renderMarkdown(article.body), [article.body]);

  /** 目录项：从原文扫出来，纯字符串操作，1ms 级别 */
  const toc = useMemo(() => extractToc(article.body), [article.body]);

  /**
   * ⚠️ 两个 ref 分工不同，别合并：
   *
   *   outerRef   → 挂在外层 flex 行上，用来量【整个视图有多宽】（判断要不要显示目录）
   *   articleRef → 挂在 <article> 上，是【真正的滚动容器】，
   *                交给 Toc 去算"哪个标题正在读"、以及点击后滚到哪里
   *
   *   为什么不能都用 articleRef？
   *     article 现在自己有 overflow-y-auto，它的宽度【不含】目录那一栏。
   *     拿它去判断"窗口够不够宽"会循环依赖：
   *     目录一出现，article 变窄，于是判定"不够宽"，目录又消失 —— 反复横跳。
   *     量外层就没这个问题（外层的宽度只由窗口决定）。
   */
  const outerRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);

  /**
   * 窄窗口时隐藏目录。
   *
   * ⚠️ 用容器宽度而不是 window.innerWidth！
   *    因为窗口是可以在桌面里自由缩放的 —— 浏览器视口 1400px 时，
   *    用户完全可能把一个窗口拖到 420px 宽。
   *    这时候按 innerWidth 判断就会得出"屏幕很宽，显示目录"的错误结论。
   *    正确的信号是【这个组件自己有多宽】。
   */
  const [hasRoom, setHasRoom] = useState(false);
  useEffect(() => {
    const el = outerRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      // 没有 ResizeObserver 的环境（很老的浏览器）：默认显示目录
      setHasRoom(true);
      return;
    }
    const ro = new ResizeObserver(([entry]) => {
      // 断点 620px：正文至少要有 ~420px，读起来才不憋屈
      setHasRoom(entry.contentRect.width >= 620);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * 目录默认展开还是收起。
   * 首次进入自动判断，之后由用户点击决定 —— 不覆盖用户的选择。
   */
  const [tocOpen, setTocOpen] = useState(true);

  return (
    <div ref={outerRef} className="flex h-full min-h-0 gap-4">
      {/*
        ── 主栏：文章本体，也是【真正的滚动容器】 ──

        ⚠️⚠️ 这里踩过一个大坑，动之前务必看完。

          最初的写法是：
            <div class="flex h-full">                    ← 普通容器
              <article class="flex-1 overflow-visible">  ← 不滚
              <aside class="sticky top-0 ...">           ← 吸顶
            </div>
          滚动交给外面的 .win-body（overflow-auto）。

          问题：点目录跳转时，smooth 滚动【永远只滚到 253px 就停】，
               而不是目标位置（实测目标 1734px）。

          为什么？因为 aside 是 position: sticky，它就在滚动内容【里面】。
          smooth 动画一开始，sticky 元素要被重新定位；
          浏览器判定"内容在动画过程中发生了变化"，就把动画打断了。
          instant 跳转没这个问题（实测 1734 一次到位），
          所以这个坑只在 smooth 下暴露 —— 现象是"点了轻轻动一下就没反应"。

          修法：把「滚动」和「吸顶」这两件事彻底分开 ——
            article 自己 overflow-y-auto，当唯一滚动容器；
            aside  不滚（它只是同行的一个兄弟节点，天然就不动）。
          这样滚动内容里不再有 sticky 元素，smooth 动画不会被干扰。

        ⚠️ 副作用（是好事）：TOC 的 scrollRef 现在指向 article 本身，
           语义上更准确 —— "正文的滚动容器"就是 article。
      */}
      <article
        ref={articleRef}
        className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pb-6"
      >
        {/* ── 头部：标题 + 元信息 ── */}
        <header className="mb-5">
          <h1 className="mb-3 text-[23px] font-semibold leading-snug text-[#10151c]">
            {article.title}
          </h1>

        <div className="md-meta">
          <span>📅 {formatDate(article.pubDate)}</span>
          <span>·</span>
          <span>⏱ {readingTime(article.body)}</span>
          <span>·</span>

          {/*
            分类和标签是可点的链接，但点击行为要区分：
              - 普通点击：在当前桌面里开一个分类窗口（体验连续）
              - Ctrl / Cmd + 点击：真的跳转到静态页（方便分享 URL）
            这样既保留了「桌面」的沉浸感，又不挡住正常网页习惯。
          */}
          <a
            className="md-chip no-drag"
            href={`/category/${encodeURIComponent(article.category)}`}
            title="按住 Ctrl 点击可在新标签打开静态页"
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey) return; // 放行默认跳转
              e.preventDefault();
              window.dispatchEvent(
                new CustomEvent("os:open-window", {
                  detail: {
                    id: `category:${article.category}`,
                    title: `分类：${article.category}`,
                    icon: "🏷️",
                    path: `/category/${encodeURIComponent(article.category)}`,
                  },
                })
              );
            }}
          >
            📂 {article.category}
          </a>

          {article.tags.map((t) => (
            <a
              key={t}
              className="md-chip no-drag"
              href={`/tags/${encodeURIComponent(t)}`}
              title="按住 Ctrl 点击可在新标签打开静态页"
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey) return;
                e.preventDefault();
                window.dispatchEvent(
                  new CustomEvent("os:open-window", {
                    detail: {
                      id: `tag:${t}`,
                      title: `标签：${t}`,
                      icon: "🏷️",
                      path: `/tags/${encodeURIComponent(t)}`,
                    },
                  })
                );
              }}
            >
              #{t}
            </a>
          ))}
        </div>
      </header>

      {/* ── 正文：和静态页共用 .md-body 排版 ── */}
      <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />

      {/* ── 底部提示 ── */}
      <footer className="mt-10 border-t border-[#eceff2] pt-4 text-[12px] text-[#8a94a3]">
        <p>
          这篇文章也有独立静态页：
          <a
            className="no-drag ml-1 text-[#2b579a] hover:underline"
            href={`/posts/${article.slug}`}
            target="_blank"
            rel="noreferrer"
          >
            /posts/{article.slug}
          </a>
        </p>
      </footer>
      </article>

      {/*
        ── 侧栏：目录 ──

        ⚠️⚠️ 这一栏【刻意不写 sticky】，这不是漏了。

           直觉上目录应该吸顶（sticky top-0），但那样会让整篇文章
           滚动失效：sticky 元素在滚动内容【内部】时，
           smooth 滚动动画会被浏览器打断（详见上面 article 的注释）。

           现在的布局是「flex 行 + 两个独立列」：
             article → 自己滚
             aside   → 不滚，跟着 flex 行固定在容器右侧

           效果和 sticky 想要的完全一样（目录始终在视口里），
           但没有任何滚动被劫持的风险。

        ⚠️ 三个条件同时满足才显示：
          1. 有目录项（toc.length > 0）—— 短文章本来就没标题，空面板没意义
          2. 窗口够宽（hasRoom）—— 否则挤扁正文
          3. 用户没有主动收起（tocOpen）

        ⚠️ 为什么这一栏要自己内部滚动（overflow-y-auto）？
           小节特别多的文章（比如 40 个标题）目录会很长，
           如果它跟着容器撑高就会把整体布局顶破。
           给它一个 max-h + 内部滚动，长目录也能自己滚。
      */}
      {toc.length > 0 && hasRoom && (
        <aside
          className="hidden max-h-full w-[180px] shrink-0 overflow-y-auto
                     border-l border-[#eceff2] pl-3 pr-1 md:block"
        >
          <button
            type="button"
            onClick={() => setTocOpen((v) => !v)}
            className="no-drag mb-2 flex w-full items-center gap-1 text-[11px] font-semibold
                       text-[#8a94a3] transition-colors hover:text-[#2b579a]"
            title={tocOpen ? "收起目录" : "展开目录"}
          >
            <span className="text-[9px]">{tocOpen ? "▼" : "▶"}</span>
            <span>目录</span>
            <span className="ml-auto text-[10px] font-normal text-[#b6bfca]">{toc.length}</span>
          </button>

          {tocOpen && <Toc items={toc} scrollRef={articleRef} />}
        </aside>
      )}
    </div>
  );
}
