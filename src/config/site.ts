/**
 * ════════════════════════════════════════════════════════════════
 *  站点信息配置 —— 你要改「关于我」「找到我」都只改这一个文件
 * ════════════════════════════════════════════════════════════════
 *
 * 这个文件被三个地方共用：
 *   1. 静态「关于」页        src/pages/about.astro
 *   2. 窗口版「关于」视图     src/components/window/views/AboutView.tsx
 *   3. 浏览器窗口的「找到我」 src/components/window/views/BrowserView.tsx
 *
 * 所以改一次，三处同时生效 —— 不会出现"网页上改了、窗口里还是旧的"。
 *
 * ── 图标怎么放？有两条路，按优先级自动选 ──
 *
 *   iconUrl  填了就用它（互联网地址，最灵活）
 *   icon     没填 iconUrl 时用它（本地文件，看图见下）
 *
 *   ⚠️ 优先用本地的。远程图标虽然灵活，但那个站哪天改了路径或挂了，
 *      你页面上的图标就白了，而你自己完全没动过代码 —— 很难排查。
 *      本地图标跟着你的仓库走，永远不会失效。
 *
 * ── 本地图标文件在哪？──
 *
 *   public/icons/social/<icon>.svg
 *
 *   现在仓库里已经放好了这几张：
 *     github  rss  email  sitemap  bilibili  youtube
 *     discord  x  twitter
 *
 *   想加一个新平台（比如 知乎 / 微博）：
 *     ① 去 https://simpleicons.org 搜平台名
 *     ② 下载 SVG，存成 public/icons/social/<名字>.svg
 *     ③ 在下面 SOCIALS 里加一项，icon 填 <名字>
 *   ⚠️ 名字要和文件名【完全一致】，包括大小写。写错了图标就是空白，
 *      不报错 —— 因为 <img src> 加载失败本来就是静默的。
 */

/** 头像和昵称、简介 */
export interface SiteProfile {
  /** 昵称。显示在「关于」页的标题位置 */
  name: string;

  /**
   * 一句话简介，会显示在昵称下面。
   * 想换行就写多个字符串，每个字符串是一段。
   */
  bio: string[];

  /**
   * 头像图片来源。三条路，按优先级：
   *
   *   1. avatarUrl   互联网地址，比如
   *                  "https://avatars.githubusercontent.com/u/12345?v=4"
   *   2. avatar      本地文件，放在 public/ 下，比如 "/avatar.jpg"
   *   3. emoji       都不填时用它兜底，比如 "👤"
   *
   * ⚠️ 用了 avatarUrl 之后，如果那个图挂了会显示成空白圆圈。
   *    想稳一点就把图片下载到 public/ 里用 avatar。
   */
  avatarUrl?: string;
  avatar?: string;
  emoji?: string;
}

export const PROFILE: SiteProfile = {
  name: "你好，我是站长",

  bio: [
    "这里是一个把博客做成了 Windows 10 桌面的地方。双击图标开窗口，任务栏切换窗口，开始菜单里是真实的分类和标签。",
    "界面看起来像个壳，但每一篇文章都有独立的静态页 —— 体验归体验，内容归内容。",
  ],

  // 想用网络头像就填这一行（下面这个是示例，换成你自己的图片直链）：
  // avatarUrl: "https://avatars.githubusercontent.com/u/9919?s=200&v=4",
  //
  // 或者把图片放进 public/ 目录，然后写：
  // avatar: "/avatar.jpg",

  // 上面两个都没填时显示这个
  emoji: "👤",
};

/** 一条社交链接 */
export interface SocialLink {
  /** 平台名字，显示在链接上 */
  name: string;

  /** 悬停时的小标签，比如「源码」「订阅」 */
  note?: string;

  /**
   * 点击后去哪。
   *
   *   https://…   外链，会在新标签页打开
   *   mailto:…    发邮件
   *   /rss.xml    站内路径，会在当前标签页打开
   *
   * ⚠️ 站内路径（以 / 开头）不会新开标签页 —— 这也是预期的，
   *    点「RSS 订阅」应该留在站内看 XML，而不是弹一个新窗口。
   */
  href: string;

  /** 本地图标文件名（不带 .svg）。见文件顶部说明 */
  icon?: string;

  /** 互联网图标地址。填了就优先用它，忽略 icon */
  iconUrl?: string;

  /**
   * 图标底色。填了就显示成「彩色方块 + 白色图标」的样子。
   * 不填则显示成「透明底 + 品牌原色图标」。
   *
   * ⚠️ 本地的品牌 SVG 自带品牌色（GitHub 黑、B站蓝），
   *    放在彩色方块上会和底色打架，所以默认不填。
   */
  bg?: string;

