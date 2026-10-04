/**
 * 外观设置（主题 / 毛玻璃 / 动画 / 开始菜单深色 / 壁纸）
 * ================================================================
 *
 * 前四项都是「全局开关」，作用方式是往 <html> 上加/减一个 class：
 *
 *   暗色模式       →  .theme-dark       （覆盖 :root 里的颜色变量）
 *   毛玻璃         →  .no-acrylic       （关掉 backdrop-filter 并改用实色底）
 *   动画           →  .no-anim          （把所有动画时长压成 0）
 *   开始菜单深色   →  .menu-dark        （只把开始菜单压成深色，不影响其它）
 *
 * 第五项壁纸不一样，它写的是【属性】而不是 class：
 *
 *   壁纸           →  data-wallpaper="aurora"
 *
 * ⚠️ 为什么壁纸不用 class？
 *    因为壁纸是「多选一」× 「亮/暗」两个正交维度。
 *    走 class 就得写 .wall-aurora、.wall-aurora.theme-dark、
 *    .wall-mountains、.wall-mountains.theme-dark…… 每加一张壁纸多两条，
 *    是指数级写法。用属性则是一位说"哪张"、class 说"亮暗"，
 *    CSS 里规则数线性增长。
 *
 * 为什么用 class 而不是把状态塞进 React？
 *
 *   因为主题要在【页面渲染之前】就生效。如果用 React 管，
 *   就得等 JS 加载 → 注水 → 执行 effect 才能切主题，
 *   用户会先看到一瞬间的亮色（这就是所谓的 FOUC，闪白）。
 *
 *   用 class + 一段内联在小抄（见 DesktopLayout.astro 的 <head>），
 *   可以在 <body> 解析出来之前就把 class 打上，从根上避免闪烁。
 *
 *   所以：localStorage 是唯一数据源，class / 属性 是唯一作用方式，
 *   React 只是「读它 + 写它」的界面。
 *
 * ⚠️ 关于 .menu-dark 这个新增的开关，多说一句它的定位：
 *
 *    Win10 的开始菜单在亮色主题下是【浅色】亚克力，暗色主题下是【深色】。
 *    这跟系统主题走。但很多人就是喜欢那个深色的样子，
 *    想在亮色桌面上也用深色开始菜单 —— 所以给了这个独立开关。
 *
 *    它只作用于开始菜单（见 global.css 里的 .menu-dark .start-menu 规则），
 *    任务栏和窗口不受影响。这样可以在浅色桌面上得到一个"深色开始菜单"，
 *    就像你截图里那样。
 */

import { WALLPAPER_IDS } from "./wallpaper";

/**
 * localStorage 里存的键名。统一加前缀，避免和别的东西撞。
 *
 * ⚠️ 壁纸的那一位（KEY_WALLPAPER）本身定义在 lib/wallpaper.ts 里。
 *    原因：这四项是「有/无」的二值维度，壁纸是「多选一」，
 *    而且还要和亮暗正交组合 —— 数据形状不一样，
 *    硬塞进一个模块反而要互相 import，绕。
 *    这里只保留一个「镜像常量」，专门喂给下面的启动脚本拼字符串。
 */
const KEY_THEME = "win10-blog:theme";
const KEY_ACRYLIC = "win10-blog:acrylic";
const KEY_ANIM = "win10-blog:anim";
const KEY_MENU_DARK = "win10-blog:menu-dark";

/**
 * ⚠️⚠️ 这个值必须和 lib/wallpaper.ts 里的 KEY_WALLPAPER 一字不差。
 *    为什么要抄一份而不是 import？
 *      因为下面 THEME_BOOTSTRAP 是【内联进 <head> 的字符串】，
 *      它必须自包含、不依赖任何模块加载 —— 否则就晚了，会闪白。
 *      拼出来的字符串里只能有字面量。
 *
 *    两处不一致的后果很隐蔽：控制面板里换壁纸写的是 A 键，
 *    启动脚本读的是 B 键 → 每次刷新壁纸都回到默认，
 *    但你在设置界面里看它明明是选中状态（因为那是读的 A 键）。
 *    verify-desktop.mjs 里有一条断言专门盯这个键名。
 */
