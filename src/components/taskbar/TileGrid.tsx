import { GRID } from "../../config/tiles";
import { usedRows, type LaidOutGroup, type LaidOutTile } from "../../lib/tiles";
import Tile from "./Tile";

/**
 * 磁贴网格（支持多分组）。
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

function Group({
  group,
  onActivate,
  startIndex,
}: {
  group: LaidOutGroup;
  onActivate: (tile: LaidOutTile) => void;
  /** 全局错峰索引起点，让入场动画跨组连成一片 */
  startIndex: number;
}) {
  const rows = usedRows(group.tiles);

  /** 容器尺寸 = 行数/列数占到的位置 + 一个格子 */
  const width = group.columns * GRID.cell + (group.columns - 1) * GRID.gap;
  const height = rows > 0 ? rows * GRID.cell + (rows - 1) * GRID.gap : 0;

  /*
   * ⚠️ 空组直接不渲染标题。
   *    否则配置里留了个空分组时会看到一个孤零零的标题，
   *    下面是空白 —— 看起来像渲染坏了。
   */
  if (group.tiles.length === 0) return null;

  return (
    <section className="mb-4 last:mb-0">
      {/* 分组标题 —— 对应截图里的 Create / Play / Explore */}
      <h3 className="mb-2 text-[11px] tracking-wide opacity-55">{group.title}</h3>

      <div className="relative" style={{ width, height }}>
        {group.tiles.map((t, i) => (
          <Tile key={t.id} tile={t} onActivate={onActivate} index={startIndex + i} />
        ))}
      </div>
    </section>
  );
}

export default function TileGrid({
  groups,
  onActivate,
}: {
  groups: LaidOutGroup[];
  onActivate: (tile: LaidOutTile) => void;
}) {
  /**
   * 跨组的错峰索引。
   *
   * ⚠️ 为什么不用组内索引？
   *    那样每一组的第一个磁贴都是 index 0，一起出现 ——
   *    三组同时"啪"一下亮起来，观感很生硬。
   *    用全局连续索引，入场就是从上往下一路淡入，连贯得多。
   */
  let cursor = 0;

  return (
    <div
      // 拖动排序时需要用这个容器做坐标参照，先给它一个 id
      id="tile-grid"
    >
      {groups.map((g) => {
        const start = cursor;
        cursor += g.tiles.length;
        return <Group key={g.title} group={g} onActivate={onActivate} startIndex={start} />;
      })}
    </div>
  );
}
