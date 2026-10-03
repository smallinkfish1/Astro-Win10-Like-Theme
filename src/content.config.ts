import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * 博客内容集合。
 *
 * 这是 Astro 给我们的一层「带类型检查的本地数据库」：
 *   - 文件放在 src/content/blog/ 下的 .md
 *   - 顶部 frontmatter 必须通过下面这套 Zod 校验，写错字段名/类型会在
 *     astro check 时直接报错，而不是等到页面上出现一个 undefined。
 *
 * 为什么不用「手动 fs.readdir + 解析 frontmatter」？
 *   那样也能跑，但你拿不到类型提示，也没有构建期校验。
 *   内容一多，拼错一个 tags 就能让整站标签页空白，还很难查。
 *
 * ⚠️ 关于 z 的来源：
 *    Astro 7 里从 "astro:content" 导出的 z 带一条 deprecated 提示，
 *    它内部转发的其实是 zod/v4。
 *
 *    我试过直接写 import { z } from "zod/v4"，但会报
 *    "Cannot find module 'zod/v4'" —— 因为 zod 不是项目的直接依赖，
 *    它只存在于 Astro 自己的依赖树里，源码里引不到。
 *
 *    两个选择：
 *      A. 继续用 astro:content 转发的 z（会有提示，但功能完全正常）
 *      B. 自己 pnpm add zod，然后引 zod/v4
 *
 *    我选 A。理由是：这样用的 z 版本**必然**和 Astro 内部一致；
 *    自己装一份 zod 反而可能和 Astro 用的版本错开，
 *    在 schema 行为上出现难以排查的细微差别。
 *    提示归提示，正确性优先。
 */
const blog = defineCollection({
  /**
   * glob loader 负责把目录下所有 md 变成「条目」。
   * pattern 支持嵌套目录，所以 src/content/blog/tech/xxx.md 也会被收进来。
   */
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),

  schema: ({ image }) =>
    z.object({
      /** 标题，必填 */
      title: z.string(),

      /** 摘要：列表页、搜索结果、SEO description 都用它 */
      description: z.string().default(""),

      /** 发布日期。z.coerce.date() 会把 "2026-10-03" 这种字符串转成 Date */
      pubDate: z.coerce.date(),

      /** 更新日期，可选。排序时优先用 pubDate，展示时可以提示"已更新" */
      updatedDate: z.coerce.date().optional(),

      /** 分类：一篇文章只属于一个分类，用于开始菜单的分类磁贴 */
      category: z.string().default("未分类"),

      /** 标签：一对多，同样进开始菜单 */
      tags: z.array(z.string()).default([]),

      /**
       * 草稿标记。
       * true 的文章不会出现在 /posts、分类页、标签页、归档页，
       * 只有 /drafts（对应桌面上的"回收站"图标）能看到。
       */
      draft: z.boolean().default(false),

      /** 可选：文章主色，用于卡片左侧色条和磁贴配色 */
      accent: z.string().optional(),

      /**
       * 可选：封面图。
       * image() 会把图片当成构建期资源处理，自动优化尺寸并生成带 hash 的 URL。
       * 这里保留成可选，不强制每篇都配图。
       */
      cover: image().optional(),
    }),
});

export const collections = { blog };
