/**
 * 「使用教程」的数据源
 * ================================================================
 *
 * 教程内容是「用 .md 当源文件，渲染成 HTML」——
 * 所以这里负责把 src/content/guide/*.md 读出来，交给 React 侧渲染。
 *
 * ── 为什么不注册成 Astro content collection？ ──
 *
 *   因为教程【不需要独立静态路由】。
 *
 *   教程是「浏览器窗口里的一个标签页」，属于功能性 UI，
 *   不是站点内容 —— 它不该出现在 /posts、RSS、sitemap 里，
 *   也不该被搜索引擎单独收录。
 *
 *   如果用 defineCollection + getCollection，Astro 会倾向于
 *   给每条内容配一个路由（这也是我们给 blog 配路由的方式），
 *   于是多出一批 /guide/xxx 的页面，全是 SEO 噪音。
 *
 *   直接读文件反而更准确：这些 .md 是【数据】，不是【页面】。
 *
 * ── 为什么用 import.meta.glob 而不是 node:fs？ ──
 *
 *   ⚠️⚠️ 这是个踩过的坑，说明一下。
 *
 *   一开始我用的是 fs.readdirSync + fs.readFileSync。逻辑没问题，
 *   但 `astro check` 直接报了两条错：
 *
 *       Cannot find name 'node:fs'. Do you need to install type
 *       definitions for node?
 *
 *   因为本项目的 typescript 依赖里【没有 @types/node】——
 *   Astro 自己的类型定义不包含 node 内置模块的声明。
 *
 *   两条路：
 *     A. 装 @types/node  →  多一个 devDependency
 *     B. 用 import.meta.glob  →  零依赖，而且更符合 Astro 的习惯
 *
 *   我选 B。理由：
 *     1. 这个库被设计出来就是为了"在构建期读一堆文件"，
 *        Astro 官方推荐这么用，不需要任何额外配置
 *     2. fs 是同步 IO，构建期虽然能用，但 glob 版本是
 *        由构建工具静态分析出来的 —— 它知道有哪些文件，
 *        甚至可以做到文件变化时增量重编译
 *     3. 少一个依赖就少一份供应链风险，本项目一直避免无谓依赖
 *
 *   ⚠️ eager: true 是必须的。
 *      不加的话 glob 返回的是一堆 () => import(...) 的惰性函数，
 *      拿不到内容。我们要的就是"构建期一次性全部读进来"。
 */

/** 教程的一篇 */
export interface Guide {
  /** URL 片段，来自文件名去掉序号前缀。如 01-write-a-post.md → "write-a-post" */
  slug: string;
  /** 标题，取自 frontmatter 的 title，没有就用正文的第一个 # */
  title: string;
  /** 一句话说明，取自 frontmatter 的 description，没有就用标题 */
  desc: string;
  /** Markdown 正文（已剥掉 frontmatter） */
  body: string;
}

/**
 * 内部结构：比 Guide 多一个 order 字段。
 *
 * ⚠️ 为什么不在 Guide 上直接写 `order?: number`？
 *
 *   因为 optional 字段意味着「调用方要自己判断有没有」。
 *   但真相是：getGuides() 返回的每一篇【必然】排过序，
 *   而客户端【永远不需要】order。
 *   把"不需要存在的东西"定义成"可能存在的东西"，
 *   只是把一个确定的谎言换成一个模糊的谎言。
 *
 *   拆成两个类型之后，类型系统就替我们守住了一条边界：
 *     内部排序阶段   → 用 SortedGuide，order 必填
 *     出口 / 客户端  → 用 Guide，压根没有这个字段
 *   谁也没法在出口之后误用 order —— 因为它不存在。
 */
interface SortedGuide extends Guide {
  /** 排序用：文件名开头的数字，没有数字的排到最后 */
  order: number;
}

export interface GuidesData {
  guides: Guide[];
}

/**
 * 把所有教程 .md 作为【原始字符串】读进来。
 *
 * ⚠️ 两个查询参数的组合是要点：
 *      ?raw     → 拿到文件原文（不加的话 Astro 会尝试把它编译成模块）
 *      eager    → 立即求值，而不是返回惰性 import 函数
 *
 * ⚠️ 路径必须是【字面量】，不能用变量拼。
 *    import.meta.glob 的参数是在构建期被静态分析的 ——
 *    写 `import.meta.glob(dir + "/*.md")` 它看不懂，结果是空对象。
 *    （这也正是它比 fs 快的原因：它在打包阶段就知道要收哪些文件。）
 */
