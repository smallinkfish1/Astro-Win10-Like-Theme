import type { APIRoute } from "astro";
import { getPosts, getTags, getCategories } from "../lib/posts";

/**
 * 站点地图。
 *
 * 告诉搜索引擎「这个站有哪些页面」。对静态站来说这是免费的加分项：
 * 一次构建产出，永久有效。
 *
 * ⚠️ 草稿不进 sitemap（虽然 /posts/[slug] 对它可访问），
 *    否则等于主动请爬虫去收录草稿。
 */
const site = "https://example.com";

/** ISO 日期 → W3C datetime（sitemap 要求的格式，只要日期部分） */
const day = (iso: string) => iso.slice(0, 10);

export const GET: APIRoute = async () => {
  const posts = await getPosts(false);
  const tags = await getTags();
  const categories = await getCategories();

  const urls: { loc: string; lastmod?: string; priority: string }[] = [
    { loc: "/", priority: "1.0" },
    { loc: "/posts", priority: "0.9" },
    { loc: "/archive", priority: "0.7" },
    { loc: "/tags", priority: "0.6" },
    { loc: "/about", priority: "0.6" },
    ...posts.map((p) => ({
      loc: `/posts/${p.slug}`,
      lastmod: day(p.updatedDate ?? p.pubDate),
      priority: "0.8",
    })),
    ...tags.map((t) => ({ loc: `/tags/${encodeURIComponent(t.name)}`, priority: "0.4" })),
    ...categories.map((c) => ({
      loc: `/category/${encodeURIComponent(c.name)}`,
      priority: "0.4",
    })),
  ];

  const body = urls
    .map(
      (u) => `  <url>
    <loc>${site}${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""}
    <priority>${u.priority}</priority>
  </url>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;

  return new Response(xml, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
};
