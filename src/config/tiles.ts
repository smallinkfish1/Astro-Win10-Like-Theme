/**
 * 开始菜单磁贴配置
 * ================================================================
 *
 * 这是开始菜单右侧磁贴区的「唯一配置入口」。
 * 想加一个磁贴、换图标、改颜色、调整大小 —— 只改这个文件。
 *
 * 改完需要【重启 dev server】吗？不需要，保存后热更新就会生效。
 */

/**
 * 磁贴尺寸。
 *
 * ⚠️ 尺寸名字和占格数的对应关系（改代码前先看这行）：
 *
 *   "sm"    1×1   小正方形        76×76
 *   "wide"  2×1   宽扁形（横跨）  158×76
 *   "md"    1×2   竖高形（竖跨）  76×158
 *   "lg"    2×2   大正方形        158×158
 *
 * 为什么用 "sm"/"wide"/"md"/"lg" 这种名字，而不是 "1x1"/"2x1"？
 *   因为「2×1」到底是「宽 2 格高 1 格」还是「宽 1 格高 2 格」，
 *   每个看到的人都可能理解成不同意思，写错一次就是半天找 bug。
 *   wide（宽）/ md（中）这样的语义名没有歧义。
 */
export type TileSize = "sm" | "wide" | "md" | "lg";

/** 每种尺寸占几列几行 */
export const SIZE_SPAN: Record<TileSize, { colSpan: number; rowSpan: number }> = {
  sm: { colSpan: 1, rowSpan: 1 },
  wide: { colSpan: 2, rowSpan: 1 },
  md: { colSpan: 1, rowSpan: 2 },
  lg: { colSpan: 2, rowSpan: 2 },
};

/**
 * 磁贴内容的呈现方式。
 *
 *   "app"     图标在左下 + 文字（Win10 默认样式）
 *   "image"   整块铺一张图，文字压在底部渐变上（游戏封面那种）
 *   "live"    实时磁贴：内容由组件动态渲染（日期、天气等），见 startMenu.ts
 */
export type TileKind = "app" | "image" | "live";

export interface TileConfig {
  /** 唯一标识。同一 id 出现两次，后者会被忽略（控制台会警告） */
  id: string;

  /**
   * 磁贴文字在词典里的 key。用于【内置磁贴】——
   * 也就是手写在下面 TILE_GROUPS 里的这些。建议语义清晰，如 "app.notepad"。
   *
   * ⚠️ 与 label 二选一，理由见下。
   */
  labelKey?: string;

  /**
   * 磁贴文字的字面量。【自动生成】的磁贴用这个 ——
   * 也就是 lib/tiles.ts 里把文章的分类 / 标签追加成磁贴的那部分。
   *
   * ⚠️⚠️ 为什么它们不能也用 labelKey？
   *
   *    因为分类名（"前端"）和标签名（"Astro"）来自【文章内容】，
   *    不是界面文案 —— 切语言时它们本来就不该变。
   *    硬把它们当 key 去查词典，查不到，磁贴上会显示一片空白。
   *
   *    所以这两个字段的存在本身就是一条边界：
   *      labelKey → 界面文案，跟着语言变
   *      label    → 内容，永远是原文
   *
   *    渲染端（Tile.tsx）按 labelKey 优先取。
   */
  label?: string;

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
   * 内容类型。不写默认 "app"。
   *
   * "image" 时必须同时给 `image` 字段，否则会退化成 "app" 并警告。
   */
  kind?: TileKind;

  /**
   * 图片型磁贴的封面图（kind: "image" 用）。
   * 放 public/ 下，写 "/images/xxx.jpg" 这种绝对路径。
   */
  image?: string;

  /**
   * 实时磁贴的动态内容类型（kind: "live" 用）。
   *
   *   "date"     今天的日期数字 + 星期（Win10 日历磁贴那种）
   *   "clock"    实时时钟
   *   "weather"  天气占位（没有真实数据源时显示示例值）
   */
  live?: "date" | "clock" | "weather";

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
 * ⚠️ 这些颜色是 Win10 开始菜单的经典色系，都是深色且高饱和。
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
 * 磁贴分组。
 *
 * ⚠️ 为什么要分组？
 *    你截图里的开始菜单是「Create / Play / Explore」三块，
 *    每块有个小标题，磁贴在里面各自从左上角开始排。
 *    不分组的话所有磁贴会连成一整片，找东西很费眼。
 *
 * ⚠️ 每一组是【独立排布】的 —— 组内从第 0 行第 0 列开始算坐标，
 *    组和组之间的网格不连续。所以一组的列数不够时，
 *    大磁贴会挤到下一行，而不会"借"用隔壁组的空位。
 */
export interface TileGroup {
  /** 分组标题在词典里的 key（如 "tile.group.create"） */
  titleKey: string;

