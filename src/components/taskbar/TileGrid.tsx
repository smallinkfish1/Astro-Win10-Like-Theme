import { GRID } from "../../config/tiles";
import { layoutTiles, usedRows, type LaidOutTile } from "../../lib/tiles";
import Tile from "./Tile";

/**
 * 磁贴网格。
 *
 * 这个组件是「绝对定位容器」——它不负责布局，只负责给出一个
 * 尺寸正确的坐标系，让 Tile 自己按算好的 left/top 落位。
 *
 * 为什么不用 CSS Grid？
 * ─────────────────────────────────────────────────────────
 * Grid 的自动排布很省事，但它有两个问题正好卡住我们：
 *
 *   1. 它不告诉我们每个元素落在第几行第几列。而拖动排序
 *      必须知道这个，才能把「鼠标位置」翻译成「新的顺序」。
 *
 *   2. 跨格元素（2×2 大磁贴）会让 Grid 的自动流有「回填空洞」的行为，
 *      顺序和位置的关系不再是一一对应，算插入点会很绕。
 *
 * 自己算坐标就没这些事：位置是一份纯数据，拖动时改数据就行。
 * 代价是要自己写 first-fit 排布算法（在 lib/tiles.ts 里，三十行）。
 */
export default function TileGrid({
  tiles,
  onActivate,
}: {
  tiles: Omit<LaidOutTile, "pos">[];
  onActivate: (tile: LaidOutTile) => void;
}) {
  const laid = layoutTiles(tiles);
  const rows = usedRows(laid);

  /** 容器尺寸 = 最后一行/列占到的位置 + 一个格子 */
  const width = GRID.columns * GRID.cell + (GRID.columns - 1) * GRID.gap;
  const height = rows > 0 ? rows * GRID.cell + (rows - 1) * GRID.gap : 0;

  return (
    <div
      // 拖动排序时需要用这个容器做坐标参照，先给它一个 id
      id="tile-grid"
      className="relative"
      style={{ width, height }}
    >
      {laid.map((t, i) => (
        <Tile key={t.id} tile={t} onActivate={onActivate} index={i} />
      ))}
    </div>
  );
}
