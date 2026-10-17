import { useEffect, useRef, useState } from "react";
import {
  useDesktopStore,
  GRID,
  TASKBAR_H,
  rowsPerColumn,
  type DesktopItem,
  type GridPos,
} from "../../store/desktopStore";
import { findApp } from "../../config/apps";
import { useT } from "../../i18n";
import type { Dict } from "../../i18n/types";
import ContextMenu from "./ContextMenu";

/**
 * 桌面图标层（React 版）
 * ================================================================
 *
 * ⚠️⚠️ 这一层以前是 Astro 在【构建期】渲染的静态 HTML，靠
 *    DesktopLayout 里一段裸 JS 监听双击。换 React 是为了有状态：
 *    拖动要记位置、右键要开菜单。
 *
 * ── 布局 ──
 *
 *   绝对定位 + 手算坐标，不用 CSS Grid。
 *   因为拖动必须自己知道"落在第几行第几列"。CSS Grid 的自动排布
 *   不提供这个信息，反推很绕。自己算就没这问题：
 *   位置是一份纯数据（col/row），拖动改数据，渲染只管画。
 *
 * ── 拖动为什么用 Pointer Events 而不是 mouse + touch 两套 ──
 *
 *   Pointer Events 把鼠标、触摸、触控笔统一成一套 API：
 *   同一个 onPointerDown 在三种设备上都触发，省掉判断设备类型的麻烦。
 *   而且 setPointerCapture 能保证"鼠标快速移出元素"时
 *   后续事件仍然发给这个元素 —— 用 mouse 事件的话，
 *   甩一下就丢 pointerup，图标会卡在拖动状态。
 */