const MODULES = import.meta.glob("../content/guide/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/**
 * 极简 frontmatter 解析。
 *
 * ⚠️ 为什么不用 gray-matter 之类的库？
 *   因为这里只需要 3 个字段（title / description / order），
 *   而且教程 frontmatter 是我们自己写的、格式完全可控 ——
 *   引一个依赖进来，收益不抵它带来的供应链面积。
 *
 *   ⚠️ 但要注意：这个解析器【很脆弱】，只认下面这种扁平写法：
 *
 *        ---
 *        title: 标题
 *        description: 说明
 *        ---
 *
 *      不支持数组、多行值、嵌套结构。教程的 frontmatter 里
 *      不要写复杂结构 —— 真要写就把内容放进正文。
 */
function parseFrontmatter(text: string): { data: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };

  const data: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    // 去掉一层包裹的引号（"xxx" 或 'xxx'）
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) data[key] = val;
  }

  return { data, body: text.slice(m[0].length) };
}

/** 从正文里抠第一个一级标题，作为标题兜底 */
function firstHeading(body: string): string {
  const m = /^#\s+(.+)$/m.exec(body);
  return m ? m[1].trim() : "";
}

/** 从 glob 的 key（形如 "../content/guide/01-write-a-post.md"）里取文件名 */
function basenameOf(modulePath: string): string {
  const seg = modulePath.split("/");
  return seg[seg.length - 1];
}

/**
 * 取全部教程。
 *
 * ⚠️ 排序规则：按文件名开头的数字（01- / 02- …）。
 *
 *    为什么不按 glob 返回的顺序？
 *    因为对象属性的遍历顺序虽然有规范（整数键优先、其余按插入序），
 *    但它是构建工具的实现细节 —— 换个打包版本就可能变。
 *    这会导致「本地开发时教程顺序是对的，部署到服务器就乱了」
 *    这种极难排查的问题。
 *
 *    显式用文件名里的数字排序，结果就完全确定了。
 *
 * ⚠️ 这是个【同步】函数，和 getPosts() 的 async 不一样。
 *    因为 import.meta.glob 在构建期就已经把内容读完了，
 *    这里只是做内存里的字符串处理。保持同步反而更诚实 ——
 *    让调用方知道"它不会等 IO"。
 *
 *    ⚠️ 所以【不要写 await getGuides()】。
 *       await 一个非 Promise 值语法上合法，但会被 astro check
 *       报 ts(80007) "'await' has no effect on the type of this expression"。
 *       那个警告就是在提醒你：这里没有异步，await 是多余的。
 */
export function getGuides(): GuidesData {
  const files = Object.keys(MODULES);

  const guides: SortedGuide[] = files.map((modulePath) => {
    const file = basenameOf(modulePath);
    const text = MODULES[modulePath] ?? "";
    const { data, body } = parseFrontmatter(text);

    /*
      slug：去掉扩展名和开头的数字序号。
        "01-write-a-post.md" → "write-a-post"

      ⚠️ 序号只在【文件名】里用来排序，不该出现在 slug 里 ——
         否则以后想调整顺序就得改文件名，而改了文件名
         slug 就变了，任何引用了教程 slug 的地方都会断。
    */
    const slug = file.replace(/\.md$/, "").replace(/^\d+[-_]/, "");

    // 取开头的数字当排序权重，没有数字的排到最后
    const numMatch = /^(\d+)/.exec(file);
    const order = numMatch ? parseInt(numMatch[1], 10) : Number.MAX_SAFE_INTEGER;

    const heading = firstHeading(body);

    return {
      slug,
      title: data.title || heading || slug,
      desc: data.description || heading || "",
      body,
      order,
    };
  });

  guides.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));

  /*
    出口处把 order 摘掉（见上面 SortedGuide 的注释）。

    ⚠️ 这里 return 的类型是 GuidesData，字段类型是 Guide[] ——
       SortedGuide[] 能赋给它（多一个字段不算错），
       但反过来，如果哪天有人手滑写成 `SotredGuide[]`，
       类型检查会在这一刻拦住。
  */
  return { guides: guides.map(({ order: _order, ...g }) => g) };
}

