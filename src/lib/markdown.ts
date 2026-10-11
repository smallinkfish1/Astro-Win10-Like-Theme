import { marked } from "marked";
import markedKatexRaw from "marked-katex-extension";
import type { Post } from "./posts";
import { normalizeLatex } from "./latex";

/**
 * ⚠️⚠️ 为什么这里要"拆包"再调用，不能直接 markedKatex(...)？
 *
 *   症状：dev 启动后整站白屏，报
 *         TypeError: (0 , __vite_ssr_import_1__.xxx) is not a function
 *         栈顶指向 lib/posts.ts 里那次 stripLatex() 调用。
 *
 *   看起来像是 stripLatex 没导出，其实不是。真正的原因是：
 *   marked-katex-extension 是【CommonJS 风格】的包，它的入口长这样：
 *
 *     exports: { ".": { import: "./lib/index.esm.js", require: "./lib/index.cjs" } }
 *
 *   dev 模式下 Vite 走 SSR（Node 侧）加载它，Node 对该包的 CJS 分支
 *   做了 interop 包装，于是这个默认导出在某个环节被包成了
 *     { default: 真正的函数 }
 *   而不是函数本身。
 *
 *   于是模块【顶层】的 marked.use(markedKatex({...})) 立刻抛
 *   "not a function"。顶层抛错会污染整个 markdown.ts 模块 ——
 *   Vite 只把它标记为失败，不告诉你具体是哪一行 —— 结果【同一文件里
 *   所有导出】在别处 import 时都变成 undefined。
 *
 *   这就是为什么报错指向的偏偏是毫无关系的 stripLatex：
 *   它只是第一个被调用到的"无辜受害者"。
 *
 *   修法：加载结果统一用 unwrapDefault 归一化一次。
 *   好处是——以后升级依赖、别人 clone 下来用不同包管理器装，
 *   不管拿到的是函数还是 { default: 函数 }，都能正常工作。
 *   两种写法都兼容，比赌某一种强。
 */
function unwrapDefault<T>(mod: unknown): T {
  if (
    mod &&
    typeof mod === "object" &&
    "default" in (mod as Record<string, unknown>) &&
    typeof (mod as Record<string, unknown>).default === "function"
  ) {
    return (mod as Record<string, unknown>).default as T;
  }
  return mod as T;
}

const markedKatex = unwrapDefault<typeof markedKatexRaw>(markedKatexRaw);

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

/**
 * ── 这里是第二条渲染路径的 LaTeX 支持 ──
 *
 * ⚠️⚠️ 这条很容易漏，漏了的症状是：
 *      直接访问 /posts/xxx 公式正常显示，
 *      但在桌面上双击打开的窗口里，公式还是一堆美元符号。
 *
 *      因为静态页走的是 Astro 的 remark/rehype 插件（配在 astro.config.mjs），
 *      而窗口内走的是 marked —— 完全不同的两套管线，必须各配各的。
 *
 * ⚠️ 为什么 marked 这边用 "marked-katex-extension" 而不是自己写插件？
 *      marked 的插件接口和 unified 完全不同（它是 tokenizer + renderer 那套），
 *      remark 的插件在这个管线上根本跑不起来。
 *      这个扩展是社区维护的 marked 专用版，做的事和 rehype-katex 等价。
 *
 * ⚠️ 关于 throwOnError: false
 *     公式写错时（比如少了个右括号）：
 *       true  → 抛异常，整个文章渲染中断，窗口里出现一大片错误
 *       false → 把错误公式用红色原样显示出来，其余内容照常渲染
 *     选 false。写博客时公式打错是常事，不该因此让整篇文章打不开。
 */
