/**
 * LaTeX 语法归一化 —— 让两种公式写法都能用。
 * ================================================================
 *
 * ⚠️⚠️ 为什么这个文件是 .mjs 而不是 .ts？
 *
 *    因为同一段逻辑要同时被【两个不同的加载器】使用：
 *
 *      使用者 A：astro.config.mjs 里的 remark 插件
 *                → 走 Node 原生 ESM 加载器，【不经过 TS 转译】
 *                → 引用 .ts 会直接报 "Unknown file extension .ts"
 *
 *      使用者 B：src/lib/markdown.ts（浏览器里那条路径）
 *                → 走 Vite，.ts / .mjs 都能吃
 *
 *    结论：写在 .mjs 里，两边都能引用。
 *    反过来（写在 .ts 里）会让 A 直接挂掉。
 *    src/lib/latex.ts 只是给它套了一层类型声明，方便 TS 侧调用。
 *
 * ── 这个文件解决什么问题 ──
 *
 * Markdown 里的数学公式没有统一标准，实际存在两套主流写法：
 *
 *   写法 A（TeX 原生）        \( 行内 \)  和  \[ 行间 \]
 *   写法 B（Pandoc / 数学软件）  $ 行内 $  和  $$ 行间 $$
 *
 * 这两套的来历不一样：
 *   - \( \) 和 \[ \] 是 TeX 自己的分隔符，LaTeX 文档里就这么写
 *   - $ $ 是 TeX 在【数学排版模式】下的简写，被 Markdown 生态广泛借用
 *
 * 我们的渲染管线（remark-math + rehype-katex + marked-katex-extension）
 * 只认 B。于是从 Hexo、Jupyter、LaTeX 编辑器、MathJax 站点搬来的文章，
 * 用 A 写的公式会原样显示成「\( F = ma \)」这种反斜杠括号。
 *
 * ── 为什么不在渲染前统一转一遍？ ──
 *    因为这样可以「两套写法都支持」，用户不用记住我们支持哪个。
 *    转换是纯文本替换，零风险。
 *
 * ⚠️ 为什么不干脆关掉单美元公式（singleDollarTextMath: false）？
 *    那样确实能避开「100$ 到 200$」被误判，但代价是大家都习惯的
 *    $...$ 也不能用了 —— 对中文技术博客来说得不偿失。
 *    归一化是更好的折中：保留 $...$，同时把 \(...\) 也接进来。
 */

/**
 * 把 Markdown 里的 \(...\) 和 \[...\] 统一成 $...$ 和 $$...$$。
 *
 * @param {string} md 原始 Markdown 文本
 * @returns {string} 归一化后的文本
 *
 * ⚠️ 关键点：必须先保护代码块和行内代码。
 *    否则一个讲正则的文章，代码里写着 `\(` 就会被当成公式开始 ——
 *    后面的所有内容都被吞进公式里，整篇文章的渲染全乱。
 */
export function normalizeLatex(md) {
  if (typeof md !== "string") return md;

  /* ── 第一步：把代码块和行内代码挖出来，用占位符替换 ── */
  const stash = [];
  // \u0000 是空字符，正常 Markdown 文本里不会出现，用它做占位符最安全
  // （用 "___CODE_0___" 这种可读占位符反而可能和正文撞车）
  const placeholder = (i) => `\u0000${i}\u0000`;

  let text = md.replace(
    // 围栏代码块  ```...```   或者行内代码 `...`
    /```[\s\S]*?```|`[^`\n]+`/g,
    (match) => {
      stash.push(match);
      return placeholder(stash.length - 1);
    }
  );

  /* ── 第二步：转换公式分隔符 ── */
  // 行间：\[ ... \]  →  $$\n...\n$$
  // 必须放在行内规则之前，否则 \[ 会被 \( 的规则先匹配掉一半
  text = text.replace(
    /\\\[([\s\S]+?)\\\]/g,
    (_, formula) => `$$\n${formula.trim()}\n$$`
  );

  // 行内：\( ... \)  →  $...$
  // 用 [\s\S]+? 而不是 [^)]+ ：公式里出现 ) 是常事（比如 \frac{a}{(b+c)}）
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_, formula) => `$${formula.trim()}$`);

  /* ── 第三步：把代码还原回去 ── */
  text = text.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)] ?? "");

  return text;
}
