import { useEffect, useState, useCallback } from "react";
import {
  getTheme,
  getAcrylic,
  getAnim,
  getMenuDark,
  setTheme,
  setAcrylic,
  setAnim,
  setMenuDark,
  getWallpaperId,
  setWallpaperId,
  type ThemeMode,
} from "../lib/theme";
import { DEFAULT_WALLPAPER, findWallpaper } from "../lib/wallpaper";

/**
 * 外观设置 hook。
 *
 * 状态【不从 React 派生】，而是每次都去读真实的 DOM / localStorage。
 * 原因见 lib/theme.ts：真正的数据源是 <html> 上的 class，
 * React 只是它的一个显示器。如果这里维护一份独立 state，
 * 两份数据迟早会不同步（尤其是用户按了浏览器后退、或者多标签页同时改设置）。
 *
 * 初始值给 light/true/true 是为了 SSR 时输出稳定，
 * 真实的系统偏好和 localStorage 值在 useEffect 里同步进来。
 */
export function useAppearance() {
  const [theme, setThemeState] = useState<ThemeMode>("light");
  const [acrylic, setAcrylicState] = useState(true);
  const [anim, setAnimState] = useState(true);
  // ⚠️ 初始值给 true 和服务端一致（服务端读不到 localStorage，
  //    而 getMenuDark 在无 localStorage 时返回 true）。
  //    真实值在下面的 useEffect 里同步进来。
  const [menuDark, setMenuDarkState] = useState(true);

  /**
   * 当前壁纸 id。
   *
   * ⚠️ 初始值给 DEFAULT_WALLPAPER 而不是空字符串 —— SSR 时读不到
   *    localStorage，给空串会让服务端和客户端首帧不一致（注水报错）。
   *    真实值在下面的 useEffect 里跟其它几项一起同步进来。
   */
  const [wallpaper, setWallpaperState] = useState(DEFAULT_WALLPAPER);

  // 挂载后同步一次真实值（此时 <html> 上已经被启动脚本打好 class 了）
  useEffect(() => {
    setThemeState(document.documentElement.classList.contains("theme-dark") ? "dark" : "light");
    setAcrylicState(!document.documentElement.classList.contains("no-acrylic"));
    setAnimState(!document.documentElement.classList.contains("no-anim"));
    /**
     * ⚠️ menu-dark 和上面三个的判断方向【相反】。
     *
     *    上面三个是「有 no-xxx 类 = 关」，
     *    这个是「有 menu-dark 类 = 开」。
     *    因为它的默认是开，用「有类=开」比「没类=开」更符合直觉 ——
     *    class 存在就代表这个特性生效，好读也好调试。
     */
    setMenuDarkState(document.documentElement.classList.contains("menu-dark"));

    /**
     * ⚠️ 壁纸读的是【DOM 属性】而不是 localStorage。
     *
     *    为什么？因为真值来源是 <html data-wallpaper>：
     *    启动脚本已经按 localStorage 把它打好了，这里直接读属性
     *    就等于读到了"当前实际生效的那张"。
     *
     *    直接读 localStorage 也行，但那样就多了一个"万一两者不同步"的
     *    可能性 —— 而属性才是决定画面长什么样的那个。
     *    UI 显示应该反映现实，不是反映意图。
     */
    setWallpaperState(
      findWallpaper(document.documentElement.getAttribute("data-wallpaper")).id,
    );
  }, []);

  const toggleTheme = useCallback(() => {
    const next: ThemeMode = document.documentElement.classList.contains("theme-dark")
      ? "light"
      : "dark";
    setTheme(next); // 带过渡动画
    setThemeState(next);
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setTheme(mode);
    setThemeState(mode);
  }, []);

  const toggleAcrylic = useCallback(() => {
    const next = document.documentElement.classList.contains("no-acrylic");
    setAcrylic(next);
    setAcrylicState(next);
  }, []);

  const toggleAnim = useCallback(() => {
    const next = document.documentElement.classList.contains("no-anim");
    setAnim(next);
    setAnimState(next);
  }, []);

  const toggleMenuDark = useCallback(() => {
    const next = !document.documentElement.classList.contains("menu-dark");
    setMenuDark(next);
    setMenuDarkState(next);
  }, []);

  /**
   * 换壁纸。
   *
   * ⚠️ 命名成 setWallpaperMode 而不是 setWallpaper，是为了和
   *    lib 层的 setWallpaperId、以及下面 read 里的 getWallpaperId
   *    在视觉上区分开：hook 暴露的是「UI 可调的那一档」，
   *    lib 暴露的是「直接写 localStorage 的底层动作」。
   */
  const setWallpaperMode = useCallback((id: string) => {
    const safe = findWallpaper(id).id;
    setWallpaperId(safe);
    setWallpaperState(safe);
  }, []);

  const reset = useCallback(() => {
    setThemeMode("light");
    if (!getAcrylic()) toggleAcrylic();
    if (!getAnim()) toggleAnim();
    // 复位时回到默认值「开」，而不是当前的相反值
    if (!getMenuDark()) toggleMenuDark();
    setWallpaperMode(DEFAULT_WALLPAPER);
  }, [setThemeMode, toggleAcrylic, toggleAnim, toggleMenuDark, setWallpaperMode]);

  /**
   * 跟随系统主题变化。
   *
   * ⚠️ 只在用户【没有手动设置过】时才跟随。
   *    如果用户明确选了亮色，系统切暗色时不该把他的选择覆盖掉。
   */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = (e: MediaQueryListEvent) => {
      if (localStorage.getItem("win10-blog:theme")) return; // 用户设过，不跟随
      setThemeMode(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onSystem);
    return () => mq.removeEventListener("change", onSystem);
  }, [setThemeMode]);

  return {
    theme,
    acrylic,
    anim,
    menuDark,
    wallpaper,
    setThemeMode,
    toggleTheme,
    toggleAcrylic,
    toggleAnim,
    toggleMenuDark,
    setWallpaperMode,
    reset,
    /** 兜底读取（不走 React 状态），给需要即时值的场景用 */
    read: { getTheme, getAcrylic, getAnim, getMenuDark, getWallpaperId },
  };
}
