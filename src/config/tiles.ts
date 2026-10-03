/**
 * 开始菜单磁贴配置
 * ================================================================
 *
 * 这是开始菜单右侧磁贴区的「唯一配置入口」。
 * 想加一个磁贴、换图标、改颜色、调整大小 —— 只改这个文件。
 *
 * 改完需要【重启 dev server】吗？不需要，保存后热更新就会生效。
 */

/** 磁贴尺寸：1×1 小正方形，2×2 大正方形 */
export type TileSize = "sm" | "lg";

export interface TileConfig {
  /** 唯一标识。同一 id 出现两次，后者会被忽略（控制台会警告） */
  id: string;

  /** 磁贴下方显示的文字，建议 6 个字以内，超出会换行 */
  label: string;

  /**
   * 图标。三种写法都支持：
   *   "📚"                        —— emoji，最省事
   *   "https://.../logo.png"      —— 图片 URL，会自动按 <img> 渲染
   *   "/icons/github.svg"         —— 放在 public/ 下的本地图片
   *
   * 判断逻辑很简单：以 http 开头或者包含 "/" 就当图片，否则当 emoji。
   */
  icon: string;

  /**
   * 点击后去哪。
   *   "/posts"                    —— 站内路径：开一个桌面窗口
   *   "https://bilibili.com"      —— 外部链接：新标签页打开
   *
   * 以 http:// 或 https:// 开头就判定为外链，这个判断在代码里自动做，
   * 你不用额外标记。
   */
  path: string;

  /** 尺寸。不写默认 "sm" */
  size?: TileSize;

  /**
   * 磁贴底色。不写的话从下方 PALETTE 里按顺序取一个，
   * 保证不会出现两个挨着的磁贴颜色一样。
   *
   * 建议写颜色时用深色 —— 磁贴上的文字是白色，浅色底会看不清。
   */
  color?: string;

  /**
   * 是否允许拖动排序。不写默认 true。
   * 想固定某个磁贴的位置（比如"最新文章"永远在最前），设成 false。
   */
  draggable?: boolean;
}

/**
 * 磁贴调色板。
 * 未指定 color 的磁贴会从这里按顺序取色。
 *
 * ⚠️ 这些颜色是 Win10 开始菜单的经典色系，都是深色。
 *    如果你要换成浅色，记得同时改 Tile.tsx 里的文字颜色，
 *    否则白字配浅底会看不见。
 */
export const PALETTE = [
  "#2b579a", // Win10 蓝（系统主色）
  "#7a3b8f", // 紫
  "#0e7c86", // 青
  "#c0392b", // 红
  "#d35400", // 橙
  "#27754a", // 绿
  "#40485a", // 石板灰
];

/**
 * 磁贴列表 —— 你主要改的就是这里。
 *
 * 顺序 = 显示顺序。拖动排序后，新顺序会存进 localStorage，
 * 下次打开开始菜单时按你拖过的顺序显示。
 *
 * 示例里放了 4 个，你可以随意增删。
 */
export const TILES: TileConfig[] = [
  {
    id: "all-posts",
    label: "最新文章",
    icon: "📚",
    path: "/posts",
    size: "lg", // 大磁贴，视觉重心
    color: "#2b579a",
  },
  {
    id: "github",
    label: "GitHub",
    icon: "🐙",
    // 换成你自己的地址
    path: "https://github.com",
    size: "sm",
    color: "#40485a",
  },
  {
    id: "bilibili",
    label: "B站",
    icon: "📺",
    path: "https://www.bilibili.com",
    size: "sm",
    color: "#c0392b",
  },
  {
    id: "about",
    label: "关于我",
    icon: "👤",
    path: "/about",
    size: "sm",
    color: "#27754a",
  },
];

/**
 * 是否把文章的分类和标签自动追加成磁贴。
 *
 * 开启后，效果是：
 *   [你配置的磁贴] → [高频分类 2 个] → [高频标签 4 个]
 *
 * 为什么默认开启？
 *   因为分类和标签会随着你写文章自动变化，
 *   手动往上面 TILES 里加磁贴太麻烦了 —— 写一篇新分类的文章就得改一次配置。
 *   自动追加让它们永远跟着内容走。
 *
 * 关掉的话，磁贴区就完全由上面的 TILES 决定。
 */
export const AUTO_APPEND = {
  /** 总开关 */
  enabled: true,

  /** 最多追加几个分类，按文章数倒序取 */
  maxCategories: 2,

  /** 最多追加几个标签，按文章数倒序取 */
  maxTags: 4,

  /** 自动磁贴的图标 */
  categoryIcon: "📂",
  tagIcon: "#️⃣",
};

/**
 * 磁贴网格的几何参数。
 *
 * ⚠️ 改这里之前先想清楚：网格宽度 = columns × cell + (columns-1) × gap。
 *    这个值要能塞进开始菜单右侧区域（左右两侧减去左侧 190px 快捷栏和分隔线）。
 */
export const GRID = {
  /** 小磁贴边长（px）。2×2 的大磁贴就是它的两倍再加一个缝隙 */
  cell: 76,

  /** 磁贴之间的缝隙（px） */
  gap: 6,

  /** 网格列数。必须是偶数，否则 2×2 的大磁贴会排不下 */
  columns: 4,
};
