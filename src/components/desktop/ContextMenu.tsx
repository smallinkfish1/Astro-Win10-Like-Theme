import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDesktopStore } from "../../store/desktopStore";
import { useT } from "../../i18n";

/**
 * 桌面右键菜单
 * ================================================================
 *
 * 现在只剩「排列图标」一项 —— 因为「新建快捷方式」那套暂时下线了。
 *
 * ── 只剩一项，还值得保留整个菜单吗？──
 *
 *   值得，两个理由：
 *
 *   1. 「排列图标」解决一个真实问题：图标拖乱之后（尤其是不小心把
 *      五个图标拖成一坨），用户没有任何办法一键恢复，只能一个个
 *      手动拖回去。
 *
 *   2. 桌面右键【必须】拦掉浏览器默认菜单。不拦的话，在"桌面"上
 *      右键会弹出「检查元素 / 另存为 / 翻译成中文」—— 非常出戏。
 *      既然都要 preventDefault，顺手给一项有用的功能是零成本的。
 *
 * ── 为什么不做 Shift + 左键 ──
 *
 *   讨论过，结论是不划算：
 *     · 可发现性为零（右键是通用约定，自创手势没人猜得到）
 *     · 和 Windows 习惯相反（Windows 的扩展菜单是 Shift + 【右】键）
 *     · 触屏没有 Shift 键
 *     · 还要和拖动抢同一个"按下"事件
 *   而右键本来就是零学习成本，没有理由绕开它。
 *
 * ⚠️ 两个必须做对的点（和之前一样）：
 *   1. 挂到 body 上（createPortal）—— 否则靠近屏幕右边缘会被裁掉
 *   2. 靠近边缘要往回收 —— 否则在最右下角右键时，菜单会有一部分
 *      跑到视口外，那部分用户既看不到也点不到
 */
export default function ContextMenu() {
  const { t } = useT();

  const menu = useDesktopStore((s) => s.menu);
  const closeMenu = useDesktopStore((s) => s.closeMenu);
  const autoArrange = useDesktopStore((s) => s.autoArrange);

  const ref = useRef<HTMLDivElement>(null);
  /** 修正后的位置。初值和 menu 一致，量完再修正 */
  const [pos, setPos] = useState({ x: 0, y: 0 });

  /**
   * 位置修正 + 视口边界处理。
   *
   * ⚠️ 用 useEffect 而不是 useLayoutEffect：
   *    菜单的显隐由 menu !== null 控制，所以这个 effect 跑的时候
   *    DOM 已经在页面上了，能直接量到尺寸。
   *    （本项目是 client:only，useLayoutEffect 的 SSR 警告不会触发，
   *      但用 useEffect 更省心。）
   */
  useEffect(() => {
    if (!menu) return;
    const el = ref.current;
    if (!el) return;

    const { offsetWidth: w, offsetHeight: h } = el;
    const margin = 4; // 至少留一点缝，别贴着边

    const x = Math.max(margin, Math.min(menu.x, window.innerWidth - w - margin));
    const y = Math.max(margin, Math.min(menu.y, window.innerHeight - h - margin));

    setPos({ x, y });
  }, [menu]);

  /** 点别处 / 按 Esc 关闭 */
  useEffect(() => {
    if (!menu) return;

    const onDown = (e: MouseEvent) => {
      /**
       * ⚠️ 点在菜单内部就不关。
       *    少了这一行，点菜单项会先把菜单关掉、再也没机会触发它的 onClick。
       *    理由和 Taskbar 关开始菜单那里一样（见 Taskbar.tsx 的注释）。
       */
      if (ref.current?.contains(e.target as Node)) return;
      closeMenu();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };

    /**
     * ⚠️ 用 capture（第三参 true）。
     *
     *    桌面图标自己的 onMouseDown 会做「点空白处取消选中」，
     *    如果不抢先一步，点菜单的瞬间图标会被取消选中，视觉上闪一下。
     */
    document.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, closeMenu]);

  // ⚠️ 没开菜单就什么都不渲染；createPortal 需要 document，所以也判一下
  if (!menu || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={t("dk.menuAria")}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[200] min-w-[170px] rounded-[3px] border border-[var(--surface-border)]
                 bg-[var(--surface)] py-1 text-[12.5px] text-[var(--fg)]
                 shadow-[0_6px_20px_rgba(0,0,0,.22)]"
    >
      <Item
        icon="▦"
        label={t("dk.arrange")}
        onClick={() => {
          /**
           * ⚠️ 这里不用手动 closeMenu() ——
           *    autoArrange 内部最后一行就是 set({ menu: null })，
           *    它知道自己该关菜单。
           */
          autoArrange();
        }}
      />
    </div>,
    document.body,
  );
}

/* ── 小零件 ── */

/**
 * 一个菜单项。
 *
 * ⚠️ 为什么用 button 而不是 div：
 *    键盘用户要能用 Tab 走过来、回车触发。
 *    用 div + onClick 的话，屏幕阅读器根本不知道这能点。
 */
function Item({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-[6px] text-left transition-colors
                 hover:bg-[var(--accent)] hover:text-white
                 focus:outline-none focus-visible:bg-[var(--accent)] focus-visible:text-white"
    >
      <span className="w-4 shrink-0 text-center text-[12px] leading-none" aria-hidden="true">
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}
