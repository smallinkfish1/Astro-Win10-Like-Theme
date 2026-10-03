import { useEffect, useState, useCallback } from "react";
import {
  getTheme,
  getAcrylic,
  getAnim,
  setTheme,
  setAcrylic,
  setAnim,
  type ThemeMode,
} from "../lib/theme";

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

  // 挂载后同步一次真实值（此时 <html> 上已经被启动脚本打好 class 了）
  useEffect(() => {
    setThemeState(document.documentElement.classList.contains("theme-dark") ? "dark" : "light");
    setAcrylicState(!document.documentElement.classList.contains("no-acrylic"));
    setAnimState(!document.documentElement.classList.contains("no-anim"));
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

  const reset = useCallback(() => {
    setThemeMode("light");
    if (!getAcrylic()) toggleAcrylic();
    if (!getAnim()) toggleAnim();
  }, [setThemeMode, toggleAcrylic, toggleAnim]);

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
    setThemeMode,
    toggleTheme,
    toggleAcrylic,
    toggleAnim,
    reset,
    /** 兜底读取（不走 React 状态），给需要即时值的场景用 */
    read: { getTheme, getAcrylic, getAnim },
  };
}
