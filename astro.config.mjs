// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

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
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
  },

  vite: {
    plugins: [tailwindcss()]
  }
});