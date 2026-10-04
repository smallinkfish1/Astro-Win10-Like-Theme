/**
 * 控制面板的分类清单
 * ================================================================
 *
 * 这个模块存在的唯一理由：**消灭两份手写数据**。
 *
 * 控制面板的分类名会出现在三个地方：
 *
 *   1. 窗口里左侧导航（ControlPanelView.tsx）
 *   2. 地址栏 / URL 里的路径段（WindowManager.ts，路由还原）
 *   3. 静态页路由（src/pages/settings/[...section].astro 的 getStaticPaths）
 *
 * 如果这三处各写一份数组，迟早会漂移。典型症状：
 *   左导航里能看到「更新日志」，但点进去 URL 变成 /settings/changelog2，
 *   静态页那边没有这个 section → 用户刷新 → 404。
 *   而且平时用窗口根本发现不了，因为窗口不刷新。
 *
 * 所以：**这里定义一次，三处都 import 它。**
 *
 * ⚠️ 这不是 Astro 专属文件，React 也能 import ——
 *    它没有任何依赖，纯数据 + 纯常量。刻意保持成零依赖，
 *    这样才能被浏览器端和构建端同时安全引用。
 */

export interface SettingsSection {
  /** URL 里的段名，也是窗口 id 的后半段：/settings/<id> */
  id: string;
  /** 左侧导航显示的名字 */
  name: string;
  /** 导航里的图标（emoji，和这个项目其它地方的图标风格一致） */
  icon: string;
  /** 一句话说明，静态页和导航悬浮提示都会用 */
  desc: string;
  /**
   * 是否已经实现。
   *
   * ⚠️ 用数据标记而不是在组件里 if (id === 'appearance') 判断。
   *    理由：这个字段同时驱动「右侧显示内容」和「导航项要不要置灰」，
   *    集中在一个字段上，就不会出现"导航看着能用、点进去是空的"。
   */
  ready: boolean;
}

/**
 * ⚠️⚠️ 顺序 = 显示顺序，而且 **第一项是打开控制面板时的默认页**。
 *    把「外观」放第一个是有意的：它是这个面板里唯一会被频繁使用的功能。
 *
 * ⚠️ id 一旦发布就不要改 —— 它会进入 URL（/settings/appearance），
 *    用户可能已经收藏或分享了。改名 = 旧链接 404。
 *    要改就同时加一条重定向，或者保留旧 id 只改 name。
 */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "appearance",
    name: "外观",
    icon: "🎨",
    desc: "壁纸、亮色/暗色模式、毛玻璃、动画与开始菜单配色。",
    ready: true,
  },
  {
    id: "about",
    name: "关于",
    icon: "ℹ️",
    desc: "这个桌面主题的技术栈、设计取舍与实现说明。",
    ready: true,
  },
  {
    id: "language",
    name: "语言",
    icon: "🌐",
    desc: "界面语言与地区格式。",
    ready: false,
  },
  {
    id: "changelog",
    name: "更新日志",
    icon: "📜",
    desc: "这个主题每个阶段做了什么。",
    ready: false,
  },
];

/** 默认分类（打开控制面板时落在哪一页） */
export const DEFAULT_SETTINGS_SECTION = SETTINGS_SECTIONS[0].id;

/**
 * 把任意输入规整成一个合法的分类 id。
 *
 * ⚠️ 返回默认值而不是 null —— 和 wallpaper.ts 的 findWallpaper 一个思路：
 *    调用方（路由还原）拿到 null 就要到处判空，忘了判就会出现
 *    "打开了一个标题为 undefined 的窗口"。
 *    给一个能用的默认值，降级永远是安全的。
 */
export function normalizeSection(id: string | null | undefined): string {
  return SETTINGS_SECTIONS.some((s) => s.id === id)
    ? (id as string)
    : DEFAULT_SETTINGS_SECTION;
}

/** 按 id 取分类定义（找不到回默认） */
export function findSection(id: string | null | undefined): SettingsSection {
  return SETTINGS_SECTIONS.find((s) => s.id === id) ?? SETTINGS_SECTIONS[0];
}
