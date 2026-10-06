import { getCollection, render, type CollectionEntry } from "astro:content";
import { stripLatex } from "./markdown";

/**
 * 文章数据层 —— 本站所有「文章列表 / 分类 / 标签 / 归档」的唯一真相来源。
 *
 * ⚠️ 这个文件只能在 Astro 侧（构建期）调用。
 *    因为 getCollection 依赖 Astro 的编译期机制，React 岛里 import 它会直接报错。
 *
 *    React 岛拿数据的正确姿势有两种，本项目两种都用：
 *      A. 页面把函数结果序列化后，作为 props 传给岛屿
 *         （见 index.astro 里的 <WindowManager posts={...} />）
 *      B. 岛屿自己去 fetch 一个静态 JSON 端点
 *         （见 src/pages/search-index.json.ts）
 */

export interface PostMeta {
  /** URL 片段，来自文件名。如 why-win10.md → "why-win10" */
  slug: string;
  title: string;
  description: string;
  /** ISO 字符串，序列化友好（Date 对象没法直接塞进 props） */
  pubDate: string;
  updatedDate?: string;
  category: string;
  tags: string[];
  draft: boolean;
  accent?: string;
  /** 正文纯文本摘要，用于列表页和搜索结果 */
  excerpt: string;
}

export interface Post extends PostMeta {
  /**
   * Markdown 原文。静态页由 Astro 渲染，窗口内由 marked 渲染。
   */
  body: string;
  /**
   * ⚠️ 原始集合条目，必须留着。
   *
   * 原因是 Astro 7 的渲染 API 长这样：
   *     import { render } from "astro:content";
   *     const { Content } = await render(entry);
   *
   * 它要的是**原始 entry 对象**，不是我们拍平后的普通对象。
   * 所以这个字段是「静态页渲染」的唯一入口，丢了它 /posts/[slug] 就渲染不出正文。
   *
   * 不过它只在构建期有效 —— 序列化给 React 岛时必须丢掉
   * （见 lib/markdown.ts 里的 toClientPost，那里是白名单式挑选字段的）。
   */
  entry: CollectionEntry<"blog">;
}

/** Astro 的 entry → 我们自己的扁平结构 */
function toMeta(entry: CollectionEntry<"blog">): PostMeta {
  const d = entry.data;
  return {
    slug: entry.id,
    title: d.title,
    description: d.description,
    pubDate: d.pubDate.toISOString(),
    updatedDate: d.updatedDate?.toISOString(),
    category: d.category,
    tags: d.tags,
    draft: d.draft,
    accent: d.accent,
    excerpt: makeExcerpt(d.description, entry.body ?? ""),
  };
}

/**
 * 摘要：优先用 frontmatter 的 description，没有就从正文前 80 字抠。
 *
 * ⚠️ 注意这里和 lib/markdown.ts 的 stripMarkdown 是【两份】相似的逻辑，
 *    原因是一个跑在构建期（这里，随 getCollection 一起），
 *    一个跑在浏览器里（那边，给窗口内用）。
 *    两边都要处理 LaTeX —— 漏了任意一处，那处的摘要就会出现 $E=mc^2$ 这种原始符号。
 */
