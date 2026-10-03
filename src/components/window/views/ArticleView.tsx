import { useMemo } from "react";
import { renderMarkdown, formatDate, readingTime, type ClientPost } from "../../../lib/markdown";

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
 */
export default function ArticleView({ article }: { article: ClientPost }) {
  // body 可能几千字，渲染一次就够了，别每次重渲染都跑一遍 marked
  const html = useMemo(() => renderMarkdown(article.body), [article.body]);

  return (
    <article className="px-1 pb-6">
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
  );
}
