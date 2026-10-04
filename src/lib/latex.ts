/**
 * LaTeX 语法归一化 —— TS 侧的类型化入口。
 * ================================================================
 *
 * 真正的实现在 ./normalize-latex.mjs —— 之所以拆开，是因为
 * astro.config.mjs 里的 remark 插件必须引用纯 JS（Node 原生 ESM
 * 不认 .ts），而浏览器侧（markdown.ts）用 .ts 更舒服。
 *
 * 这里只做 re-export + 类型标注，方便 TS 代码拿到补全和检查。
 * 逻辑一行都不要往这儿写 —— 写在这里的话，配置那边就用不上了。
 */

// @ts-ignore -- .mjs 没有类型声明，但我们知道它的签名（见下方 wrapper）
import { normalizeLatex as normalizeLatexRaw } from "./normalize-latex.mjs";

/**
 * 把 Markdown 里的 \(...\) 和 \[...\] 统一成 $...$ 和 $$...$$。
 *
 * 详细说明见 src/lib/normalize-latex.mjs 的顶部注释。
 */
export function normalizeLatex(md: string): string {
  return normalizeLatexRaw(md);
}
