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
 *
 * ── 为什么存 nameKey 而不是 name ──
 *
 *   这份配置在【模块顶层】就被创建了。那个时刻 React 还没挂载、
 *   zustand store 还没初始化 —— 在这里调用 t() 会拿到错误的值，
 *   而且之后用户切语言也【不会重算】（模块只执行一次）。
 *
 *   所以配置里只放"注册名"，真正的文字等渲染时再取。
 *   和 Minecraft 的 lang 文件是同一个思路：代码只认注册名。
 *
 * ⚠️⚠️ 由此带来一个连锁影响：下面 buildAlphaGroups() 是按"显示名"
 *    的首字母分组的，不能再读 nameKey（那会全是 "A"）。
 *    它现在接收一个 getName 回调，由调用方传入当前语言的取名函数。
 */

/** 左侧列表里的一个条目 */
export interface MenuItem {
  /** 唯一标识 */
  id: string;

  /** 显示名称在词典里的 key，例如 "app.notepad" */
  nameKey: string;

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
    nameKey: "app.notepad",
    icon: "/icons/notepad.png",
    url: "/posts",
  },
  {
    id: "recent-explorer",
    nameKey: "app.thisPC",
    icon: "/icons/pc.png",
    url: "/archive",
  },
  {
    id: "recent-settings",
    nameKey: "app.controlPanel",
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
  { id: "app-archive", nameKey: "app.archive", icon: "📅", url: "/archive" },
  { id: "app-about", nameKey: "app.aboutMe", icon: "👤", url: "/about" },
  { id: "app-bilibili", nameKey: "app.bilibili", icon: "📺", url: "https://www.bilibili.com" },
  { id: "app-browser", nameKey: "app.browser", icon: "/icons/browser.png", url: "/about" },
  { id: "app-control", nameKey: "app.controlPanel", icon: "/icons/control.png", url: "/settings" },
  { id: "app-github", nameKey: "app.github", icon: "🐙", url: "https://github.com" },
  { id: "app-notepad", nameKey: "app.notepad", icon: "/icons/notepad.png", url: "/posts" },
  { id: "app-posts", nameKey: "app.posts", icon: "📚", url: "/posts" },
  { id: "app-recycle", nameKey: "app.recycleBin", icon: "/icons/recycle.png", url: "/drafts" },
  { id: "app-search", nameKey: "app.search", icon: "🔍", url: "/search" },
  { id: "app-tags", nameKey: "app.tags", icon: "#️⃣", url: "/tags" },
];

/** 首字母分区：{ letter: "A", items: [...] } */
export interface AlphaGroup {
  letter: string;
  items: MenuItem[];
}

/**
 * 把条目按首字母分组并排序。
 *
 * ⚠️⚠️ 它【必须】接收一个 getName 回调，不能自己去读 item.nameKey。
 *
 *    因为 nameKey 长这样："app.notepad"、"app.controlPanel" ——
 *    每个都以 "app." 开头，首字母全是 "a"。
 *    直接拿它分组的结果是：十一条应用全挤在 "A" 区里，其余字母一个没有。
 *
 *    传入 t() 之后，分组和排序都基于【当前语言的实际显示名】：
 *      中文 → 全部归 "#"（见下方说明）
 *      英文 → Notepad 进 N 区、Control Panel 进 C 区…
 *    也就是说切语言时，字母索引会跟着重排 —— 这才是想要的行为。
 *
 *    参数给了个默认值（用 key 兜底），只是为了调用方漏传时不至于崩。
 */
export function buildAlphaGroups(
  items: MenuItem[] = ALL_APPS,
  getName: (item: MenuItem) => string = (item) => item.nameKey,
): AlphaGroup[] {
  const buckets = new Map<string, MenuItem[]>();

  for (const item of items) {
    const explicit = item.letter;
    const first = getName(item).trim()[0] ?? "#";

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
    items: [...buckets.get(letter)!].sort((a, b) => getName(a).localeCompare(getName(b), "zh")),
  }));
}
