import type { APIRoute } from "astro";
import { getPosts } from "../lib/posts";

/**
 * RSS 订阅源。
 *
 * 为什么静态站也要 RSS？
 *   它是唯一一个「不依赖平台算法、不依赖客户端 JS」的分发渠道。
 *   订阅者永远能拿到全文入口，哪怕你的站改版十次。
 *
 * ⚠️ 草稿绝不进 RSS —— 订阅者不该看到你没写完的东西。
 *    getPosts(false) 已经排除了草稿。
 */
const site = "https://example.com";
const title = "我的桌面";
const description = "一个 Windows 10 风格的个人博客";

/** XML 转义：& < > " ' 五个字符必须处理，否则源会解析失败 */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const GET: APIRoute = async () => {
  const posts = await getPosts(false);

  const items = posts
    .map(
      (p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${site}/posts/${p.slug}</link>
      <guid isPermaLink="true">${site}/posts/${p.slug}</guid>
      <pubDate>${new Date(p.pubDate).toUTCString()}</pubDate>
      <description>${esc(p.description || p.excerpt)}</description>
      <category>${esc(p.category)}</category>
${p.tags.map((t) => `      <category>${esc(t)}</category>`).join("\n")}
    </item>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(title)}</title>
    <link>${site}</link>
    <description>${esc(description)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${site}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
};