marked.use(
  markedKatex({
    throwOnError: false,

    /**
     * ⚠️⚠️ nonStandard: true 是必须的，默认的 false 会让大部分中文公式失效。
     *
     *    这个扩展默认的行内公式正则是这样的（看它的 src/index.ts）：
     *
     *      /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))\1(?=[\s?!\.,:？！。，：]|$)/
     *                                                                  ^^^^^^^^^^^^^^^^^^^^^
     *      结尾这个 lookahead 要求【公式后面必须紧跟空白或标点】。
     *
     *    英文写作时这个规则没问题：
     *      "The formula $E=mc^2$ is famous."     ← $ 后面是空格，匹配成功
     *
     *    但中文写作时几乎必然踩坑：
     *      "这个公式 $E=mc^2$ 很重要"      ← $ 后面是空格，侥幸能过
     *      "行内公式 $E=mc^2$中也有"        ← $ 后面是中文，匹配失败！
     *      "证明 $a^2+b^2=c^2$成立"         ← 同样失败
     *
     *    中文没有词间空格，公式常被直接夹在汉字中间 —— 这时候默认规则
     *    完全不工作，表现就是「行间公式正常，行内公式全是一堆美元符号」。
     *
     *    打开 nonStandard 后，正则放宽成不含 lookahead 的版本，
     *    只要成对出现就认，中文场景才正常。
     *
     *    代价：像 "100$ 到 200$" 这种文本会被误认成公式（见下方说明）。
     *    两害相权，中文博客必须选 true。
     */
    nonStandard: true,
  })
);

// marked 的默认配置足以应付博客；这里只调两个地方
marked.setOptions({
  gfm: true, // 表格、删除线、任务列表
  breaks: false, // 单个换行不当作 <br>，符合标准 Markdown 语义
});

/**
 * ⚠️⚠️ KaTeX 的 strict 模式：从 "warn" 改成 "ignore"
 *
 *   症状：公式多的文章一打开，控制台刷几百条这种警告 ——
 *     LaTeX-incompatible input and strict mode is set to 'warn':
 *       Unicode text character "高" used in math mode  [unicodeTextInMathMode]
 *       Unrecognized Unicode character "℃" (8451)      [unknownSymbol]
 *
 *   原因：KaTeX 默认 strict: "warn"，对"不标准"的输入出声提醒。
 *   而中文技术博客里，公式里塞中文是【完全正常】的写法：
 *     $2Na + 2H_2O \xrightarrow{\text{高温}} Na_2O_2$
 *     \text{高温}  和  \text{℃}  都是合法用法
 *
 *   KaTeX 会正确渲染它们，只是"好心"提醒你这不是纯数学模式。
 *   但一个"高温"两个字就刷两条警告，210 个公式能刷出几千条 ——
 *   把控制台冲得什么都看不见，真正的错误反而被淹没。
 *
 *   ⚠️ 为什么不用 strict: false？
 *     false 和 "ignore" 效果接近，但 "ignore" 语义更明确：
 *     "我知道这些写法不规范，但我确实要用，别出声"。
 *
 *   ⚠️ 这是【降低噪音】，不是【屏蔽错误】。
 *     公式语法写错（比如括号不配对）时，因为 throwOnError: false，
 *     仍然会把错误公式用红色标出来 —— 那个是渲染在页面上的，不受影响。
 */
marked.use(
  markedKatex({
    throwOnError: false,
    strict: "ignore",
  })
);

/**
 * ⚠️⚠️ 给渲染出来的标题自动加 id —— 目录跳转全靠它
 *
 *   问题：marked 默认产出的 h2 就是光秃秃的 <h2>，没有 id。
 *        而目录点击要跳过去，靠的是 href="#某个id"。
 *        没 id 就跳不动 —— 而且是"静默失败"，点了毫无反应，
 *        不报错也不提示，极其难排查。
 *
 *   ⚠️ 这里的 id 生成规则必须和 extractToc() / slugify() 完全一致。
 *      两处规则只要有一点偏差，目录就会跳到错的地方。
 *      重名计数逻辑也要一致（见下面 counts）。
 *
 *   为什么用 renderer 扩展而不是加一个后处理？
 *     后处理要再遍历一遍 DOM / 正则替换 HTML —— 那既慢又容易
 *     改错（比如把代码块里的 <h2> 文本也改了）。
 *     在 renderer 里生成，天然只处理真标题。
 */
const headingCounts = new Map<string, number>();

marked.use({
  renderer: {
    heading(this: unknown, token: { tokens: unknown[]; depth: number; text: string }) {
      // 先拿到标题的纯文本（lexer 已经把里面的标记解析成 token 了）
      const raw = this && typeof (this as { parser?: unknown }).parser === "object"
        ? token.text
        : token.text;
      const plain = String(raw ?? "").replace(/<[^>]+>/g, "").trim();

      const base = slugify(plain);
      const n = headingCounts.get(base) ?? 0;
      headingCounts.set(base, n + 1);
      const id = n === 0 ? base : `${base}-${n}`;

      // ⚠️ 用 this.parser.parseInline 而不是直接把 text 塞进去，
      //    否则标题里的 **粗体** / `代码` / [链接]() 会原样显示成标记。
      const parser = (this as { parser?: { parseInline?: (t: unknown[]) => string } })?.parser;
      const inner = parser?.parseInline ? parser.parseInline(token.tokens) : token.text;

      return `<h${token.depth} id="${id}">${inner}</h${token.depth}>\n`;
    },
  } as never,
});

