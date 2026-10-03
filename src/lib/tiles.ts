import {
  TILES,
  PALETTE,
  AUTO_APPEND,
  GRID,
  type TileConfig,
  type TileSize,
} from "../config/tiles";

/**
 * 磁贴数据层。
 *
 * 职责：把「手写配置」和「自动生成」两批数据合成一份完整的磁贴列表，
 * 并算出每个磁贴在网格里的坐标。
 *
 * ⚠️ 为什么坐标要在这里算，而不是交给 CSS Grid 自动排？
 *
 *   因为后面要做拖动排序。CSS Grid 的自动流（grid-auto-flow）在
 *   有跨格元素时是「按顺序填空」，它自己知道下一个洞在哪，
 *   但**不会告诉你**每个元素被放在了哪一行哪一列。
 *
 *   而拖动排序必须知道「你拖到了第几行第几列」才能算出新顺序。
 *   所以坐标必须是我们自己算出来的、可控的 —— 不能依赖浏览器的隐式布局。
 *
 *   这也是本项目磁贴限制成 1×1 和 2×2 的原因之一：
 *   只有这两个尺寸时，2×2 永远占 (row, col)、(row, col+1)、
 *   (row+1, col)、(row+1, col+1) 这四个格子，锚点固定在左上角，
 *   布局计算会简单很多。
 */

/** 网格坐标：col 从 0 开始，row 从 0 开始 */
export interface TilePosition {
  col: number;
  row: number;
  /** 占几列（1 或 2） */
  colSpan: number;
  /** 占几行（1 或 2） */
  rowSpan: number;
}

/** 一个排好位置的磁贴 */
export interface LaidOutTile extends TileConfig {
  /** 实际用的尺寸，配置里没写时补成 "sm" */
  size: TileSize;
  /** 实际用的颜色，配置里没写时从调色板取 */
  color: string;
  /** 实际用的可拖动标记 */
  draggable: boolean;
  /** 是不是自动追加的（分类/标签），用于在 UI 上做个区分 */
  auto: boolean;
  /** 网格坐标 */
  pos: TilePosition;
}

/** 一个格子是否可用 */
type Grid = boolean[][];

function makeGrid(rows: number, cols: number): Grid {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
}

/** 检查 (row, col) 放一个 rowSpan×colSpan 的块能不能放下 */
function canPlace(grid: Grid, row: number, col: number, rowSpan: number, colSpan: number): boolean {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  // 出界
  if (row + rowSpan > rows || col + colSpan > cols) return false;

  // 有没有被占
  for (let r = row; r < row + rowSpan; r++) {
    for (let c = col; c < col + colSpan; c++) {
      if (grid[r][c]) return false;
    }
  }
  return true;
}

function occupy(grid: Grid, row: number, col: number, rowSpan: number, colSpan: number) {
  for (let r = row; r < row + rowSpan; r++) {
    for (let c = col; c < col + colSpan; c++) {
      grid[r][c] = true;
    }
  }
}

/**
 * 按顺序把磁贴放进网格。
 *
 * 策略是「第一个能放下的位置就放」（first-fit），扫描顺序是从左到右、
 * 从上到下。这正是 Win10 的行为：磁贴顺序决定位置，大磁贴把后面的往右挤。
 *
 * @param tiles 已经排好序的磁贴（不含坐标）
 * @param cols  网格列数
 * @param rows  网格行数。不够时会自动往下扩
 */
export function layoutTiles(
  tiles: Omit<LaidOutTile, "pos">[],
  cols = GRID.columns,
  rows = 40, // 先给足行数，最后再裁掉空行
): LaidOutTile[] {
  const grid = makeGrid(rows, cols);
  const out: LaidOutTile[] = [];

  for (const tile of tiles) {
    const colSpan = tile.size === "lg" ? 2 : 1;
    const rowSpan = tile.size === "lg" ? 2 : 1;

    let placed = false;

    for (let row = 0; row < rows && !placed; row++) {
      for (let col = 0; col + colSpan <= cols; col++) {
        if (canPlace(grid, row, col, rowSpan, colSpan)) {
          occupy(grid, row, col, rowSpan, colSpan);
          out.push({ ...tile, pos: { col, row, colSpan, rowSpan } });
          placed = true;
          break;
        }
      }
    }

    // 放不下说明行数给少了。理论上 rows=40 够用，但别静默丢掉磁贴。
    if (!placed) {
      console.warn(`[tiles] 磁贴 "${tile.id}" 放不进网格，已跳过`);
    }
  }

  return out;
}

