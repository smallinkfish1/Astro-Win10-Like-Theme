import { GRID } from "../../config/tiles";
import { isImageIcon, type LaidOutTile } from "../../lib/tiles";
import type { CSSProperties } from "react";

/**
 * 单个磁贴。
 *
 * 尺寸算法（这是「严丝合缝」的关键）：
 *
 *   小磁贴 = cell
 *   大磁贴 = cell × 2 + gap
 *
 * 为什么要加 gap？因为大磁贴跨越两个格子，它中间要「吃掉」一条缝隙：
 *
 *   ┌────┬────┐        小磁贴是 cell 宽。
 *   │ sm │ sm │        大磁贴横向占两格，视觉上应该等于
 *   ├────┼────┤        「两个小磁贴 + 中间那条缝」，
 *   │  lg (2×2)│       所以宽 = cell*2 + gap。
 *   └──────────┘
 *
 * 如果直接用 cell*2，大磁贴会比两个小磁贴窄一个 gap，
 * 右边的边就对不齐了 —— 这个细节不做对，整个网格看着就是歪的。
 */
function sizeOf(size: "sm" | "lg"): number {
  return size === "lg" ? GRID.cell * 2 + GRID.gap : GRID.cell;
}

export interface TileProps {
  tile: LaidOutTile;
  onActivate: (tile: LaidOutTile) => void;
  /** 入场动画的错峰索引，由 TileGrid 传进来 */
  index?: number;
}

export default function Tile({ tile, onActivate, index = 0 }: TileProps) {
  const px = sizeOf(tile.size);
  const isLarge = tile.size === "lg";

  /**
   * 坐标定位。
   *
   * 用绝对定位 + 手算的 left/top，而不是让 CSS Grid 自动排。
   * 原因见 lib/tiles.ts 顶部的说明：拖动排序需要我们自己知道
   * 每个磁贴在第几行第几列，自动布局不提供这个信息。
   *
   * 换算：
   *   left = col × (cell + gap)
   *   top  = row × (cell + gap)
   */
  const style: CSSProperties = {
    position: "absolute",
    left: tile.pos.col * (GRID.cell + GRID.gap),
    top: tile.pos.row * (GRID.cell + GRID.gap),
    width: px,
    height: px,
    background: tile.color,
    /**
     * --i 是给 .anim-tile 用的错峰索引。
     *
     * CSS 动画没法知道自己是第几个元素，所以要用 CSS 变量把它传进去：
     *   .anim-tile { animation-delay: min(calc(var(--i) * 22ms), 260ms) }
     *
     * 用 min() 压住上限是有必要的：磁贴多的时候（比如 20 个），
     * 不压的话最后一个要等 440ms 才出现，看起来像卡了。
     * 压到 260ms 以内，观感上是"一片一起淡进来"，而不是"排队"。
     */
    ["--i" as string]: index,
  } as CSSProperties;

  return (
    <button
      type="button"
      // 拖动排序后面会用这个属性找人
      data-tile-id={tile.id}
      aria-label={`${tile.label}${
        tile.path.startsWith("http") ? "（外部链接）" : ""
      }`}
      onClick={() => onActivate(tile)}
      style={style}
      /**
       * 磁贴的视觉与微动效。
       *
       * anim-tile      入场：轻微上浮 + 淡入，按 index 错峰
       * duration-150   悬停/按下反馈的时长（比全局 --dur 稍快，手感更"跟手"）
       *
       * ⚠️ 悬停用 brightness(1.12) 而不是换背景色。
       *    原因：磁贴底色是用户在配置里自定义的（每个都不一样），
       *    如果 hover 时换成固定色，十个磁贴会有十种不同观感。
       *    brightness 是"在当前色基础上提亮"，对任何颜色都成立。
       *
       * ⚠️ 悬停用 -translate-y-[2px] 上浮，配合下面的 hover:shadow 产生"抬起"感。
       *    这正是 Win10 磁贴的交互反馈 —— 不是变色，是"浮起来"。
       *
       * ⚠️ active:scale-[0.96] 是按下反馈。0.96 而不是更小，
       *    是因为磁贴是实心块，缩太多会显得"塌"，0.96 刚好有"按下去"的触感。
       */
      className="anim-tile group flex flex-col items-start justify-end gap-1 rounded-[3px] p-2
                 text-left text-white
                 transition-[filter,transform,box-shadow] duration-150
                 hover:-translate-y-[2px] hover:shadow-[0_6px_16px_rgba(0,0,0,.35)]
                 hover:brightness-[1.12]
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70
                 active:translate-y-0 active:scale-[0.96] active:brightness-95"
    >
      {/* ── 图标 ── */}
      {isImageIcon(tile.icon) ? (
        // 图片图标：限制最大尺寸，避免大 logo 把磁贴撑满
        <img
          src={tile.icon}
          alt=""
          draggable={false}
          className={isLarge ? "h-8 w-8 object-contain" : "h-6 w-6 object-contain"}
          style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.45))" }}
        />
      ) : (
        <span
          className={
            isLarge
              ? "text-[26px] leading-none"
              : "text-[19px] leading-none"
          }
          style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.45))" }}
        >
          {tile.icon}
        </span>
      )}

      {/* ── 文字 ── */}
      {/*
        大磁贴字号大一点，和尺寸成比例 —— 否则大磁贴会显得空。
        文字统一靠左下角，这是 Win10 磁贴的排版方式：
        图标在上、文字在下，都贴着左上→左下这条线。
      */}
      <span
        className={`w-full ${
          isLarge ? "text-[13px]" : "text-[11px]"
        } font-medium leading-tight [overflow-wrap:anywhere]`}
        style={{ textShadow: "0 1px 2px rgba(0,0,0,.4)" }}
      >
        {tile.label}
      </span>
    </button>
  );
}