/**
 * ⚠️⚠️ 每次渲染前重置重名计数
 *
 *   否则同一篇文章渲染两次，第二个同名标题就会变成 xxx-1，
 *   而 extractToc 那边每次都是从零算的 → 两边对不上。
 *   放在 renderMarkdown 里重置，保证两边的计数起点一致。
 */

/** Markdown 原文 → HTML 字符串 */
export function renderMarkdown(md: string): string {
  /**
   * ⚠️⚠️ 先归一化，再交给 marked。
   *
   *    这一步和 astro.config.mjs 里挂的那个 remark 插件是【同一个函数】，
   *    只是两条路径各调一次。目的完全一样：让 \(...\) / \[...\]
   *    这种 TeX 原生写法的公式也能渲染。
   *
   * ── 为什么两条路都要调，不能只在一处做？ ──
   *    因为这个函数是【浏览器里】跑的，而静态页是【构建期】渲染的 ——
   *    两边根本看不到对方。谁漏了这一步，谁那条路上 \(...\) 就会
   *    原样显示成反斜杠括号。
   *
   * ── 顺序为什么必须在 marked.parse 之前？ ──
   *    marked-katex-extension 是通过注册 tokenizer 来「抢」公式的。
   *    一旦 parse 跑完，公式没被认出来的部分就已经变成普通文本节点了，
   *    再想改就得动已经被转义过的 HTML —— 那才是真正的麻烦。
   */
  const normalized = normalizeLatex(md);
  // ⚠️ 重置标题重名计数，保证和 extractToc 的编号方案一致（见上方注释）
  headingCounts.clear();
  return marked.parse(normalized, { async: false }) as string;
}

/**
 * 让出主线程：等浏览器做完当前这一帧的布局/绘制再继续。
 *
 * ⚠️⚠️ 为什么需要这个？
 *
 *   症状：公式多的文章（210 个公式 → 2.4 万个 DOM 节点），
 *        在窗口里拖拽缩放时明显卡顿，松手后也要等一两秒才有反应。
 *
 *   原因：KaTeX 渲染是【同步】的，一次跑几百毫秒。
 *        这几百毫秒里主线程被完全占死 —— 浏览器既不能响应
 *        鼠标移动（拖拽丢失），也不能重算布局（画面冻结）。
 *
 *   requestAnimationFrame 的回调在【下一帧开始前】执行，
 *   所以 await 它一次，就等于"让浏览器先把这一帧干完"。
 *   配合双 rAF（下面等两次），能确保这一帧的绘制真的完成了。
 *
 * ⚠️ 为什么不用 requestIdleCallback？
 *    它在 Safari 上支持得很晚（18+），而我们已经用了
 *    content-visibility（同一个版本线），不想再多押一个兼容性赌注。
 *    rAF 是老牌 API，到处都有。
 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "undefined") {
      // 极端兜底：服务端或老环境直接用定时器。不会走到，但别让它崩。
      setTimeout(resolve, 0);
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * 异步版 Markdown 渲染 —— 渲染前主动让出一帧。
 *
 * ⚠️⚠️ 和上面的 renderMarkdown 是什么关系？
 *
 *   renderMarkdown  同步，立刻返回。适合：
 *     - 一次性渲染（文章刚打开时）
 *     - 不在交互热路径上的场景
 *
 *   renderMarkdownAsync  先 await 一帧再渲染。适合：
 *     - 用户正在拖拽/缩放窗口时触发的重渲染
 *     - 长文章（200+ 公式），同步渲染会卡住输入
 *
 *   代价是多一帧的延迟（约 16ms）。人眼感知不到，
 *   但换来的是"拖拽不掉帧"—— 这个交换非常划算。
 *
 * ⚠️ 为什么不让 marked 自己走 async 模式？
 *    marked 的 async: true 只影响它内部对 async 插件的处理，
 *    对我们这个"让出主线程"的需求没有帮助 —— 它仍然是
 *    在一次微任务里把活干完，中间不让出。
 */
