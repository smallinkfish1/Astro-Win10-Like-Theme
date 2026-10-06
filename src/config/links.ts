/**
 * 一条友情链接。
 *
 * ⚠️ 字段命名从 icon 改成了 avatar，为什么？
 *
 *   因为「友链的图」和「社交平台的图」是两回事：
 *     社交平台图标  → 固定的那几个（GitHub、B站…），放 icons/social/
 *     友链的图      → 朋友的站头像，会一直增长，放 icons/links/
 *
 *   两者都用 icon 这个名字，读配置的人分不清这个 "icon" 到底指哪种。
 *   改成 avatar 之后，一眼就知道「这是对方的头像」。
 */
export interface FriendLink {
  /** 博客名 */
  name: string;
  /** 跳转地址 */
  url: string;
  /** 一句话介绍 */
  desc: string;

  /**
   * 本地头像文件名（要带扩展名），放在 public/icons/links/ 下。
   *
   * ⚠️ 只写文件名，不要写 "/icons/links/xxx.svg"。
   *    完整路径由 friendAvatarSrc() 拼 —— 手动写完整路径的话，
   *    在 /posts/xxx/ 这种二级页面下会变成 /posts/xxx/icons/links/...，
   *    直接 404。这是本项目踩过的坑，别再犯。
   */
  avatar?: string;

  /** 互联网头像地址。填了就优先用它 */
  avatarUrl?: string;

  /** 最后兜底：emoji 或首字母 */
  emoji?: string;

  /** 设为 true 则不显示（但配置留着） */
  hidden?: boolean;
}

/**
 * 友情链接清单。
 *
 * ⚠️ 下面这些是【示例数据】，url 请换成真实的友链地址。
 *
 * ── 头像怎么来？四级兜底，从高到低 ──
 *
 *   1. avatar      本地文件（最稳，不依赖网络）
 *   2. avatarUrl   互联网地址（灵活）
 *   3. 自动抓      从 url 推出域名，去取对方网站的 favicon（什么都不用填）
 *   4. emoji       兜底
 *
 *   所以最省事的写法是只填 name / url / desc 三个字段，
 *   图标会自动去对方网站取。
 *
 *   ⚠️ 但自动抓取依赖第三方服务（favicon 服务），
 *      对方挂了图标会退化成首字母。重要的友链建议用本地 avatar。
 */
export const FRIEND_LINKS: FriendLink[] = [
  {
    name: "Astro 官方文档",
    url: "https://docs.astro.build",
    desc: "本站的框架。内容优先、默认零 JS，和这个博客的思路一致。",
    // 不填 avatar / avatarUrl → 自动去 docs.astro.build 抓 favicon
  },
  {
    name: "MDN Web Docs",
    url: "https://developer.mozilla.org",
    desc: "查 CSS / JS 语法最权威的地方，写这个桌面时开得最多的一个站。",
  },
  {
    name: "React 中文文档",
    url: "https://zh-hans.react.dev",
    desc: "窗口、任务栏、开始菜单这些交互岛都是 React 写的。",
  },
  {
    name: "Tailwind CSS",
    url: "https://tailwindcss.com",
    desc: "整个项目的样式都在 className 里，没写过一行独立样式表。",
  },
];

/* ────────────────────────────────────────────────────────────
   头像地址解析
   ──────────────────────────────────────────────────────────── */

/** 本地头像目录。改这里就能换存放位置（记得同步目录本身） */
const LOCAL_AVATAR_DIR = "/icons/links";

/**
 * 自动抓 favicon 的服务地址。
 *
 * ⚠️ 把它抽成常量，是为了「想关掉的时候只改一行」。
 *
 *    关掉的办法：把这里改成 null，friendAvatarSrc() 就会跳过
 *    第 3 级兜底，直接落到 emoji —— 那时候所有友链要么配本地图，
 *    要么配 avatarUrl，都不会再经过第三方。
 *
 *    为什么要留这个开关：这条路径会把「访客看了哪些友链」
 *    暴露给第三方服务。如果你在意隐私，或者那个服务不稳定，
 *    就把它关掉。
 */
const FAVICON_SERVICE: string | null = "https://favicon.run/favicon";

/**
 * 从 URL 里抠出域名。
 *
 *    "https://docs.astro.build/foo?x=1"  → "docs.astro.build"
 *
 * ⚠️ 用 URL 构造函数而不是正则。
 *    正则处理协议、端口、认证信息（user:pass@host）这些情况
 *    会写出很长的表达式，而且容易漏。
 *    URL 是浏览器和 Node 都有的标准 API，交给它更可靠。
 *
 * ⚠️ 解析失败要返回 null 而不是抛异常 ——
 *    这个函数是在【渲染过程中】被调用的，抛出去会炸掉整个卡片列表。
 *    一条友链配错了，不该让整个页面挂掉。
 */
function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

/**
 * 算出一条友链最终该显示哪个头像地址。
 *
 * 返回 null 表示「没有图」—— 调用方应该退回 emoji / 首字母。
 *
 * ⚠️⚠️ 返回 null，而不是返回空字符串。
 *
 *    空字符串会变成 <img src="">，浏览器会把它当成
 *    「加载当前页面」再发一次请求 —— 白白多一次往返，
 *    而且控制台会多一条看不懂的报错。
 *    返回 null，调用方就知道「别渲染 img」。
 */
export function friendAvatarSrc(l: FriendLink): string | null {
  // 1. 本地文件优先 —— 最稳，不依赖任何外部服务
  if (l.avatar) {
    return `${LOCAL_AVATAR_DIR}/${l.avatar}`;
  }

  // 2. 手工指定的互联网地址
  if (l.avatarUrl) return l.avatarUrl;

  /*
    3. 自动抓 favicon。

    ⚠️ 这里在【渲染过程中】拼字符串，所以每次渲染都会算一遍。
       它是纯字符串操作（new URL + 模板拼接），
       开销远小于一次 React 重渲染，不需要缓存。
   */
  if (FAVICON_SERVICE) {
    const host = domainOf(l.url);
    if (host) {
      /*
        sz=64 —— 卡片上的头像显示尺寸在 32px 左右，
        请求 64 是留个 2 倍图，在高分屏上不会糊。

        ⚠️ 但实测这个服务对 sz 参数并不严格：
           请求 256 也可能返回 32×32。所以别指望拿到大图 ——
           需要高清就用本地 avatar。
      */
      return `${FAVICON_SERVICE}?domain=${encodeURIComponent(host)}&sz=64`;
    }
  }

  // 4. 交给 emoji / 首字母兜底
  return null;
}

/**
 * 过滤掉隐藏的和没填全的。
 *
 * ⚠️ 顺带把「没填 url」的也滤掉 —— 一条没有链接的友链卡片，
 *    点下去什么都不会发生，比不显示更让人困惑。
 */
export function visibleFriendLinks(list: FriendLink[] = FRIEND_LINKS): FriendLink[] {
  return list.filter((l) => !l.hidden && l.name && l.url);
}
