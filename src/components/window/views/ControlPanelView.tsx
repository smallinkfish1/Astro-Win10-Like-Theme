import { useAppearance } from "../../../hooks/useAppearance";

/**
 * 控制面板 —— 博客外观设置。
 *
 * 现在有三项：暗色模式、毛玻璃、动画。
 * 后面还会加更多（壁纸、磁贴大小等），所以布局做成了「分组 + 条目」的形式，
 * 新增一项只要往 GROUPS 里加一条，不用改结构。
 *
 * ⚠️ 单项开关组件写成受控的（value + onChange），不要在里面存 state。
 *    因为真实数据源是 <html> 的 class，组件里再存一份就会不同步 ——
 *    典型症状是按浏览器后退键回到这个页面时，开关显示的状态是错的。
 */

/** 一行设置项：左边是标题+说明，右边是开关 */
function ToggleRow({
  title,
  desc,
  value,
  onChange,
}: {
  title: string;
  desc: string;
  value: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center gap-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-[var(--fg)]">{title}</div>
        <div className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--fg-faint)]">{desc}</div>
      </div>

      {/*
        Win10 的开关是「药丸形轨道 + 圆形滑块」。
        这里用 button 而不是 input[type=checkbox]：
        因为要完全控制视觉，原生 checkbox 在不同浏览器里长得不一样，
        重置样式的成本比直接画一个还高。

        无障碍靠 role="switch" + aria-checked 补齐 —— 这样屏幕阅读器
        依然能正确朗读成"开关，已开启"。
      */}
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={onChange}
        className={`relative h-[20px] w-[44px] shrink-0 rounded-full border transition-colors
                    duration-150
                    ${
                      value
                        ? "border-[var(--accent)] bg-[var(--accent)]"
                        : "border-[var(--surface-border)] bg-transparent"
                    }`}
      >
        <span
          className={`absolute top-[3px] h-[12px] w-[12px] rounded-full transition-all duration-150
                      ${value ? "left-[27px] bg-white" : "left-[3px] bg-[var(--fg-dim)]"}`}
        />
      </button>
    </div>
  );
}

/** 段落标题 */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mt-1 mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-faint)]">
      {children}
    </h4>
  );
}

export default function ControlPanelView() {
  const { theme, acrylic, anim, toggleTheme, toggleAcrylic, toggleAnim, reset } = useAppearance();

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      {/* ── 顶部说明 ── */}
      <section>
        <h3 className="mb-1 text-[15px] font-semibold text-[var(--fg)]">外观设置</h3>
        <p className="text-[12.5px] leading-relaxed text-[var(--fg-dim)]">
          这里的每一项都会立刻生效，并且保存在浏览器本地 —— 下次打开还记得。
        </p>
      </section>

      {/* ── 个性 ── */}
      <section className="border-t border-[var(--surface-border)] pt-2">
        <SectionTitle>个性化</SectionTitle>

        <ToggleRow
          title="暗色模式"
          desc="整个桌面、窗口、开始菜单都切换成暗色配色。"
          value={theme === "dark"}
          onChange={toggleTheme}
        />

        <ToggleRow
          title="毛玻璃效果"
          desc="任务栏和开始菜单的半透明模糊材质。关闭后改为不透明底色，在低配设备上更流畅。"
          value={acrylic}
          onChange={toggleAcrylic}
        />

        <ToggleRow
          title="界面动画"
          desc="窗口缩放、开始菜单滑入、磁贴悬停等动效。关闭后所有过渡立即完成。"
          value={anim}
          onChange={toggleAnim}
        />
      </section>

      {/* ── 说明 ── */}
      <section className="border-t border-[var(--surface-border)] pt-3">
        <SectionTitle>说明</SectionTitle>
        <ul className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed text-[var(--fg-faint)]">
          <li>
            · 首次访问时会自动跟随你系统的亮色/暗色偏好；一旦你手动设置过，就以你的选择为准。
          </li>
          <li>· 开启「界面动画」后，如果你系统里设置了「减少动态效果」，浏览器会优先尊重系统设置。</li>
          <li>· 设置存放在 localStorage，清除浏览器数据会重置。</li>
        </ul>
      </section>

      {/* ── 重置 ── */}
      <section className="mt-auto border-t border-[var(--surface-border)] pt-3">
        <button
          type="button"
          onClick={reset}
          className="rounded border border-[var(--surface-border)] px-3 py-1.5 text-[12px]
                     text-[var(--fg-dim)] transition-colors
                     hover:bg-[var(--hover)] hover:text-[var(--fg)]"
        >
          恢复默认设置
        </button>
      </section>
    </div>
  );
}
