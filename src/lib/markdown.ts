import { marked } from "marked";
import type { Post } from "./posts";

/**
 * Markdown 渲染器（运行在浏览器里）。
 *
 * 为什么窗口内要「再渲染一遍」而不是直接塞构建好的 HTML？
 *   因为 Astro 渲染出的正文 HTML 不会进 props —— 那会让每个页面的
 *   序列化数据膨胀好几倍。传 Markdown 原文（几 KB）+ 客户端渲染，
 *   流量小得多，而且渲染结果符合预期。
 *
 * ⚠️ 这样就有了两条渲染路径。防止样式漂移的办法是：
 *    两边产出的 HTML 都套上同一个 CSS 类 .md-body（定义在 global.css）。
 *    规则只写一次，视觉天然一致。
 */

// marked 的默认配置足以应付博客；这里只调两个地方
marked.setOptions({
  gfm: true, // 表格、删除线、任务列表
  breaks: false, // 单个换行不当作 <br>，符合标准 Markdown 语义
});

/** Markdown 原文 → HTML 字符串 */
export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

/**
 * Markdown → 纯文本。给搜索索引和摘要用。
 *
 * 关键是「去掉标记但保留内容」：
 *   `**粗体**` → 粗体
 *   ```code``` → 整块丢弃（代码里的标识符不该被全文搜到）
 */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ────────────────────────────────────────────────────────────
   下面是「Astro → React 岛」的数据桥梁
   ──────────────────────────────────────────────────────────── */

/** 岛屿实际需要的最小字段集。少传一个字段就少一份序列化开销 */
export interface ClientPost {
  slug: string;
  title: string;
  description: string;
  pubDate: string;
  category: string;
  tags: string[];
  body: string;
  accent?: string;
}

/**
 * 把 Post 压成岛屿需要的形状。
 *
 * ⚠️ 这里是【白名单式挑选】：只列出来的字段才会传过去。
 *
 *    这一点很关键，因为 Post 里有个 `entry` 字段（原始集合条目），
 *    它是构建期的对象，里面带着 filePath、加密的 digest、函数……
 *    整个塞进 props 会让 Astro 序列化出一坨巨大的、含不可序列化内容的 JSON，
 *    轻则页面体积暴涨，重则直接报错。
 *
 *    写成白名单而不是"排除 entry"，是为了以后 Post 加字段时
 *    默认不会被传到客户端 —— 白名单只会漏传（看得见），
 *    黑名单只会多传（看不见，体积悄悄变大）。
 */
export function toClientPost(p: Post): ClientPost {
  return {
    slug: p.slug,
    title: p.title,
    description: p.description,
    pubDate: p.pubDate,
    category: p.category,
    tags: p.tags,
    body: p.body,
    accent: p.accent,
  };
}

/** 批量转换，顺手按日期倒序 */
export function toClientPosts(posts: Post[]): ClientPost[] {
  return posts.map(toClientPost);
}

/**
 * 日期格式化。中英文都不依赖 Intl 的 locale 数据（那是运行时依赖，
 * 在构建产物里不可控），直接用字符串拼。
 */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 相对时间：刚刚 / 3 分钟前 / 2 天前 / 直接显示日期 */
export function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  return formatDate(iso);
}

/** 估算阅读时长：中文约 400 字/分钟，英文约 200 词/分钟 */
export function readingTime(body: string): string {
  const cn = (body.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const en = (body.match(/[a-zA-Z]+/g) ?? []).length;
  const minutes = Math.max(1, Math.round(cn / 400 + en / 200));
  return `${minutes} 分钟`;
}
