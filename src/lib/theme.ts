/**
 * 外观设置（主题 / 毛玻璃 / 动画）
 * ================================================================
 *
 * 这三项都是「全局开关」，作用方式是往 <html> 上加/减一个 class：
 *
 *   暗色模式   →  .theme-dark    （覆盖 :root 里的颜色变量）
 *   毛玻璃     →  .no-acrylic    （关掉 backdrop-filter 并改用实色底）
 *   动画       →  .no-anim       （把所有动画时长压成 0）
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
 *   所以：localStorage 是唯一数据源，class 是唯一作用方式，
 *   React 只是「读它 + 写它」的界面。
 */

/** localStorage 里存的键名。统一加前缀，避免和别的东西撞 */
const KEY_THEME = "win10-blog:theme";
const KEY_ACRYLIC = "win10-blog:acrylic";
const KEY_ANIM = "win10-blog:anim";

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

/* ────────────────────────────────────────────────────────────
   一次应用全部 —— 给页面初始化用
   ──────────────────────────────────────────────────────────── */

export function applyAll() {
  setTheme(getTheme(), false);
  setAcrylic(getAcrylic());
  setAnim(getAnim());
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
  } catch (e) { /* 隐私模式下 localStorage 会抛错，忽略即可 */ }
})();
`;
