/**
 * 开始菜单左侧导航栏配置
 * ================================================================
 *
 * 对应 Win10 开始菜单左边那一条窄栏：
 *
 *   ┌──────────────┐
 *   │ Recently added│  ← 顶部区：最近使用
 *   │  📄 Readme    │
 *   │  🖼 TakeOwn   │
 *   │ ──────────── │  ← 分割线
 *   │ Expand  ⌄    │  ← 字母索引开关
 *   │ A             │  ← 按首字母分组
 *   │  🧮 Calculator│
 *   │  📅 Calendar  │
 *   │ B             │
 *   │  ⌨ Bash       │
 *   └──────────────┘
 *
 * ⚠️ 这个文件和 src/config/tiles.ts 是【两个独立配置】：
 *    这个管左边（导航），那个管右边（磁贴）。
 *    互不影响，可以分开改。
 */

/** 左侧列表里的一个条目 */
export interface MenuItem {
  /** 唯一标识 */
  id: string;

  /** 显示名称 */
  name: string;

  /**
   * 图标。和磁贴一样支持三种写法：
   *   "🧮"                    emoji
   *   "/icons/pc.png"         本地图片（推荐，和桌面图标一致）
   *   "https://.../a.png"     远程图片
   */
  icon: string;

  /** 点击后去哪。站内开窗口，http 开头的新标签页打开 */
  url: string;

  /**
   * 分组用的首字母（A/B/C…）。
   * 不写的话自动从 name 的第一个字符推断。
   */
  letter?: string;
}

/**
 * 「最近添加」区。
 *
 * 一般放 2-3 个 —— 放太多就和下面的字母索引重复了，
 * 而且 Win10 原版这里就是很短的一小段。
 *
 * ⚠️ 现在写的是静态数据。想做成"真的最近"的话，
 *    在 StartMenu.tsx 里读 localStorage 里记录的最近点击记录替换掉即可。
 */
export const RECENTLY_ADDED: MenuItem[] = [
  {
    id: "recent-notepad",
    name: "记事本",
    icon: "/icons/notepad.png",
    url: "/posts",
  },
  {
    id: "recent-explorer",
    name: "此电脑",
    icon: "/icons/pc.png",
    url: "/archive",
  },
  {
    id: "recent-settings",
    name: "控制面板",
    icon: "/icons/control.png",
    url: "/settings",
  },
];

/**
 * 「所有应用」列表 —— 按首字母分区显示。
 *
 * ⚠️ 不要在这里手动分组、手动排序。
 *    下面 buildAlphaGroups() 会自动按 name 首字母分组并排序，
 *    你只管把条目一股脑列出来，顺序随便写。
 *
 *    手动排的坏处是：加一个条目就要重排一次，而且很容易漏掉。
 */
export const ALL_APPS: MenuItem[] = [
  { id: "app-archive", name: "归档", icon: "📅", url: "/archive" },
  { id: "app-about", name: "关于我", icon: "👤", url: "/about" },
  { id: "app-bilibili", name: "B站", icon: "📺", url: "https://www.bilibili.com" },
  { id: "app-browser", name: "浏览器", icon: "/icons/browser.png", url: "/about" },
  { id: "app-control", name: "控制面板", icon: "/icons/control.png", url: "/settings" },
  { id: "app-github", name: "GitHub", icon: "🐙", url: "https://github.com" },
  { id: "app-notepad", name: "记事本", icon: "/icons/notepad.png", url: "/posts" },
  { id: "app-posts", name: "最新文章", icon: "📚", url: "/posts" },
  { id: "app-recycle", name: "回收站", icon: "/icons/recycle.png", url: "/drafts" },
  { id: "app-search", name: "搜索", icon: "🔍", url: "/search" },
  { id: "app-tags", name: "标签", icon: "#️⃣", url: "/tags" },
];

/** 首字母分区：{ letter: "A", items: [...] } */
export interface AlphaGroup {
  letter: string;
  items: MenuItem[];
}

/**
 * 把条目按首字母分组并排序。
 *
 * ⚠️ 首字母怎么取？这里对中英文做了不同处理：
 *
 *    英文/数字  →  取首字符大写，比如 "GitHub" → "G"
 *    中文      →  取拼音首字母？
 *
 *    —— 不是。中文取拼音首字母需要一张完整的拼音表（几千个映射），
 *    为一个开始菜单引入这么大的数据不值得。
 *
 *    这里用的是【笔画数近似 + 统归到 "#"】的妥协方案：
 *    所有非 ASCII 开头的条目都归到 "#" 区，排在字母后面。
 *    这样至少不会出现"中文条目混在 A 和 B 中间"的怪现象，
 *    而且分组是稳定的。
 *
 *    如果你真的想要拼音排序，装一个 pinyin 库，
 *    把下面 letter 那行换成 pinyin(name[0]) 开头即可。
 */
export function buildAlphaGroups(items: MenuItem[] = ALL_APPS): AlphaGroup[] {
  const buckets = new Map<string, MenuItem[]>();

  for (const item of items) {
    const explicit = item.letter;
    const first = item.name.trim()[0] ?? "#";

    // ASCII 字母/数字 → 大写本身；其它（中文、符号）→ "#"
    const letter = (explicit ?? (/[a-zA-Z0-9]/.test(first) ? first.toUpperCase() : "#")).toUpperCase();

    if (!buckets.has(letter)) buckets.set(letter, []);
    buckets.get(letter)!.push(item);
  }

  /**
   * 排序规则：
   *   "#" 永远排最后（它是"其它"的意思，放中间会打断字母流）
   *   剩下的按字母序
   */
  const letters = [...buckets.keys()].sort((a, b) => {
    if (a === "#") return 1;
    if (b === "#") return -1;
    return a.localeCompare(b);
  });

  return letters.map((letter) => ({
    letter,
    // 组内也按名称排，保证顺序稳定可预期
    items: [...buckets.get(letter)!].sort((a, b) => a.name.localeCompare(b.name, "zh")),
  }));
}
