import { useEffect, useState } from "react";

/**
 * 判断是否处于移动端布局。
 * 用 JS 而不是纯 CSS 的原因：拖拽、缩放这些行为必须真的不执行，
 * 光靠 CSS 隐藏是没用的 —— react-rnd 仍然会响应手势。
 */
export function useIsMobile(breakpoint = 768) {
  // 初始值给 false，保证 SSR 输出的 HTML 和服务端一致，避免注水不匹配
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);

  return isMobile;
}