function makeExcerpt(description: string, body: string): string {
  if (description) return description;
  const plain = stripLatex(body) // ⚠️ 必须最先做，否则 _ 和 * 会被下面的规则当成斜体标记吃掉
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*`_\[\]()!-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.slice(0, 80) + (plain.length > 80 ? "…" : "");
}

/**
 * 取全部文章。
 *
 * @param includeDrafts false（默认）= 排除草稿，用于所有公开页面
 *                      true         = 包含草稿，只给 /drafts「回收站」用
 *
 * 按 pubDate 倒序，最新的在最前。
 */
export async function getPosts(includeDrafts = false): Promise<Post[]> {
  const entries = await getCollection(
    "blog",
    includeDrafts ? undefined : ({ data }) => data.draft !== true
  );

  return entries
    .map((e) => ({ ...toMeta(e), body: e.body ?? "", entry: e }))
    .sort((a, b) => (a.pubDate < b.pubDate ? 1 : -1));
}

/**
 * 取全部草稿（frontmatter 里 draft: true 的文章）。
 *
 * ⚠️ 草稿【不单独放一个目录】，就和正式文章住在一起，
 *    靠 frontmatter 的 draft 字段区分。所以这个函数本质上
 *    就是 getPosts(true) 再筛一遍。
 *
 *    为什么还要单独包一个函数，而不是让调用方自己写？
 *    因为「哪些算草稿」是一条业务规则，不是一次查询。
 *    现在它等于 `p.draft === true`，但以后可能要加条件
 *    （比如「超过 90 天的草稿自动归档」）。
 *    规则散在各个页面里，改一次要翻遍全站；
 *    收在这里，改一处就够。
 *
 * ⚠️ draft 字段在 schema 里是 z.boolean().default(false)，
 *    所以【没写 draft 的文章拿到的是 false】——
 *    调用方不需要判 undefined。
 */
export async function getDrafts(): Promise<Post[]> {
  const all = await getPosts(true);
  return all.filter((p) => p.draft);
}

/**
 * 渲染一篇文章的正文（Astro 侧）。
 *
 * 单独包一层而不是在页面里直接调 render()，是为了让「渲染」这件事
 * 和数据层待在同一个文件里 —— 以后换渲染器（比如换成 shiki 高亮）
 * 只要改这里，不用去翻所有页面。
 */
export async function renderPost(post: Post) {
  return render(post.entry);
}

/** 按 slug 取单篇。找不到返回 undefined，调用方自己决定 404 */
export async function getPost(slug: string): Promise<Post | undefined> {
  // 单篇详情页要能打开草稿（方便自己预览），所以这里不排除草稿
  const all = await getPosts(true);
  return all.find((p) => p.slug === slug);
}

/** 分类聚合，按文章数倒序 */
export async function getCategories(): Promise<{ name: string; count: number }[]> {
  const posts = await getPosts(false);
  const map = new Map<string, number>();
  for (const p of posts) {
    map.set(p.category, (map.get(p.category) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh"));
}

/** 标签聚合，按文章数倒序 */
export async function getTags(): Promise<{ name: string; count: number }[]> {
  const posts = await getPosts(false);
  const map = new Map<string, number>();
  for (const p of posts) {
    for (const t of p.tags) {
      map.set(t, (map.get(t) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh"));
}

/** 按分类取文章 */
export async function getPostsByCategory(category: string): Promise<Post[]> {
  const posts = await getPosts(false);
  return posts.filter((p) => p.category === category);
}

/**
 * 取文章分类的第一层（顶层分类）。
 *
 * ⚠️ 为什么需要「第一层」这个概念？
 *
 *    因为 category 支持斜杠表达层级（"前端/Astro"）。
 *    开始菜单的磁贴、标签页里的分类列表，都不应该显示
 *    "前端/Astro" 这种带斜杠的字符串 —— 那是路径，不是分类名。
 *
 *    正确的做法是：磁贴显示顶层「前端」，
 *    点进去看到「Astro」子分类 + 直接挂在「前端」下的文章。
 *
 *    所以这里返回的是拆分后的第一段，并把同一顶层的文章数合并。
 *
 *      category: 前端           → 顶层「前端」+1
 *      category: 前端/Astro     → 顶层「前端」+1
 *      category: 前端/Markdown  → 顶层「前端」+1
 *      ────────────────────────
 *      结果：{ name: "前端", count: 3 }
 */
export async function getTopCategories(): Promise<{ name: string; count: number }[]> {
  const posts = await getPosts(false);
  const map = new Map<string, number>();

  for (const p of posts) {
    const top = (p.category ?? "").split("/")[0].trim() || "未分类";
    map.set(top, (map.get(top) ?? 0) + 1);
  }

  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh"));
}

/**
 * 按分类路径取文章（支持层级）。
 *
 * ⚠️ 两种匹配模式，看 prefix 参数：
 *
 *    prefix = false（默认）严格匹配
 *      getPostsByCategoryPath("前端/Astro")
 *        → 只返回 category 恰好是 "前端/Astro" 的文章
 *
 *    prefix = true 前缀匹配
 *      getPostsByCategoryPath("前端", true)
 *        → 返回 "前端"、"前端/Astro"、"前端/Markdown" 下的【全部】文章
 *
 *    为什么两种都要？
 *    因为分类页有两种访问方式：
 *      点顶层「前端」磁贴   → 想看到这个大类下的所有文章（prefix）
 *      点面包屑「前端/Astro」→ 只想看这个精确分类（严格）
 *    只支持一种的话，总有一个入口的结果不符合直觉。
 */
export async function getPostsByCategoryPath(
  path: string,
  prefix = false,
): Promise<Post[]> {
  const posts = await getPosts(false);
  const target = path.trim();

  if (prefix) {
    // 「前端」应该匹配 "前端" 和 "前端/Astro"，
    // 但【不应该】匹配到 "前端进阶" —— 所以比的是 "前缀 + /" 和 "全等"
    return posts.filter(
      (p) => p.category === target || p.category.startsWith(`${target}/`),
    );
  }

  return posts.filter((p) => p.category === target);
}

/** 按标签取文章 */
export async function getPostsByTag(tag: string): Promise<Post[]> {
  const posts = await getPosts(false);
  return posts.filter((p) => p.tags.includes(tag));
}

/** 归档：按「年 → 月 → 文章」三层分组，用于 /archive「此电脑」 */
export async function getArchive(): Promise<
  { year: number; months: { month: number; posts: Post[] }[] }[]
> {
  const posts = await getPosts(false);
  const byYear = new Map<number, Map<number, Post[]>>();

  for (const p of posts) {
    const d = new Date(p.pubDate);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    if (!byYear.has(y)) byYear.set(y, new Map());
    const months = byYear.get(y)!;
    if (!months.has(m)) months.set(m, []);
    months.get(m)!.push(p);
  }

  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => ({
      year,
      months: [...months.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([month, posts]) => ({ month, posts })),
    }));
}

/** 统计信息，给「此电脑」窗口和关于页用 */
export async function getStats() {
  const posts = await getPosts(false);
  const categories = await getCategories();
  const tags = await getTags();

  const words = posts.reduce((sum, p) => {
    // ⚠️ 先去掉 LaTeX 公式再统计。
    //    否则 \int_{-\infty}^{\infty} e^{-x^2} dx 会被当成十几个"英文单词"，
    //    一篇公式多的文章，字数会被严重高估。
    const text = stripLatex(p.body);
    // 中文按字数算，英文按词算，粗略但不失真
    const cn = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
    const en = (text.match(/[a-zA-Z]+/g) ?? []).length;
    return sum + cn + en;
  }, 0);

  return {
    postCount: posts.length,
    categoryCount: categories.length,
    tagCount: tags.length,
    /** 约多少字 */
    wordCount: words,
    latest: posts[0]?.pubDate ?? null,
  };
}
