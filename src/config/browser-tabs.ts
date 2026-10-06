/**
 * 浏览器窗口的标签页登记表
 * ================================================================
 *
 * 「浏览器」窗口里那一排标签页（友情链接 / 找到我 / 使用教程）
 * 全部来自这张表。
 *
 * ── 为什么要有这张表？ ──
 *
 *   以前这三个标签是写死在 BrowserView.tsx 里的一个数组。
 *   想加一个标签页，得改组件文件 —— 而那个文件里还混着
 *   标签栏、地址栏、前进后退等一堆渲染逻辑。
 *   想改个标签名字，要在几百行 JSX 里找那个数组。
 *
 *   抽出来之后，「加一个标签页」= 在这个文件里加一条记录，
 *   不用碰任何 JSX。这也是教程 02 那篇要教的事。
 *
 * ── id 和 tab 的区别（重要） ──
 *
 *   id   给【代码】认的。BrowserView 靠它决定渲染哪个内容组件。
 *   tab  给【人】看的。只影响标签栏上显示的文字。
 *
 *   ⚠️ 改 tab 是安全的；改 id 必须同步改 BrowserView 里的分支，
 *      否则那个标签点开就是空白。
 *
 * ── 加新标签页的完整步骤 ──
 *
 *   1. 在这里加一条记录
 *   2. 在 src/components/window/views/browser/ 下写内容组件
 *   3. 在 BrowserView.tsx 里注册 id → 组件的映射
 *
 *   详见「使用教程」标签页里的《本浏览器如何添加和修改标签页》。
 */

export interface BrowserTab {
  /**
   * 唯一标识。浏览器窗口靠它决定显示哪个内容组件。
   *
   * ⚠️ 发布后不要改 —— 虽然它不进 URL，但如果以后要做
   *    「用地址栏直接跳到某个标签」，它就会被外部引用。
   *    现在改的话只要同步 BrowserView 就行。
   */
  id: string;

  /** 标签栏上显示的名字 */
  tab: string;

  /** 标签左边的小图标（emoji，和项目其它地方风格一致） */
  icon: string;

  /**
   * 地址栏里显示的字符串。
   *
   * ⚠️ 它【纯装饰】—— 只影响地址栏里那行文字，不参与任何逻辑。
   *    写真实域名是为了让它看起来像浏览器；
   *    在这个框里回车才会真的跳转（走 window.open）。
   *
   *    所以这里写 blog.example.com 是故意的，
   *    换成你自己的域名更好看。
   */
  url: string;

  /** 页面顶部标题下面那句说明 */
  desc: string;
}

/**
 * 标签页清单。**数组顺序 = 标签栏上的显示顺序。**
 *
 * ⚠️ 第一项是打开浏览器窗口时的默认标签页。
 *    把「友情链接」放第一个是有意的：它是这个窗口最常被看的东西。
 */
export const BROWSER_TABS: BrowserTab[] = [
  {
    id: "links",
    tab: "友情链接",
    icon: "🔗",
    url: "https://blog.example.com/links",
    desc: "这个博客一路上参考过的地方，推荐给同样在做个人站的朋友。",
  },
  {
    id: "social",
    tab: "找到我",
    icon: "👤",
    url: "https://blog.example.com/contact",
    desc: "想聊聊、想订阅、想看源码，从这里走。",
  },
  {
    id: "guide",
    tab: "使用教程",
    icon: "📖",
    url: "https://blog.example.com/guide",
    desc: "这个主题怎么用、怎么改，都写在这里。",
  },
];

/** 按 id 取标签页定义。找不到返回第一项，保证永远有东西可渲染 */
export function findTab(id: string | null | undefined): BrowserTab {
  return BROWSER_TABS.find((t) => t.id === id) ?? BROWSER_TABS[0];
}

/**
 * 标签页的序号（第几个）。
 *
 * 「后退 / 前进」按钮用它判断边界 —— 这也就是为什么
 * 那两个按钮在第一个/最后一个标签时会置灰。
 *
 * ⚠️ 这个「前进后退 = 在标签间左右移动」的做法是【有意的简化】，
 *    不是真的 history 栈。详见 BrowserView 里的说明。
 */
export function tabIndex(id: string): number {
  return BROWSER_TABS.findIndex((t) => t.id === id);
}
