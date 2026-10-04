// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// ── LaTeX 数学公式 ──
// remark-math 负责「认出」公式（把 $...$ / $$...$$ 解析成语法树节点），
// rehype-katex 负责「渲染」公式（把节点转成 KaTeX 生成的 HTML + CSS 类名）。
// 两个必须配对使用：少任何一个都不会有输出。
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// 我们自己的归一化插件：把 \(...\) / \[...\] 转成 $...$ / $$...$$。
// ⚠️ 必须排在 remarkMath 前面，理由见该文件顶部注释。
import remarkNormalizeLatex from './src/lib/remark-normalize-latex.mjs';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],

  /**
   * Markdown 渲染配置。
   *
   * ⚠️ 为什么必须显式写 theme？
   *
   *   不写的话 Astro 会用 Shiki 的默认主题（目前是 github-dark），
   *   并在构建期把背景色写进 <pre> 的【内联 style】：
   *       <pre class="astro-code github-dark" style="background-color:#24292e">
   *
   *   而窗口内那条渲染路径用的是 marked，产出的 <pre> 是裸标签，
   *   走 global.css 里 .md-body pre 的规则。
   *
   *   两条路的代码块背景色来源不同 → 视觉漂移。
   *   显式写死主题，这个值就有了唯一的、可追溯的定义处，
   *   以后升级 Astro 换了默认主题，这里也不会跟着变。
   *
   *   配套地，global.css 里 .md-body pre 的背景色也设成了同一个值，
   *   两处必须保持一致 —— 改这里记得改那里。
   */
  markdown: {
    /**
     * LaTeX 公式支持。
     *
     * ⚠️⚠️ 这两行只解决【静态文章页】的公式。
     *      窗口内那条渲染路径走的是 marked（见 src/lib/markdown.ts），
     *      完全不经过这里 —— 那边需要单独处理，两边都改才算真的修好。
     *      只改这里的话，会出现「/posts/xxx 里公式正常，
     *      但桌面上双击打开的窗口里还是一堆美元符号」这种割裂现象。
     *
     * ⚠️ remarkPlugins 数组是【从左往右】执行的，顺序不能乱：
     *      1. remarkNormalizeLatex —— 先把 \(...\) 变成 $...$（不认识就没法收）
     *      2. remarkMath           —— 再把 $...$ 认成公式语法树节点
     *    写反了归一化就白发 —— 那时公式早已没被认出来，
     *    之后也不会再回头重扫一遍。
     */
    remarkPlugins: [
      remarkNormalizeLatex,
      /**
       * ⚠️ singleDollarTextMath 这个选项值得解释一下，它是个真实的取舍。
       *
       * 默认是 true，含义是「单个 $ 也算行内公式」：
       *     $E = mc^2$        → 公式
       * 但代价是文本里的美元符号会被误伤：
       *     这件商品 100$ 到 200$ 之间   → 中间那段被当成公式渲染
       *     （实测确认：会渲染成一坨乱七八糟的数学符号）
       *
       * 设成 false 之后，行内公式要用 $$ ：
       *     $$E = mc^2$$      → 公式
       *     这件商品 100$ 到 200$ 之间   → 正常文本 ✅
       *
       * ── 我最终选了 true（保留单美元），理由是这样 ──
       *    1. 大家写公式的肌肉记忆就是 $...$，改成 $$...$$ 太反直觉
       *    2. 从 Hexo / Typora / Obsidian 搬过来的文章几乎都用 $...$
       *    3. 在技术博客里「写美元符号」的概率远低于「写公式」
       *
       * ⚠️ 但你要知道这个风险：正文里写「$100」这种要写成「\$100」
       *    （反斜杠转义），否则可能被当公式。
       *    如果哪天你觉得这个坑更烦，就把下面这行改成 false。
       */
      [remarkMath, { singleDollarTextMath: true }],
    ],
    rehypePlugins: [rehypeKatex],

    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
  },

  vite: {
    plugins: [tailwindcss()],

    server: {
      /**
       * 文件监听排除。
       *
       * ⚠️ 这条是治「npm run dev 时刷出一长串 EMFILE: too many open files」的。
       *
       *    EMFILE = "Error: EMFILE" = 打开的文件句柄数超了系统上限。
       *    Vite 的 dev server 默认会递归监听整个项目目录以支持热更新，
       *    但下面这三个目录【完全不需要监听】：
       *
       *      node_modules —— 第三方包，几千个文件，而且我们不会去改它
       *      .git         —— 版本库内部结构，改动由 git 命令触发
       *      dist         —— 构建产物，每次 build 全量重写，监听它只会空转
       *
       *    Windows 的默认文件句柄上限比 macOS / Linux 低，
       *    不排除的话很容易撑爆。
       *
       * ⚠️ 这个报错【不影响预览】，页面照常能开 —— 所以它只是噪音。
       *    但不管的话日志会被刷屏，真正的错误反而看不见了。
       */
      watch: {
        ignored: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
      },
    },
  },
});
