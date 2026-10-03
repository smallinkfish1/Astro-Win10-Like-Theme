import type { APIRoute } from "astro";
import { getPosts } from "../lib/posts";
import { stripMarkdown } from "../lib/markdown";

/**
 * 搜索索引端点。
 *
 * 构建完会产出 dist/search-index.json —— 一个纯静态文件。
 * 搜索窗口在用户聚焦输入框时才 fetch 它（见 SearchView）。
 *
 * 为什么不在构建期把索引内联进页面？
 *   因为绝大多数访客不会用搜索。内联会让首屏 HTML 白白大几十 KB。
 *   按需 fetch 才是对的。
 *
 * ⚠️ 索引的 body 必须去掉 Markdown 标记。
 *    否则用户搜 "astro" 时，`**Astro**` 里的星号会干扰匹配；
 *    搜代码里的标识符时，代码块内容也会污染结果。
 */
export const GET: APIRoute = async () => {
  const posts = await getPosts(false); // 草稿不进索引

  const docs = posts.map((p) => ({
    slug: p.slug,
    title: p.title,
    description: p.description,
    category: p.category,
    tags: p.tags,
    /** 纯文本正文，用于全文匹配 */
    body: stripMarkdown(p.body),
  }));

  return new Response(JSON.stringify(docs), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      // 静态资源可以放心长缓存：内容变了文件名不变，但有 CDN 失效兜底
      "cache-control": "public, max-age=3600",
    },
  });
};