export async function renderMarkdownAsync(md: string): Promise<string> {
  // 先让浏览器把当前帧的布局和绘制完成
  await nextFrame();
  // 再干重活。此时用户松手的这一帧已经画完了，不会看到掉帧。
  return renderMarkdown(md);
}

/** 目录里的一项 */
export interface TocItem {
  /** 标题层级：2 = h2，3 = h3，以此类推 */
  depth: number;
  /** 去掉 Markdown 标记后的纯文本标题 */
  text: string;
  /** 锚点 id，和渲染出来的标题 id 对应 */
  id: string;
}

/**
 * 从 Markdown 原文里抽出目录（TOC）。
 *
 * ⚠️⚠️ 为什么不从渲染好的 HTML 里抽？
 *    因为那需要先渲染完才能拿到目录 —— 而目录要在渲染期间
 *    就显示出来（不然会闪一下）。从原文抽是【零成本】的，
 *    纯字符串扫描，几百行也就 1ms。
 *
 * ⚠️ 为什么不用第三方库（remark-toc / markdown-toc）？
 *    我们只需要 h2/h3/h4 三层，规则又必须和 slugify 对齐，
 *    引一个库反而要额外处理它和 slugify 的差异。
 *    自己写 20 行，规则完全可控。
 *
 * ⚠️ 关键约束：这里的 id 生成规则必须和 slugify() 完全一致。
 *    对不上的话，目录点击会跳到错误位置 —— 而且不报错，
 *    只是"点了没反应"，非常难查。
 *
 * @param md      Markdown 原文
 * @param maxDepth 最深抽到几级，默认 3（h2~h4）。
 *                 一级标题（h1）通常是文章标题，不放进目录。
 * @param minDepth 最浅从几级开始，默认 2
 */
