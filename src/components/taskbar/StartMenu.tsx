import { useWindowStore } from "../../store/windowStore";
import type { TagInfo } from "../window/views/TagsView";
import { buildTiles, isExternal, isImageIcon, type LaidOutTile } from "../../lib/tiles";
import { GRID } from "../../config/tiles";
import TileGrid from "./TileGrid";

/**
 * 左侧快捷入口。
 *
 * ⚠️ 这里的 id / icon 必须和 Desktop.astro、WindowManager 的 ICON_ROUTES 对上，
 *    尤其是 icon：现在指向 /icons/*.png，如果这边还写着 emoji，
 *    会出现「桌面上是图标，开始菜单里是 emoji」这种不统一。
 *    下面用 <Icon> 渲染，两边共用同一套 isImageIcon 规则，就不会跑偏。
 */
const QUICK_LINKS = [
  { id: "pc", label: "此电脑", icon: "/icons/pc.png", path: "/archive" },
  { id: "notepad", label: "记事本", icon: "/icons/notepad.png", path: "/posts" },
  { id: "browser", label: "浏览器", icon: "/icons/browser.png", path: "/about" },
  { id: "recycle", label: "回收站", icon: "/icons/recycle.png", path: "/drafts" },
  { id: "control", label: "控制面板", icon: "/icons/control.png", path: "/settings" },
];

export interface StartMenuProps {
  /** 真实分类，由 Astro 在构建期算好传进来 */
  categories: TagInfo[];
  /** 真实标签 */
  tags: TagInfo[];
}

export default function StartMenu({ categories, tags }: StartMenuProps) {
  const open = useWindowStore((s) => s.open);
  const setStartMenu = useWindowStore((s) => s.setStartMenu);

  /**
   * 点快捷方式：开窗口 + 收起菜单
   * 快捷方式都是站内路径，不用判断外链。
   */
  const goto = (item: { id: string; label: string; icon: string; path: string }) => {
    open({ id: item.id, title: item.label, icon: item.icon, path: item.path });
    if (window.location.pathname !== item.path) {
      window.history.replaceState({ path: item.path }, "", item.path);
    }
    setStartMenu(false);
  };

  /**
   * 点磁贴。
   *
   * 这里要分流：站内路径开窗口，外部链接走浏览器跳转。
   * 判断逻辑封装在 isExternal 里，配置里不用手动标记 ——
   * 少一个字段就少一处可能写错的地方。
   */
  const activateTile = (tile: LaidOutTile) => {
    if (isExternal(tile.path)) {
      // 外链：新标签页打开
      // noopener 是必须的：防止新页面通过 window.opener 操作本站
      window.open(tile.path, "_blank", "noopener,noreferrer");
      setStartMenu(false);
      return;
    }

    // 站内：开窗口
    open({
      id: tile.id,
      title: tile.label,
      icon: tile.icon,
      path: tile.path,
      // 大磁贴对应大一点的窗口，视觉上有关联
      ...(tile.size === "lg" ? { w: 860, h: 560 } : {}),
    });

    if (window.location.pathname !== tile.path) {
      window.history.replaceState({ path: tile.path }, "", tile.path);
    }
    setStartMenu(false);
  };

  /**
   * 合成磁贴列表。
   *
   * 注意这里【没有】读 localStorage —— 那是拖动排序阶段的事。
   * 这一阶段磁贴顺序完全由配置文件决定，先把这个跑通。
   */
  const tiles = buildTiles({ categories, tags });

  const externalCount = tiles.filter((t) => isExternal(t.path)).length;

  return (
    <div
      /**
       * ⚠️ data-startmenu 是给 Taskbar 的「点击外部关闭」判断用的。
       *
       *    开始菜单和任务栏是兄弟节点，不在任务栏的 DOM 里。
       *    Taskbar 在 capture 阶段监听 mousedown 来关闭菜单，
       *    如果没有这个标记，点磁贴会被误判成「点到了外面」，
       *    菜单在 mousedown 时就被关掉，磁贴随之卸载，
       *    后面的 click 事件永远到不了磁贴 —— 表现就是「点了没反应」。
       *
       *    别删这个属性。
       */
      data-startmenu
      /**
       * 材质 + 滑入动画。
       *
       * .acrylic      半透明底 + 背景模糊 + 饱和度增强（暗色自动适配）
       * .anim-menu    从下方 32px 处滑入 + 淡入，transform-origin 在左下角
       *
       * 为什么 transform-origin 要放左下角？
       * 因为开始菜单是从任务栏左下角的开始按钮那个位置"长"出来的，
       * 以左下角为原点缩放/位移，视觉上才有"从按钮弹出"的连贯感。
       * 默认的 center 原点会让它像是凭空浮现在屏幕中间。
       *
       * 动画关掉时 .no-anim 会把时长压到 0.01ms，视觉上等于没有动画，
       * 但动画事件照常触发 —— 这是有意为之，避免依赖动画结束的代码卡死。
       */
      className="acrylic anim-menu fixed bottom-[var(--taskbar-h)] left-0 z-[110] flex w-[640px]
                 max-w-[100vw] border border-[var(--acrylic-border)] text-[var(--fg-on-acrylic)]
                 shadow-[var(--acrylic-shadow)]"
    >
      {/* ── 左：快捷入口 ── */}
      <div className="flex w-[190px] shrink-0 flex-col py-3">
        <div className="px-4 pb-2 text-[11px] uppercase tracking-wide opacity-50">快捷方式</div>
        {QUICK_LINKS.map((l) => (
          <button
            key={l.id}
            onClick={() => goto(l)}
            className="flex items-center gap-3 px-4 py-2 text-left text-[12px]
                       transition-colors hover:bg-[var(--hover-invert)]"
          >
            {isImageIcon(l.icon) ? (
              <img src={l.icon} alt="" className="h-4 w-4 shrink-0 object-contain" />
            ) : (
              <span className="text-[16px] leading-none">{l.icon}</span>
            )}
            <span className="truncate">{l.label}</span>
          </button>
        ))}

        <div className="mt-auto px-4 pt-3 text-[10px] leading-relaxed opacity-45">
          双击桌面图标开窗口
          <br />
          Ctrl + 点击可开静态页
        </div>
      </div>

      {/* 分隔线 */}
      <div className="my-3 w-px shrink-0 bg-[var(--acrylic-border)]" />

      {/* ── 右：磁贴 ── */}
      <div className="startmenu-scroll min-w-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-3 flex items-baseline gap-2 text-[11px] uppercase tracking-wide opacity-50">
          磁贴
          <span className="normal-case tracking-normal opacity-80">
            {tiles.length} 个
            {externalCount > 0 && ` · ${externalCount} 个外链`}
          </span>
          <span className="ml-auto normal-case tracking-normal opacity-70">
            网格 {GRID.columns} 列 · {GRID.cell}px
          </span>
        </div>

        {/* 磁贴网格：绝对定位坐标系 + 手算 first-fit 排布 */}
        <TileGrid tiles={tiles} onActivate={activateTile} />

        <p className="mt-4 text-[10.5px] leading-relaxed opacity-40">
          磁贴来自 <code>src/config/tiles.ts</code>，分类和标签会自动追加。
          {externalCount > 0 && " 外链磁贴会在新标签页打开。"}
        </p>
      </div>
    </div>
  );
}
