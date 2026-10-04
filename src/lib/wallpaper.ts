/**
 * 壁纸清单 + 读写
 * ================================================================
 *
 * 这是「控制面板 → 外观 → 壁纸」的数据源。
 *
 * ── 为什么壁纸用 data 属性，而不是 class？ ──
 *
 *   已有的四个外观开关（暗色 / 毛玻璃 / 动画 / 开始菜单深色）都是
 *   「一个维度、非开即关」，所以用 class 很自然：有类=开，没类=关。
 *
 *   但壁纸不一样，它是「多选一」，而且要和亮色/暗色【正交组合】：
 *
 *       亮色 + 极光      → /wallpapers/aurora.jpg
 *       暗色 + 极光      → /wallpapers/aurora-dark.jpg
 *
 *   如果走 class，就得写成 .wall-aurora、.wall-aurora.theme-dark、
 *   .wall-mountains、.wall-mountains.theme-dark…… 每加一张壁纸
 *   就多两条规则，是指数级的写法。
 *
 *   用属性就干净了：
 *       <html data-wallpaper="aurora" class="theme-dark">
 *   属性那一位说"哪张壁纸"，class 那一位说"亮还是暗"，
 *   两个维度各管各的，CSS 里就是一条选择器相乘，线性增长。
 *
 * ── 图片文件放哪儿 ──
 *
 *   public/ 目录下，按下面 FILE 里写的路径放。
 *   文件不存在也不会报错 —— 浏览器只是拿不到图，会露出兜底底色，
 *   而 WallpaperPicker 里那张卡片会显示「待补充」占位。
 *   所以你可以先把架子搭好，之后再一张张补图。
 */

/** localStorage 键名，和其他外观设置保持一致的前缀 */
const KEY_WALLPAPER = "win10-blog:wallpaper";

export interface WallpaperItem {
  /** 存进 localStorage / data-wallpaper 的值 */
  id: string;
  /** 控制面板里显示的名字 */
  name: string;
  /** 亮色版本 */
  light: string;
  /** 暗色版本 */
  dark: string;
  /** 缩略图预览用哪一张（留空则用 light） */
  thumb?: string;
}

/**
 * ⚠️ 顺序就是控制面板里的显示顺序，第一张是默认。
 *
 *   default 用的是仓库里已有的 /wallpaper.jpg 和 /wallpaper-dark.jpg
 *   （第六阶段就放进 public/ 了），所以它开箱即用。
 *   其余三张需要你往 public/wallpapers/ 里补图。
 */
export const WALLPAPERS: WallpaperItem[] = [
  {
    id: "default",
    name: "默认（Win10 蓝）",
    light: "/wallpaper.jpg",
    dark: "/wallpaper-dark.jpg",
  },
  {
    id: "aurora",
    name: "极光",
    light: "/wallpapers/aurora.jpg",
    dark: "/wallpapers/aurora-dark.jpg",
  },
  {
    id: "mountains",
    name: "山脉",
    light: "/wallpapers/mountains.jpg",
    dark: "/wallpapers/mountains-dark.jpg",
  },
  {
    id: "abstract",
    name: "抽象几何",
    light: "/wallpapers/abstract.jpg",
    dark: "/wallpapers/abstract-dark.jpg",
  },
];

/** 缺省值。故意和 getWallpaper() 的兜底保持一致，改一个必须改另一个 */
export const DEFAULT_WALLPAPER = "default";

/**
 * 按 id 找壁纸定义。
 *
 * ⚠️ 找不到时返回【第一张】而不是 null。
 *    因为 localStorage 里的值可能是旧版本留下的（比如我以后删掉了
 *    某张壁纸），这时候如果返回 null，调用方就得处理空指针，
 *    而且 <html data-wallpaper="已删除的id"> 会让 CSS 匹配不上任何规则
 *    → 壁纸直接消失（露出兜底底色），用户会以为坏了。
 *    回退到默认是更安全的降级。
 */
export function findWallpaper(id: string | null | undefined): WallpaperItem {
  return WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0];
}

/* ────────────────────────────────────────────────────────────
   读
   ──────────────────────────────────────────────────────────── */

export function getWallpaper(): string {
  if (typeof localStorage === "undefined") return DEFAULT_WALLPAPER;
  const saved = localStorage.getItem(KEY_WALLPAPER);
  // 只接受清单里真实存在的 id，其余一律回落默认
  return WALLPAPERS.some((w) => w.id === saved) ? (saved as string) : DEFAULT_WALLPAPER;
}

/* ────────────────────────────────────────────────────────────
   写
   ──────────────────────────────────────────────────────────── */

/**
 * 切换壁纸。
 *
 * ⚠️ 壁纸不加过渡动画，理由和毛玻璃一样：
 *    background-image 没法平滑过渡 —— 浏览器只会"啪"一下换掉。
 *    更糟的是，加上 transition 后浏览器还要为每帧维护两套图片解码，
 *    4K 壁纸下这一下能明显卡住。
 */
export function setWallpaper(id: string) {
  const safe = findWallpaper(id).id; // 非法 id 先规整成合法的
  document.documentElement.setAttribute("data-wallpaper", safe);
  localStorage.setItem(KEY_WALLPAPER, safe);
}

/**
 * 供 <head> 内联启动脚本用的纯函数版本（不碰 localStorage、不碰 DOM）。
 *
 * ⚠️ 为什么要单独来一个？
 *    那段启动脚本是在 <head> 里跑的内联字符串，它【不能 import】——
 *    它得在模块加载之前就执行完才能避免闪白。
 *    所以那边是用字符串硬拼的，判断逻辑必须和 getWallpaper() 一致。
 *    这里把这个"一致"变成可校验的：两边都调用同一个纯函数。
 *
 *    代价是这张 id 列表在启动脚本里被序列化了第二遍 —— 没办法，
 *    内联脚本的自包含性比"只写一遍"更重要。
 *    改动清单时记得两处一起改（下面 EXPORT_IDS 就是给测试对齐用的）。
 */
export const WALLPAPER_IDS = WALLPAPERS.map((w) => w.id);

/**
 * 生成 data-wallpaper 的 CSS 变量覆盖规则用的映射。
 *
 * ⚠️ 这个函数目前【只给文档/测试用】，样式本身是手写在 global.css 里的。
 *    为什么不在这里自动生成样式？因为 Tailwind 的构建期扫描看不到
 *    运行期拼出来的字符串，注入的规则会被 purge 掉 —— 那样比手写更脆。
 */
export function wallpaperVarMap(): Record<string, { light: string; dark: string }> {
  const out: Record<string, { light: string; dark: string }> = {};
  for (const w of WALLPAPERS) out[w.id] = { light: w.light, dark: w.dark };
  return out;
}
