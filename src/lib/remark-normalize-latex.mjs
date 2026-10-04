/**
 * remark 插件：在 remark-math 解析公式之前，把 \(...\) / \[...\]
 * 归一化成 remark-math 认识的 $...$ / $$...$$。
 * ================================================================
 *
 * ⚠️⚠️ 这个文件必须是 .mjs
 *    astro.config.mjs 是 ESM 的 .mjs，它 import 这个插件时走的是
 *    Node 原生 ESM 加载器，【不经过 Vite/Astro 的 TS 转译】。
 *    写成 .ts 会直接报 "Unknown file extension .ts"。
 *
 * ⚠️⚠️ 为什么用 transformer 而不是自己遍历语法树？
 *
 *    我们要改的是【原始 Markdown 文本】，必须赶在 remark-math
 *    把它解析成 mdast 节点【之前】动手。
 *
 *    remark 插件默认拿到的参数是 (tree, file)：
 *      - tree 已经是解析好的语法树。这时候 \( \) 早被当成普通文本了，
 *        想改得先把文本节点拼回去、改完再解析 —— 又麻烦又丢格式。
 *      - file.value 是【这一批 Markdown 的原始文本】，而且可写。
 *
 *    所以正解是：在 transformer 里直接改 file.value，
 *    然后 return undefined，表示"语法树我没动，请去读 file.value"。
 *
 *    （这一点是实测确认过的：插件里打印 typeof file.value 得到 "string"，
 *      内容正是文章正文 —— 说明 Astro 确实把原始 markdown 传到了这儿。）
 *
 * ⚠️ 执行顺序依赖：这个插件必须排在 remarkMath 【前面】。
 *    remarkPlugins 数组是从左往右执行的，写在后面等于白发 ——
 *    那时公式早就没被认出来。
 */

import { normalizeLatex } from "./normalize-latex.mjs";

/**
 * @returns {(tree: unknown, file: { value?: unknown }) => undefined}
 */
export default function remarkNormalizeLatex() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (tree, file) => {
    // file.value 是原始 Markdown 文本。
    // 不是字符串就直接放弃 —— 宁可原样不动，也不要写出半个坏掉的文档。
    if (typeof file?.value !== "string") return undefined;

    const before = file.value;
    const after = normalizeLatex(before);

    // 没变化就别赋值，省掉一次无意义的重建
    if (after !== before) {
      file.value = after;
    }

    // 返回 undefined = "我没改语法树，你去读 file.value 吧"。
    // ⚠️ 这里【不能】返回 tree —— 返回 tree 意味着"以语法树为准"，
    //    我们刚写进 file.value 的替换结果就被丢掉了。
    return undefined;
  };
}