export default function DesktopIcons() {
  const items = useDesktopStore((s) => s.items);
  const hydrate = useDesktopStore((s) => s.hydrate);
  const select = useDesktopStore((s) => s.select);
  const openMenu = useDesktopStore((s) => s.openMenu);
  const moveItem = useDesktopStore((s) => s.moveItem);

  /**
   * ⚠️ 客户端挂载后才读 localStorage。
   *
   *    store 的初值是空数组（构建期没有 localStorage），
   *    真实数据靠这一次 hydrate 同步进来。
   *    和 useAppearance / i18n store 是同一个套路。
   */
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  /** 双击一个图标 —— 目前桌面只有内置应用，但保留分支好以后扩展 */
  const launch = (item: DesktopItem) => {
    if (item.kind === "app") {
      const app = findApp(item.appId ?? "");
      if (!app) return;

      /**
       * ⚠️ 走 CustomEvent 而不是直接调 windowStore。
       *
       *    桌面图标层和窗口层是【两个独立的岛屿】，没有父子关系，
       *    拿不到同一个 React Context。用事件通信是它们之间唯一干净的通道。
       */
      window.dispatchEvent(
        new CustomEvent("os:open-window", {
          detail: { id: app.id, title: "", icon: app.icon, path: app.path },
        }),
      );
      return;
    }

    /**
     * ⚠️ 下面两个分支目前【走不到】——「创建快捷方式」功能暂时下线，
     *    readItems() 会把非 app 的项全部过滤掉。
     *    留着是为了以后恢复功能时不用重写这段。
     */
    if (item.kind === "post") {
      window.dispatchEvent(
        new CustomEvent("os:open-post", {
          detail: { slug: item.target, title: item.name, icon: "📄" },
        }),
      );
      return;
    }

    if (item.kind === "url" && item.target) {
      // ⚠️ noopener 不能省：防止被打开的页面通过 window.opener 操作本站
      window.open(item.target, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <>
      {/*
        ⚠️ 这一层铺满整个桌面，pointer-events 是 auto ——
           因为"在空白处右键"必须能被它接住。

           它不会挡住窗口：DOM 上它排在窗口层之后，但窗口的 z-index
           从 10 起，图标层没有 z-index（0 层级）。谁在上谁先接到事件。

           ⚠️ 别给它加 z-index。加了就要保证比 10 小，
              否则窗口会被图标层盖住、点不动。
      */}
      <div
        className="absolute inset-0"
        onContextMenu={(e) => {
          /**
           * ⚠️ 整个桌面（含图标）统一在这里处理右键。
           *
           *    图标上不再单独绑 onContextMenu —— 以前那么做是因为
           *    图标右键要多出「删除」，现在没有那项了，
           *    统一冒泡上来处理更简单，也不会漏掉某个子元素。
           *
           *    preventDefault 是必须的：不拦的话，在"桌面"上右键会弹出
           *    浏览器的「检查元素 / 另存为 / 翻译成中文」，非常出戏。
           */
          e.preventDefault();
          openMenu(e.clientX, e.clientY);
        }}
        onMouseDown={(e) => {
          // 点空白处 = 取消选中（Windows 的行为）
          if (e.target === e.currentTarget) select(null);
        }}
      >
        {items.map((item) => (
          <DesktopIcon key={item.id} item={item} onLaunch={launch} onMove={moveItem} />
        ))}
      </div>

      {/* 右键菜单挂在 body 上（内部用 portal），放这里只为跟着一起挂载 */}
      <ContextMenu />
    </>
  );
}

/* ════════════════════════════════════════════════════════════════
   单个图标
   ════════════════════════════════════════════════════════════════ */

/**
 * 移动超过这个距离才算「拖动」，否则算「点击」。
 *
 * ⚠️ 为什么必须有这个阈值：
 *    光看"按下"和"松开"分不清点击和拖动。手抖 2 像素就判定成拖动的话，
 *    用户想选中图标，结果图标被挪走了一格 —— 非常恼人。
 *
 *    4px 是经验值：小于它，正常点击也容易误触；大于它，用户会觉得
 *    "我都拖了这么远还没动"。
 */
const DRAG_THRESHOLD = 4;

function DesktopIcon({
  item,
  onLaunch,
  onMove,
}: {
  item: DesktopItem;
  onLaunch: (item: DesktopItem) => void;
  onMove: (id: string, to: GridPos) => void;
}) {
  const { t } = useT();

  const selectedId = useDesktopStore((s) => s.selectedId);
  const select = useDesktopStore((s) => s.select);

  /** 内置应用去注册表查；快捷方式直接读存在 item 里的 */
  const app = item.kind === "app" ? findApp(item.appId ?? "") : undefined;
  const label = app ? t(app.nameKey as keyof Dict) : (item.name ?? "");
  const icon = app ? app.icon : (item.icon ?? "📄");
  const selected = selectedId === item.id;

  /** 图标要么是 emoji，要么是 public/ 下的图片 —— 判断规则和别处一致 */
  const isImg = icon.startsWith("/") || /^https?:\/\//.test(icon);

  /* ── 拖动状态 ── */

  /**
   * 跟手的位移。null = 没在拖。
   *
   * ⚠️ 拖动过程中【不】改 item.position —— 那样每一帧都要写 localStorage，
   *    而且 store 一更新整层都会重渲染。这里只用 transform 偏移，
   *    松手时才真正落格、写盘。
   */
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);

  /** 本次手势的起点。用 ref 是因为它变化不需要触发重渲染 */
  const gesture = useRef<{
    pointerId: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);

  /**
   * 拖动结束后要吃掉紧跟而来的那次 click。
   *
   * ⚠️ 为什么需要它：
   *    <button> 上按住、移动、松开，浏览器仍然会补发一次 click。
   *    不拦的话，用户拖完图标会「顺带被选中」。
   *
   * ⚠️ 为什么用 setTimeout(0) 清零而不是立刻清零：
   *    事件顺序是 pointerup → mouseup → click，都在同一个任务里同步派发。
   *    setTimeout 排到下一个任务，所以 click 处理时它还是 true，
   *    等下一轮事件循环才清掉 —— 刚好。
   */
  const swallowClick = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    // 只处理左键。右键交给容器的 onContextMenu，中键忽略
    if (e.button !== 0) return;

    /**
     * ⚠️ setPointerCapture 是拖动不丢事件的关键。
     *
     *    不设的话，鼠标一旦移出这个 88×92 的小方块，
     *    pointermove 就不再发给它 —— 拖动会中途"断掉"，
     *    松手也收不到 pointerup，图标永远卡在半路。
     */
    e.currentTarget.setPointerCapture(e.pointerId);

    gesture.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;

    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;

    // 还没超过阈值：不进入拖动状态，让 click 正常工作
    if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

    g.moved = true;
    setDrag({ dx, dy });
  };

  /** 手势结束（松手）。真的落格 + 写盘都在这里 */
  const endGesture = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;

    const el = e.currentTarget;
    if (el.hasPointerCapture(g.pointerId)) el.releasePointerCapture(g.pointerId);

    // 没移动 = 这只是一次点击，什么都不用做
    if (!g.moved) {
      setDrag(null);
      return;
    }

    swallowClick.current = true;
    window.setTimeout(() => {
      swallowClick.current = false;
    }, 0);
    setDrag(null);

    /**
     * ⚠️ 松手位置在任务栏上 = 放弃这次拖动。
     *
     *    不判的话，图标会被算到网格最下面一行，看起来像"被吸过去了"。
     *    Windows 里把图标拖到任务栏也是取消，不是吸附。
     */
    if (e.clientY > window.innerHeight - TASKBAR_H) return;

    /**
     * ⚠️ 位移用【松手时】的坐标减起点，而不是取最后一次 pointermove 的值。
     *
     *    快速甩动时，最后一次 pointermove 的坐标和 pointerup 会差几像素，
     *    用松手位置更贴近用户"最后停在哪"的直觉。
     */
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;

    // 图标左上角的像素位置 + 本次位移 = 松手时它应该在的位置
    const left = GRID.padX + item.position.col * GRID.cellW + dx;
    const top = GRID.padY + item.position.row * GRID.cellH + dy;

    /**
     * ⚠️ Math.round = 网格吸附。
     *    除以格子尺寸之后四舍五入，就是"离哪一格最近就归哪一格"。
     *    不做的话图标会停在两个格子中间的尴尬位置。
     */
    const col = Math.round((left - GRID.padX) / GRID.cellW);
    const row = Math.round((top - GRID.padY) / GRID.cellH);

    const target: GridPos = {
      col: Math.min(Math.max(col, 0), GRID.maxCols - 1),
      row: Math.min(Math.max(row, 0), rowsPerColumn() - 1),
    };

    // 原地放下：不写盘（省一次 localStorage 写入）
    if (target.col === item.position.col && target.row === item.position.row) return;

    /**
     * ⚠️ 真正的落格交给 store.moveItem()，它负责：
     *    · 目标格被占 → 和对方交换位置（Windows 的行为）
     *    · 写 localStorage
     *    组件这边不直接改 position，避免两个地方都能改状态。
     */
    onMove(item.id, target);
  };

  /** 手势被系统打断（触屏来了电话、浏览器切标签…）—— 直接放弃，不落格 */
  const cancelGesture = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    gesture.current = null;
    setDrag(null);
    if (g && e.currentTarget.hasPointerCapture(g.pointerId)) {
      e.currentTarget.releasePointerCapture(g.pointerId);
    }
  };

  return (
    <button
      type="button"
      /**
       * ⚠️ 绝对定位 + 手算像素。
       *
       *    网格坐标 → 像素只在这一处发生转换（col * cellW）。
       *    store、拖动逻辑一律只认 col/row，这样"换屏幕尺寸"时
       *    不存在"存的像素失效"的问题。
       */
      style={{
        left: GRID.padX + item.position.col * GRID.cellW,
        top: GRID.padY + item.position.row * GRID.cellH,
        width: GRID.cellW,
        height: GRID.cellH,
        // 拖动中只动 transform，不动 left/top —— 后者会触发整层重排
        transform: drag ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
        /**
         * ⚠️⚠️ 拖动中禁用过渡；松手后【也不要】给 left/top 加过渡。
         *
         *    为什么松手后不能加：
         *      松手那一刻，left 从旧值改到新值、transform 从 (dx,dy) 归零。
         *      两者视觉上的总和是连续的（旧+位移 = 新），
         *      但如果给 left 加了 120ms 过渡、transform 却是瞬间归零，
         *      就会出现 t=0 时「left 还在旧值、transform 已经归零」
         *      → 图标先弹回原位，再滑到新位置。那一下很难看。
         *
         *    不加过渡 = 瞬间吸附。这也正是 Win10 桌面的手感。
         *
         *    颜色过渡由 className 里的 transition-colors 负责，
         *    它只管 background-color，不碰 left/top，所以不冲突。
         */
        transition: drag ? "none" : undefined,
        zIndex: drag ? 30 : undefined,
        opacity: drag ? 0.8 : undefined,
      }}
      data-icon-id={item.id}
      aria-label={label}
      onClick={() => {
        // 拖动刚结束，吃掉这次 click
        if (swallowClick.current) return;
        select(item.id);
      }}
      onDoubleClick={() => {
        if (swallowClick.current) return;
        onLaunch(item);
      }}
      onKeyDown={(e) => {
        // 键盘可达：回车/空格 = 打开（键盘用户没有"双击"）
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onLaunch(item);
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={cancelGesture}
      className={`absolute flex cursor-default select-none touch-none flex-col items-center gap-1.5
                  rounded p-2 transition-colors
                  ${drag ? "cursor-grabbing will-change-transform" : ""}
                  ${selected ? "bg-white/25 outline outline-1 outline-white/50" : "hover:bg-white/15"}
                  focus:outline-none focus-visible:bg-white/25`}
    >
      <div className="grid h-11 w-11 place-items-center">
        {isImg ? (
          <img
            src={icon}
            alt=""
            width="44"
            height="44"
            /**
             * ⚠️ draggable="false" 必须写。
             *    不写的话，按住图片会触发浏览器【原生图片拖拽】——
             *    你会看到一个半透明的图片跟着鼠标飞，而我们的拖动逻辑
             *    同时也在跑，两个影子叠在一起。
             */
            draggable="false"
            className="pointer-events-none h-11 w-11 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,.5)]"
          />
        ) : (
          <span className="pointer-events-none text-[30px] leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,.5)]">
            {icon}
          </span>
        )}
      </div>

      <span
        className="pointer-events-none line-clamp-2 text-center text-[12px] leading-tight text-white
                   [overflow-wrap:anywhere] [text-shadow:0_1px_3px_rgba(0,0,0,.95)]"
      >
        {label}
      </span>

      {/*
        ⚠️ 外部链接的小箭头 —— 目前走不到（快捷方式功能下线），
           留着是为了以后恢复。

        ⚠️ 图标内部一律 pointer-events-none：
           不然 pointerdown 的 target 会是 img/span 而不是 button。
           统一让 button 接事件最省心。
      */}
      {item.kind === "url" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[26px] left-[18px] grid h-[13px] w-[13px]
                     place-items-center rounded-[2px] bg-black/55 text-[8px] leading-none text-white
                     shadow-[0_1px_2px_rgba(0,0,0,.4)]"
        >
          ↗
        </span>
      )}
    </button>
  );
}