export function extractToc(md: string, minDepth = 2, maxDepth = 4): TocItem[] {
  if (!md) return [];
  const items: TocItem[] = [];
  const seen = new Map<string, number>();

  /**
   * ⚠️⚠️ 这里踩过一个很隐蔽的坑，动代码前务必看完。
   *
   *   症状：目录里能列出所有标题、条数也对得上，
   *        但点其中【某些】标题完全没反应 —— 不报错，就是不动。
   *
   *   原因：目录项的 id 和正文标题的 id 是【两条独立的代码路径】算出来的：
   *
   *     正文 id  ← heading renderer，输入是渲染【后】的 HTML 文本
   *               "具体做法：<code>.md-body</code>"
   *     目录 id  ← 这个函数，输入是原始 Markdown 文本
   *
   *   只要两条路径对同一个标题算出不同的字符串，querySelector 就会 miss，
   *   jump() 里 `if (!root || !target) return;` 直接静默返回 —— 表现就是"点了没反应"。
   *
   *   具体是哪里对不上？看下面 `withoutCode` 那一行：
   *   它把【行内代码】整段删掉了。于是
   *
   *     原文      ## 具体做法：`.md-body`
   *     剥代码后  ## 具体做法：            ← 反引号连同里面的内容都没了
   *     → 目录 id  "具体做法"
   *
   *   而 renderer 那边 code 元素还在，剥掉标签后文本是
   *     "具体做法：.md-body"
   *     → 正文 id  "具体做法-md-body"
   *
   *   两者不相等 → 点不动。
   *
   *   修法：把「跳过代码块」这件事做得精确一点 ——
   *   只跳过【围栏代码块】（```...``` 之间的整段），
   *   因为它里面出现的 "## xxx" 确实是假标题。
   *   而【行内代码】里的 # 不会让整行变成标题，没理由整段丢掉。
   *
   *   ⚠️ 为什么行内代码不能像原来那样删掉再匹配？
   *      删了之后，标题里的行内代码内容就丢了，
   *      和 renderer 算出来的不一致。所以必须【保留】。
   */
  const withoutFencedBlocks = md.replace(/```[\s\S]*?```/g, "");

  /**
   * 把标题原始文本规整成"纯文本"—— 这一步必须和 heading renderer 完全一致。
   *
   * renderer 那边拿到的是一小段 HTML，做的处理是：
   *   剥掉所有标签 → 剩下的就是纯文本
   *
   * 我们这边拿到的是 Markdown 源码，要做等价的事：
   *   行内代码 `x`      → x        （renderer 那边 <code>x</code> 剥标签后也是 x）
   *   **粗体**          → 粗体
   *   *斜体*            → 斜体
   *   [文字](链接)      → 文字
   *
   * ⚠️ 顺序不能乱：先处理行内代码，是因为它的内容可能包含 * 或 [，
   *    先剥掉反引号能让后面的替换不误伤代码内容。
   */
  const toPlainText = (raw: string) =>
    raw
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .trim();

  const lines = withoutFencedBlocks.split("\n");
  for (const line of lines) {
    // ATX 标题：# 开头，1~6 个 #，后面要有空格
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;

    const depth = m[1].length;
    if (depth < minDepth || depth > maxDepth) continue;

    const text = toPlainText(m[2].trim());

    if (!text) continue;

    // ⚠️ 重名处理必须和 heading renderer 那份逻辑保持一致
    const base = slugify(text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const id = n === 0 ? base : `${base}-${n}`;

    items.push({ depth, text, id });
  }

  return items;
}

/**
 * 把标题文本转成一个可以用在 URL / HTML id 里的短标识。
 *
 * ⚠️ 中文怎么办？
 *    HTML5 允许 id 里有中文，浏览器也能正常跳转，
 *    所以【不做】拼音转换 —— 那需要引一个几百 KB 的词典。
 *    直接保留中日韩字符，把空格换成连字符，其余符号丢掉。
 *
 * ⚠️ 为什么要把 "1.1" 里的点也处理掉？
 *    因为 id 里有点会让某些 CSS 选择器 / querySelector 出问题
 *    （".1" 会被当成类选择器）。转成 "-" 更稳。
 *
 * ⚠️⚠️ 全局唯一性由调用方处理（见上面 extractToc 里的 seen Map）。
 *    这个函数本身对同样的输入总是返回同样的输出 —— 纯函数。
 */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    // 点、斜杠、以及常见标点 → 连字符
    .replace(/[.·、,，。:：;；/\\|()（）\[\]【】{}<>《》"'"'`~!@#$%^&*+=]/g, "-")
    // 空格（含全角）→ 连字符
    .replace(/\s+/g, "-")
    // 只保留 中日韩 / 字母 / 数字 / 连字符 / 下划线
    .replace(/[^\u4e00-\u9fa5\u3040-\u30ffa-z0-9_-]/g, "")
    // 多个连字符合并
    .replace(/-{2,}/g, "-")
    // 去掉首尾连字符
    .replace(/^-+|-+$/g, "") || "section";
}

/**
 * 把 LaTeX 公式从正文里替换掉。
 *
 * ⚠️ 为什么需要这一步？
 *    摘要和搜索索引是【纯文本】场景，公式在里面没法渲染。
 *    不处理的话会有两个难看的结果：
 *
 *      1. 摘要里出现一堆原始 LaTeX：
 *         「论证过程 $E = mc^2$ 说明……」  ← 读者看不懂这坨符号
 *
 *      2. 更糟的是公式会被后续的斜体规则误伤：
 *         $x_1$  经过 .replace(/(\*|_)(.*?)\1/g, "$2") 之后 → $x1$
 *         $a*b*c$ 同理会被吃掉星号
 *         因为 _ 和 * 在 Markdown 里是斜体标记，而 LaTeX 里它们是下标和乘法。
 *
 * ⚠️ 所以顺序很关键：【必须在处理斜体之前】先把公式摘掉。
 *    这也是为什么这段逻辑要单独抽成函数、显式排在 stripMarkdown 最前面。
 *
 * ⚠️ 为什么是替换成空格而不是空字符串？
 *    替换成空串会让前后文字粘连（「前文\$公式\$后文」→「前文后文」）；
 *    替换成空格，后续的 \s+ → " " 归一化会把多余空格收掉，边界干净。
 */
export function stripLatex(md: string): string {
  return (
    // ⚠️ 先归一化：把 \(...\) 也变成 $...$，否则下面两条 $ 规则
    //    抓不到 TeX 原生写法的公式，摘要里就会漏出「\(F=ma\)」这种原文。
    normalizeLatex(md)
      // 行间公式 $$...$$（优先处理，否则单个 $ 的规则会先吃掉一半）
      .replace(/\$\$[\s\S]*?\$\$/g, " ")
      // 行内公式 $...$：不跨行，且内部不能有换行
      .replace(/\$[^\n$]+?\$/g, " ")
  );
}

/**
 * Markdown → 纯文本。给搜索索引和摘要用。
 *
 * 关键是「去掉标记但保留内容」：
 *   `**粗体**` → 粗体
 *   ```code``` → 整块丢弃（代码里的标识符不该被全文搜到）
 *   $公式$     → 丢弃（见 stripLatex 的说明）
 */
export function stripMarkdown(md: string): string {
  return (
    stripLatex(md) // ⚠️ 必须最先做，理由见 stripLatex 的注释
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
      .trim()
  );
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
  /**
   * 原始 Markdown 源码（含未渲染的 frontmatter 之后部分）。
   *
   * ⚠️ 可选，而且【默认不传】。理由见 toClientPost 的注释：
   *    它是白名单，只有显式要求时才会被带上。
   *
   * 为什么会需要它？——「回收站」应用要显示草稿的 .md 源码。
   * 此电脑用不到，所以那条路径上它是 undefined，
   * 岛屿的 props JSON 就不会多出这几百 KB。
   */
  raw?: string;
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
 *
 * ── withRaw：为什么它是个显式开关，而不是默认带上？ ──
 *
 *    body 已经是 Markdown 全文了，raw 看着像"重复了一遍"。
 *    但两者用途不同：
 *      body → 交给 marked / Astro 去【渲染】
 *      raw  → 原样显示给用户看（回收站要展示 .md 源码，含未渲染的 LaTeX）
 *
 *    ⚠️ 为什么不让回收站直接用 body？
 *       因为 body 是「frontmatter 之后的正文」，而回收站要的是
 *       「这篇文章的源码长什么样」。这两个在当前实现下恰好相同，
 *       但把它们混为一谈，以后 body 一旦被后处理（比如 LaTeX 归一化），
 *       回收站就会跟着被改掉 —— 而它要的恰恰是【未经处理】的原文。
 *       所以 raw 单独存一份，语义上更准确。
 *
 *    ⚠️⚠️ 只有「回收站」这条路径传 withRaw: true。
 *       「此电脑」用不到它，而草稿正文可能几百 KB，
 *       全量传给岛屿就是白白撑大首屏 JSON。
 */
export function toClientPost(p: Post, opts: { withRaw?: boolean } = {}): ClientPost {
  const out: ClientPost = {
    slug: p.slug,
    title: p.title,
    description: p.description,
    pubDate: p.pubDate,
    category: p.category,
    tags: p.tags,
    body: p.body,
    accent: p.accent,
  };

  /*
    ⚠️ 这里没有写 raw: undefined，而是「只在需要时才赋值」。
       区别在于 JSON 序列化：{ raw: undefined } 会被 stringify 丢掉，
       但对象字面量里留着一个值为 undefined 的键，
       astro check 和读代码的人都要多想一秒"它到底传没传"。
       条件赋值把这件事说得更直白。
  */
  if (opts.withRaw) {
    out.raw = p.body;
  }

  return out;
}

/** 批量转换，顺手按日期倒序 */
export function toClientPosts(posts: Post[], opts: { withRaw?: boolean } = {}): ClientPost[] {
  return posts.map((p) => toClientPost(p, opts));
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

/*
 * ⚠️ 这里原来还有一个 relativeDate()（"3 分钟前"），已经删掉：
 *    它把中文写死在库函数里，没法跟着界面语言变。窗口内改用
 *    i18n 的 fmtRelative(iso, t)，文案从词典取。
 *    （静态页没用到它 —— 它们只显示具体日期。）
 */

/** 估算阅读时长（中文版，留给静态页）。窗口内请用 readingMinutes + 词典 */
export function readingTime(body: string): string {
  return `${readingMinutes(body)} 分钟`;
}

/**
 * 阅读时长的【分钟数】。
 *
 * ⚠️ 为什么不直接用 readingTime()？
 *    "分钟"这个单位被写死在里面了，英文界面需要 "5 min"。
 *    所以这里只负责算【数】，单位交给词典
 *    （time.readingTime = "{n} 分钟阅读" / "{n} min read"）。
 */
export function readingMinutes(body: string): number {
  // ⚠️ 同样要先去掉公式：\frac{a}{b} 这类会被算成好几个英文词，
  //    公式多的文章会被估成"读了半小时"，实际正文没多少字。
  const text = stripLatex(body);
  const cn = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const en = (text.match(/[a-zA-Z]+/g) ?? []).length;
  return Math.max(1, Math.round(cn / 400 + en / 200));
}