  /**
   * 设为 true 就从页面上隐藏，但配置还留着。
   * 比直接删掉方便 —— 想恢复时改一个字就行，不用翻 git 历史。
   */
  hidden?: boolean;
}

/**
 * ⚠️⚠️ 数组里的【顺序】就是页面上的显示顺序，从上到下、从左到右。
 *
 *     把最想让别人点的放前面。现在的顺序是：
 *     站内入口（RSS / 站点地图）→ 代码（GitHub）→ 内容平台 → 即时通讯
 *
 * ⚠️ 每一项的 href 现在都是占位的（指向各平台首页）。
 *    记得换成你自己的主页地址，比如
 *      https://space.bilibili.com/你的UID
 *      https://www.youtube.com/@你的频道
 */
export const SOCIALS: SocialLink[] = [
  { name: "GitHub", href: "https://github.com", note: "源码", icon: "github" },
  { name: "RSS", href: "/rss.xml", note: "订阅", icon: "rss" },
  { name: "Email", href: "mailto:me@example.com", note: "联系", icon: "email" },
  { name: "Sitemap", href: "/sitemap.xml", note: "站点地图", icon: "sitemap" },

  // ── 下面这些是这一阶段新加的占位符，换成你自己的主页地址就能用 ──
  { name: "Bilibili", href: "https://space.bilibili.com/", note: "视频", icon: "bilibili" },
  { name: "YouTube", href: "https://www.youtube.com/@", note: "频道", icon: "youtube" },
  { name: "Discord", href: "https://discord.com/users/", note: "社群", icon: "discord" },
  { name: "X", href: "https://x.com/", note: "动态", icon: "x" },
  { name: "Twitter", href: "https://twitter.com/", note: "旧号", icon: "twitter" },
];

/* ════════════════════════════════════════════════════════════════
   下面是给代码用的工具函数，你一般不用动
   ════════════════════════════════════════════════════════════════ */

/**
 * 解析出「最终该显示哪张图」。
 *
 * ⚠️ 返回 null 表示"没有图，用 emoji 兜底" ——
 *    而不是返回一个空字符串。空字符串会变成 <img src="">，
 *    浏览器会当成"加载当前页面"再请求一次，白白多一个请求，
 *    而且可能把 HTML 当成图片解析失败、控制台报个莫名其妙的错。
 */
export function resolveAvatar(p: SiteProfile = PROFILE): string | null {
  return p.avatarUrl || p.avatar || null;
}

/** 滤掉标记了 hidden 的项，并确保 href 和 name 都填了 */
export function visibleSocials(list: SocialLink[] = SOCIALS): SocialLink[] {
  return list.filter((s) => !s.hidden && s.name && s.href);
}

/**
 * 社交链接的图标地址。
 *
 * 优先级：iconUrl > icon（本地） > null
 *
 * ⚠️ 拼本地路径时【必须】以 / 开头。写成 "icons/social/github.svg" 的话，
 *    在 /posts/xxx 这种二级页面下会变成 /posts/icons/social/github.svg，
 *    而首页 / 下又是对的 —— 典型的"首页看着正常，点进文章就裂了"。
 */
export function socialIconSrc(s: SocialLink): string | null {
  if (s.iconUrl) return s.iconUrl;
  if (s.icon) return `/icons/social/${s.icon}.svg`;
  return null;
}

/**
 * 是不是外链。外链才加 target="_blank"，
 * 站内的 /rss.xml 留在当前标签页。
 */
export function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/* ════════════════════════════════════════════════════════════════
   浏览器窗口里的「友情链接」—— 已搬到 config/links.ts
   ════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ 友情链接的定义【不在这里了】，都在 ./links.ts。
 *
 *    这一行为什么还留着：
 *      FRIEND_LINKS 原来就 export 自本文件，AboutView、SocialLinks.astro
 *      等地方已经按老路径 import 了。直接删掉会让那些引用编译失败。
 *
 *    保留转发，旧代码不用改一个字就能继续跑。
 *    新代码请从 "./links" 引 —— 那边有 visibleFriendLinks() 等新工具。
 *
 *    ⚠️ 想彻底删掉这一行的话，先全仓库搜一遍
 *       `from ".*config/site"` 里有没有人拿 FRIEND_LINKS，
 *       确认干净了再删。
 */
export { FRIEND_LINKS, visibleFriendLinks, friendAvatarSrc } from "./links";
export type { FriendLink } from "./links";

