import {
  TILE_GROUPS,
  PALETTE,
  AUTO_APPEND,
  GRID,
  SIZE_SPAN,
  type TileConfig,
  type TileSize,
  type TileGroup,
} from "../config/tiles";

/**
 * 磁贴数据层。
 *
 * 职责有三件：
 *   1. 把「手写配置」和「自动生成」两批数据合成完整磁贴列表
 *   2. 算出每个磁贴在网格里的坐标（first-fit 排布）
 *   3. 按分组切开，交给 UI 分组渲染
 *
 * ⚠️ 为什么坐标要在这里算，而不是交给 CSS Grid 自动排？
 *
 *   因为后面要做拖动排序。CSS Grid 的自动流（grid-auto-flow）在
 *   有跨格元素时是「按顺序填空」，它自己知道下一个洞在哪，
 *   但**不会告诉你**每个元素被放在了哪一行哪一列。
 *
 *   而拖动排序必须知道「你拖到了第几行第几列」才能算出新顺序。
 *   所以坐标必须是我们自己算出来的、可控的 —— 不能依赖浏览器的隐式布局。
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
  /** 实际用的内容类型 */
  kind: "app" | "image" | "live";
  /** 实际用的可拖动标记 */
  draggable: boolean;
  /** 是不是自动追加的（分类/标签），用于在 UI 上做个区分 */
  auto: boolean;
  /** 网格坐标 */
  pos: TilePosition;
}

/** 一个排好位置的分组 */
export interface LaidOutGroup {
  /** 分组标题的词典 key（如 "tile.group.create"） */
  titleKey: string;
  columns: number;
  tiles: LaidOutTile[];
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
 * 按顺序把磁贴放进网格（单组）。
 *
 * 策略是「第一个能放下的位置就放」（first-fit），扫描顺序是从左到右、
 * 从上到下。这正是 Win10 的行为：磁贴顺序决定位置，大磁贴把后面的往右挤。
 *
 * ⚠️ 宽磁贴（2×1）比大磁贴（2×2）更容易排不下：
 *    因为 2×2 在任何偶数行都能找到位置，而 2×1 需要「连续两个空列」。
 *    当奇数个 sm 排在宽磁贴前面时，会剩一个单列，宽磁贴就得换行。
 *    这是正常行为（Win10 也一样），不是 bug。
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
    // ⚠️ 尺寸 → 占格的换算统一走 SIZE_SPAN 表，不在这里写 if-else。
    //    以后再加尺寸（比如 4×2 的"横幅"）只需要改配置表。
    const { colSpan, rowSpan } = SIZE_SPAN[tile.size];