/** 网格实际用了几行 —— 最后一行有磁贴的行号 + 1 */
export function usedRows(tiles: LaidOutTile[]): number {
  return tiles.reduce((max, t) => Math.max(max, t.pos.row + t.pos.rowSpan), 0);
}

/** 是不是外部链接 */
export function isExternal(path: string): boolean {
  return /^https?:\/\//i.test(path);
}

/** 图标是 emoji 还是图片 URL */
export function isImageIcon(icon: string): boolean {
  return /^https?:\/\//i.test(icon) || icon.startsWith("/");
}

/** 从链接里抠出域名，给外链磁贴做兜底图标/提示用 */
export function hostOf(path: string): string {
  try {
    return new URL(path).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

interface BuildOptions {
  categories: { name: string; count: number }[];
  tags: { name: string; count: number }[];
  /** 上次拖动排序保存的顺序（磁贴 id 数组）。没有就是没拖过 */
  order?: string[];
}

/**
 * 合成完整的磁贴列表（不含坐标，坐标交给 layoutTiles）。
 *
 * 顺序是：
 *   1. 配置文件里的磁贴（保持书写顺序）
 *   2. 自动追加的分类
 *   3. 自动追加的标签
 *
 * 如果传了 order（来自 localStorage 的拖动结果），就按那个顺序重排；
 * order 里没有的新磁贴会追加到末尾 —— 所以你新加一个磁贴时，
 * 它不会因为你之前拖过顺序就消失。
 */
export function buildTiles({
  categories,
  tags,
  order,
}: BuildOptions): Omit<LaidOutTile, "pos">[] {
  const raw: Omit<LaidOutTile, "pos">[] = [];
  const seen = new Set<string>();

  /** 统一入库，顺便去重和补默认值 */
  const push = (
    cfg: TileConfig & { auto?: boolean },
    colorIndex: number,
  ) => {
    if (seen.has(cfg.id)) {
      console.warn(`[tiles] 磁贴 id 重复，已忽略：${cfg.id}`);
      return;
    }
    seen.add(cfg.id);

    raw.push({
      ...cfg,
      size: cfg.size ?? "sm",
      color: cfg.color ?? PALETTE[colorIndex % PALETTE.length],
      draggable: cfg.draggable ?? true,
      auto: cfg.auto ?? false,
    });
  };

  // ── 1. 手写配置 ──
  TILES.forEach((t, i) => push(t, i));

  // ── 2. 自动追加分类和标签 ──
  if (AUTO_APPEND.enabled) {
    let n = TILES.length;

    categories.slice(0, AUTO_APPEND.maxCategories).forEach((c) => {
      push(
        {
          id: `category:${c.name}`,
          label: c.name,
          icon: AUTO_APPEND.categoryIcon,
          path: `/category/${encodeURIComponent(c.name)}`,
          size: "sm",
          auto: true,
        },
        n++,
      );
    });

    tags.slice(0, AUTO_APPEND.maxTags).forEach((t) => {
      push(
        {
          id: `tag:${t.name}`,
          label: t.name,
          icon: AUTO_APPEND.tagIcon,
          path: `/tags/${encodeURIComponent(t.name)}`,
          size: "sm",
          auto: true,
        },
        n++,
      );
    });
  }

  // ── 3. 应用保存过的拖动顺序 ──
  if (order && order.length) {
    const rank = new Map(order.map((id, i) => [id, i]));
    raw.sort((a, b) => {
      const ra = rank.get(a.id);
      const rb = rank.get(b.id);
      // 没在 order 里的（新磁贴）排到最后，保持它们之间的相对顺序
      if (ra === undefined && rb === undefined) return 0;
      if (ra === undefined) return 1;
      if (rb === undefined) return -1;
      return ra - rb;
    });
  }

  return raw;
}