const KEY_WALLPAPER = "win10-blog:wallpaper";

export type ThemeMode = "light" | "dark";

/** 让切换主题时有个平滑过渡，而不是"啪"一下变色 */
function withTransition(fn: () => void) {
  const root = document.documentElement;

  // 只在用户【主动】切换时才加过渡类。
  // 页面首次加载不加 —— 否则首屏会看到颜色从默认值"淡入"到目标值。
  root.classList.add("theme-transition");
  fn();

  // 过渡类必须撤掉：它是 html * 级别的 transition，
  // 留着会让之后所有交互（hover、窗口拖拽）都带上 180ms 延迟，手感变粘。
  window.setTimeout(() => root.classList.remove("theme-transition"), 300);
}

/* ────────────────────────────────────────────────────────────
   读
   ──────────────────────────────────────────────────────────── */

export function getTheme(): ThemeMode {
  if (typeof localStorage === "undefined") return "light";
  // 没存过就跟随系统偏好 —— 这是现在的通用做法，用户不用手动设置
  const saved = localStorage.getItem(KEY_THEME);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getAcrylic(): boolean {
  if (typeof localStorage === "undefined") return true;
  // 默认开。用 !== "off" 而不是 === "on"，
  // 这样「从没设置过」和「显式打开」走同一条路。
  return localStorage.getItem(KEY_ACRYLIC) !== "off";
}

export function getAnim(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(KEY_ANIM) !== "off";
}

/**
 * 开始菜单是否强制深色。
 *
 * ⚠️ 默认值给的是 true（默认深色），而不是"跟随主题"。
 *    这是有意的 —— 你截图里那个深色开始菜单是 Win10 最经典的观感，
 *    所以把它做成默认。想要浅色的用户去控制面板关掉即可。
 */
export function getMenuDark(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(KEY_MENU_DARK) !== "off";
}

/* ────────────────────────────────────────────────────────────
   写（写 localStorage + 立刻把 class 应用到 <html>）
   ──────────────────────────────────────────────────────────── */

export function setTheme(mode: ThemeMode, animate = true) {
  const apply = () => {
    document.documentElement.classList.toggle("theme-dark", mode === "dark");
  };

  if (animate) withTransition(apply);
  else apply();

  localStorage.setItem(KEY_THEME, mode);
}

export function setAcrylic(on: boolean) {
  // 毛玻璃开关不需要过渡动画：backdrop-filter 没法平滑过渡，
  // 强行加 transition 只会让浏览器每帧重算模糊，非常卡。
  document.documentElement.classList.toggle("no-acrylic", !on);
  localStorage.setItem(KEY_ACRYLIC, on ? "on" : "off");
}

export function setAnim(on: boolean) {
  document.documentElement.classList.toggle("no-anim", !on);
  localStorage.setItem(KEY_ANIM, on ? "on" : "off");
}

export function setMenuDark(on: boolean) {
  // 和毛玻璃一样，这个开关不需要过渡动画：
  // 它改的是 backdrop-filter 相关的一堆变量，平滑过渡只会让浏览器每帧重算模糊。
  document.documentElement.classList.toggle("menu-dark", on);
  localStorage.setItem(KEY_MENU_DARK, on ? "on" : "off");
}

/**
 * 壁纸的读 / 写。
 *
 * ⚠️ 这里的实现【故意和 wallpaper.ts 里的同名函数重复】。
 *    为什么不直接 import 那个？
 *      因为 THEME_BOOTSTRAP 里的逻辑必须和 getWallpaper() 一致，
 *      而启动脚本用的是这一份常量 + 内联字符串。
 *      如果这里改成 import，KEY_WALLPAPER 就会变成运行时才知道的值，
 *      拼进字符串时拿到的是 undefined —— 启动脚本会读写一个
 *      叫 "undefined" 的键，表现为"壁纸设置永远不生效"。
 *    宁可冗余一次，也不要把这两者耦合起来。
 */
export function getWallpaperId(): string {
  if (typeof localStorage === "undefined") return WALLPAPER_IDS[0];
  const saved = localStorage.getItem(KEY_WALLPAPER);
  return WALLPAPER_IDS.includes(saved ?? "") ? (saved as string) : WALLPAPER_IDS[0];
}

export function setWallpaperId(id: string) {
  // 非法 id 先规整 —— 写进去一个清单外的值，CSS 会一条规则都不匹配
  const safe = WALLPAPER_IDS.includes(id) ? id : WALLPAPER_IDS[0];
  document.documentElement.setAttribute("data-wallpaper", safe);
  localStorage.setItem(KEY_WALLPAPER, safe);
}

/* ────────────────────────────────────────────────────────────
   一次应用全部 —— 给页面初始化用
   ──────────────────────────────────────────────────────────── */

export function applyAll() {
  setTheme(getTheme(), false);
  setAcrylic(getAcrylic());
  setAnim(getAnim());
  setMenuDark(getMenuDark());
  setWallpaperId(getWallpaperId());
}

/**
 * 供 <head> 内联脚本调用的初始化代码（字符串形式）。
 *
 * ⚠️ 为什么要把这段写成字符串塞进 <head>，而不是 import 上面的函数？
 *
 *    因为它必须在 <body> 出现之前、在任何打包产物加载之前就跑完。
 *    import 意味着要等模块解析，那就晚了，闪白已经发生。
 *
 *    这段代码刻意写成「不依赖任何外部变量」的自包含 IIFE，
 *    并且用 try/catch 包住 —— 万一 localStorage 被隐私模式禁用了，
 *    也不能让整页脚本挂掉。
 *
 *    它做的判断逻辑必须和上面 getTheme/getAcrylic/getAnim 完全一致，
 *    否则会出现「刷新后设置被重置」的诡异现象。改一个必须改另一个。
 */
export const THEME_BOOTSTRAP = `
(function(){
  try {
    var d = document.documentElement;
    var t = localStorage.getItem("${KEY_THEME}");
    if (t !== "dark" && t !== "light") {
      t = (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches)
        ? "dark" : "light";
    }
    if (t === "dark") d.classList.add("theme-dark");
    if (localStorage.getItem("${KEY_ACRYLIC}") === "off") d.classList.add("no-acrylic");
    if (localStorage.getItem("${KEY_ANIM}") === "off") d.classList.add("no-anim");
    if (localStorage.getItem("${KEY_MENU_DARK}") !== "off") d.classList.add("menu-dark");

    /*
      壁纸：写成 data-wallpaper 属性，而不是 class。
      属性说"哪张"，class（theme-dark）说"亮还是暗"，两个维度正交 ——
      这样 CSS 只需要 $(每张壁纸 × light/dark) 条规则，线性增长。
      换成 class 就得写成 .wall-aurora.theme-dark 这种组合，会爆掉。

      ⚠️ 这段【没有】用 wallpaper.ts 的 getWallpaper()，是故意的：
         内联脚本必须自包含、不能 import（import 要等模块解析，
         那就晚了，闪白已经发生）。所以这里硬拼，
         判断逻辑必须和 wallpaper.ts 里保持一致 —— 改动清单要改两处。

      ⚠️ 兜底：值不在清单里（比如旧版本删掉过某张）就回落 default。
         不然 data-wallpaper 指向一个没有对应 CSS 规则的值，
         结果是一条壁纸规则都不匹配 → 露出兜底底色，看着像坏了。
    */
    var WALLS = ${JSON.stringify(WALLPAPER_IDS)};
    var wp = localStorage.getItem("${KEY_WALLPAPER}");
    if (WALLS.indexOf(wp) === -1) wp = WALLS[0];
    d.setAttribute("data-wallpaper", wp);
  } catch (e) { /* 隐私模式下 localStorage 会抛错，忽略即可 */ }
})();
`;