    // 宽度超过网格列数时，这个磁贴永远放不下 —— 直接报错说清楚
    if (colSpan > cols) {
      console.error(
        `[tiles] 磁贴 "${tile.id}" 宽 ${colSpan} 格，但这组只有 ${cols} 列，永远放不下。` +
          `请把它改小，或把这一组的 columns 调到 ${colSpan} 以上的偶数。`,
      );
      continue;
    }

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

/** 网格实际用了几行 —— 最后一行有磁贴的行号 + Span */
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
 * 把一批 TileConfig 补齐默认值 + 去重，变成可排布的磁贴。
 *
 * @param configs  原始配置
 * @param seen     跨组共享的去重集合 —— 同一 id 在两个组里出现时，后者被忽略
 * @param colorSeed 调色板起始下标，让各组取色不重复
 */
function normalize(
  configs: TileConfig[],
  seen: Set<string>,
  colorSeed: { n: number },
): Omit<LaidOutTile, "pos">[] {
  const out: Omit<LaidOutTile, "pos">[] = [];

  for (const cfg of configs) {
    if (seen.has(cfg.id)) {
      console.warn(`[tiles] 磁贴 id 重复，已忽略：${cfg.id}`);
      continue;
    }
    seen.add(cfg.id);

    const kind = cfg.kind ?? "app";

    // 图片型磁贴没给图 → 退化成普通磁贴，并明确警告（否则磁贴会是空的，很难查）
    if (kind === "image" && !cfg.image) {
      console.warn(`[tiles] 磁贴 "${cfg.id}" 声明了 kind:"image" 但没有 image 字段，已按普通磁贴渲染`);
    }

    out.push({
      ...cfg,
      size: cfg.size ?? "sm",
      color: cfg.color ?? PALETTE[colorSeed.n++ % PALETTE.length],
      kind: kind === "image" && !cfg.image ? "app" : kind,
      draggable: cfg.draggable ?? true,
      auto: false,
    });
  }

  return out;
}

/**
 * 合成完整的分组磁贴列表（含坐标）。
 *
 * 顺序是：
 *   1. 配置文件里的各分组（保持书写顺序）
 *   2. 自动追加的分类和标签 → 挂到【最后一个分组】末尾
 *
 * 如果传了 order（来自 localStorage 的拖动结果），就按那个顺序重排；
 * order 里没有的新磁贴会追加到末尾 —— 所以你新加一个磁贴时，
 * 它不会因为你之前拖过顺序就消失。
 *
 * ⚠️ order 是【跨组全局】的 id 序列。重排时按组内过滤，
 *    也就是说拖动排序只在同一组内生效，不会把磁贴拖到别的组去。
 *    这是有意的：分组是内容语义（Create/Play/Explore），
 *    不应该被一次误拖毁掉。
 */
export function buildTileGroups({
  categories,
  tags,
  order,
}: BuildOptions): LaidOutGroup[] {
  const seen = new Set<string>();
  const colorSeed = { n: 0 };

  // ── 1. 手写配置，逐组归一化 ──
  const groups: { titleKey: string; columns: number; tiles: Omit<LaidOutTile, "pos">[] }[] =
    TILE_GROUPS.map((g: TileGroup) => ({
      titleKey: g.titleKey,
      columns: g.columns ?? GRID.columns,
      tiles: normalize(g.tiles, seen, colorSeed),
    }));

  // ── 2. 自动追加分类和标签 → 挂到最后一组 ──
  if (AUTO_APPEND.enabled && groups.length > 0) {
    const autoConfigs: TileConfig[] = [];

    categories.slice(0, AUTO_APPEND.maxCategories).forEach((c) => {
      autoConfigs.push({
        id: `category:${c.name}`,
        label: c.name,
        icon: AUTO_APPEND.categoryIcon,
        path: `/category/${encodeURIComponent(c.name)}`,
        size: "sm",
      });
    });

    tags.slice(0, AUTO_APPEND.maxTags).forEach((t) => {
      autoConfigs.push({
        id: `tag:${t.name}`,
        label: t.name,
        icon: AUTO_APPEND.tagIcon,
        path: `/tags/${encodeURIComponent(t.name)}`,
        size: "sm",
      });
    });

    const lastGroup = groups[groups.length - 1];
    const auto = normalize(autoConfigs, seen, colorSeed);
    // 打上 auto 标记，UI 上可以做个区分
    auto.forEach((t) => (t.auto = true));
    lastGroup.tiles.push(...auto);
  }

  // ── 3. 应用保存过的拖动顺序（组内重排）──
  if (order && order.length) {
    const rank = new Map(order.map((id, i) => [id, i]));

    for (const g of groups) {
      g.tiles.sort((a, b) => {
        const ra = rank.get(a.id);
        const rb = rank.get(b.id);
        // 没在 order 里的（新磁贴）排到最后，保持它们之间的相对顺序
        if (ra === undefined && rb === undefined) return 0;
        if (ra === undefined) return 1;
        if (rb === undefined) return -1;
        return ra - rb;
      });
    }
  }

  // ── 4. 逐组排布坐标 ──
  return groups.map((g) => ({
    titleKey: g.titleKey,
    columns: g.columns,
    tiles: layoutTiles(g.tiles, g.columns),
  }));
}

/**
 * 兼容旧调用点：把所有分组的磁贴摊平成一维列表。
 *
 * ⚠️ 保留这个函数是为了让 verify.mjs / verify-tiles.mjs 那套
 *    「统计磁贴总数」的断言不用改。新代码请直接用 buildTileGroups。
 */
export function buildTiles(opts: BuildOptions): Omit<LaidOutTile, "pos">[] {
  return buildTileGroups(opts).flatMap((g) =>
    g.tiles.map(({ pos, ...rest }) => rest),
  );
}