  /**
   * 这一组有几列。
   *
   * ⚠️ 必须是偶数，否则 2 格宽的大磁贴会排不下 ——
   *    排不下时 layoutTiles 会警告并跳过它（磁贴凭空消失，很难查）。
   */
  columns?: number;

  tiles: TileConfig[];
}

/**
 * 磁贴分组 —— 你主要改的就是这里。
 *
 * 顺序 = 显示顺序。组内磁贴的排列顺序也是书写顺序。
 */
export const TILE_GROUPS: TileGroup[] = [
  {
    // 「创建」区：放和写作、内容相关的入口
    titleKey: "tile.group.create",
    columns: 4,
    tiles: [
      {
        id: "all-posts",
        labelKey: "app.posts",
        icon: "📚",
        path: "/posts",
        size: "lg", // 大磁贴，视觉重心
        color: "#2b579a",
      },
      {
        id: "calendar-live",
        labelKey: "app.archive",
        icon: "📅",
        path: "/archive",
        size: "lg",
        color: "#2b579a",
        // 实时磁贴：显示今天的日期和星期，见 startMenu.ts 里的说明
        kind: "live",
        live: "date",
      },
      {
        id: "notepad",
        labelKey: "app.notepad",
        icon: "/icons/notepad.png",
        path: "/posts",
        size: "wide", // 2×1 宽磁贴
        color: "#d35400",
      },
      {
        id: "tags",
        labelKey: "app.tags",
        icon: "#️⃣",
        path: "/tags",
        size: "sm",
        color: "#7a3b8f",
      },
    ],
  },
  {
    // 「玩」区：外部链接
    titleKey: "tile.group.play",
    columns: 4,
    tiles: [
      {
        id: "github",
        labelKey: "app.github",
        icon: "🐙",
        // 换成你自己的地址
        path: "https://github.com",
        size: "sm",
        color: "#40485a",
      },
      {
        id: "bilibili",
        labelKey: "app.bilibili",
        icon: "📺",
        path: "https://www.bilibili.com",
        size: "sm",
        color: "#c0392b",
      },
      {
        id: "photos",
        labelKey: "app.photos",
        icon: "🖼️",
        path: "/about",
        size: "wide",
        color: "#0e7c86",
      },
    ],
  },
  {
    // 「探索」区：站内导航
    titleKey: "tile.group.explore",
    columns: 4,
    tiles: [
      {
        id: "about",
        labelKey: "app.aboutMe",
        icon: "👤",
        path: "/about",
        size: "sm",
        color: "#27754a",
      },
      {
        id: "search",
        labelKey: "app.search",
        icon: "🔍",
        path: "/search",
        size: "sm",
        color: "#2b579a",
      },
      {
        id: "settings",
        labelKey: "app.controlPanel",
        icon: "/icons/control.png",
        path: "/settings",
        size: "wide",
        color: "#40485a",
      },
    ],
  },
];

/**
 * 是否把文章的分类和标签自动追加成磁贴。
 *
 * 开启后，效果是：在【最后一个分组】的末尾追加
 *   [高频分类 2 个] → [高频标签 4 个]
 *
 * 为什么默认开启？
 *   因为分类和标签会随着你写文章自动变化，
 *   手动往上面 TILE_GROUPS 里加磁贴太麻烦了 —— 写一篇新分类的文章就得改一次配置。
 *   自动追加让它们永远跟着内容走。
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
 *    这个值要能塞进开始菜单右侧区域（总宽 640 - 左侧 260 = 380 左右）。
 *
 *    以现在的值算：4 × 76 + 3 × 6 = 322px，塞进 ~360px 的可用宽度刚好。
 *    如果你把 columns 改成 6，宽度会变成 486px —— 会溢出，右侧出现横向滚动条。
 */
export const GRID = {
  /** 小磁贴边长（px）。其它尺寸都是它的倍数加缝隙 */
  cell: 76,

  /** 磁贴之间的缝隙（px） */
  gap: 6,

  /** 网格默认列数。分组里没写 columns 时用这个 */
  columns: 4,
};
