import { useState, useMemo } from "react";
import { BROWSER_TABS, findTab, tabIndex } from "../../../config/browser-tabs";
import type { Guide } from "../../../lib/guide";
import BrowserLinks from "./browser/BrowserLinks";
import BrowserSocial from "./browser/BrowserSocial";
import BrowserGuide from "./browser/BrowserGuide";
import { useT } from "../../../i18n";

/**
 * 「浏览器」窗口 —— 一个套在桌面里的迷你浏览器。
 * ================================================================
 *
 * 为什么需要它？
 *   其它图标管的都是"站内"：此电脑看文章、记事本读原文、回收站看草稿、
 *   控制面板调外观。浏览器是唯一一个朝外的窗口 ——
 *   友情链接、我的社交主页、使用教程都住在这里。
 *
 * 结构完全照搬真实浏览器：
 *   标签页栏 → 地址栏（后退/前进/刷新 + 地址）→ 页面内容 → 状态栏
 *
 * ── 标签页从哪来 ──
 *
 *   src/config/browser-tabs.ts 里的 BROWSER_TABS。
 *   ⚠️ 这个文件里【没有】标签页清单 —— 加标签页去改那个配置，
 *      不用动这个组件。这正是本次重构的目的。
 *
 * ── 关于"后退/前进"的实现取舍 ──
 *
 *   真实浏览器有 history 栈，但这里的内容是【固定几页】的，
 *   不值得为它维护一个真正的栈。所以后退/前进实际上就是在
 *   这些 tab 之间移动 —— 行为上等价，代码少一个数量级。
 *   以后要做"从友情链接点进去看某个站"这种多级浏览，再换成真的栈。
 *
 * ── 内容组件在哪 ──
 *
 *   ./browser/ 目录下，一个标签页一个文件：
 *     BrowserLinks.tsx    友情链接
 *     BrowserSocial.tsx   找到我
 *     BrowserGuide.tsx    使用教程
 *
 *   这个文件只负责「外壳」（标签栏 / 地址栏 / 状态栏）和「该渲染哪个」。
 *   各标签页自己的数据来源和交互，都封在各自的组件里。
 */

export interface BrowserViewProps {
  /** 「使用教程」标签页的内容，来自 src/content/guide/*.md */
  guides: Guide[];
}

export default function BrowserView({ guides }: BrowserViewProps) {
  const { t } = useT();
  const [activeId, setActiveId] = useState(BROWSER_TABS[0].id);
  /** 地址栏允许手输，但只用于「看起来像浏览器」，回车会去真实跳转 */
  const [addr, setAddr] = useState(BROWSER_TABS[0].url);

  const active = useMemo(() => findTab(activeId), [activeId]);
  const activeIdx = tabIndex(activeId);

  /** 切页时同步地址栏 */
  const goto = (id: string) => {
    const tab = BROWSER_TABS.find((x) => x.id === id);
    if (!tab) return;
    setActiveId(id);
    setAddr(tab.url);
  };

  const step = (delta: number) => {
    const next = BROWSER_TABS[activeIdx + delta];
    if (next) goto(next.id);
  };

  /**
   * 按 id 渲染对应内容。
   *
   * ⚠️ 加新标签页时要【同时】做两件事：
   *      1. 在 config/browser-tabs.ts 加一条记录
   *      2. 在这里加一个 case
   *    漏了第 2 步的表现是：标签能点，但内容是空白。
   *
   *    之所以用 switch 而不是查表（Record<id, Component>），
   *    是因为 default 分支能把"漏加 case"变成一个可观察的空白，
   *    而不是静默渲染 undefined；写起来也更容易看出有哪些分支。
   */
  const renderContent = () => {
    switch (active.id) {
      case "links":
        return <BrowserLinks />;
      case "social":
        return <BrowserSocial />;
      case "guide":
        return <BrowserGuide guides={guides} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full flex-col bg-[var(--surface)]">
      {/* ── 1. 标签页栏 ── */}
      <div className="flex shrink-0 items-end gap-0.5 bg-[var(--surface-3)] px-1 pt-1">
        {BROWSER_TABS.map((tab) => {
          const on = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => goto(tab.id)}
              className={`flex max-w-[170px] items-center gap-1.5 rounded-t px-3 py-1.5 text-[11.5px]
                          transition-colors ${
                            on
                              ? "bg-[var(--surface)] font-medium text-[var(--fg)]"
                              : "text-[var(--fg-dim)] hover:bg-[var(--hover)]"
                          }`}
            >
              {/*
                ⚠️ 图标来自配置，不再是 `p.id === "links" ? "🔗" : "👤"` 这种写死的判断。
                   以前只有两个标签时那么写没问题；现在标签数量由配置决定，
                   那种 if 在加第三个标签时就会失效 ——
                   第三个标签会错误地显示第二个的图标。
              */}
              <span className="text-[11px] leading-none" aria-hidden="true">
                {tab.icon}
              </span>
              <span className="truncate">{tab.tab}</span>
            </button>
          );
        })}
        {/* 新标签页按钮：装饰，但让人一眼认出这是标签栏 */}
        <span
          className="mb-0.5 ml-1 grid h-5 w-5 place-items-center rounded text-[13px]
                     text-[var(--fg-faint)]"
          title={t("bv.newTab")}
          aria-hidden="true"
        >
          +
        </span>
      </div>

      {/* ── 2. 地址栏 ── */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--surface-border)] bg-[var(--surface)] px-2 py-1.5">
        <IconBtn label={t("bv.back")} disabled={activeIdx <= 0} onClick={() => step(-1)}>
          ←
        </IconBtn>
        <IconBtn
          label={t("bv.forward")}
          disabled={activeIdx >= BROWSER_TABS.length - 1}
          onClick={() => step(1)}
        >
          →
        </IconBtn>
        <IconBtn label={t("bv.refresh")} onClick={() => setAddr(active.url)}>
          ↻
        </IconBtn>

        <div className="flex flex-1 items-center gap-2 rounded-full border border-[var(--surface-border)]
                        bg-[var(--surface-2)] px-3 py-1">
          {/* 绿色的"安全"小锁，纯视觉 */}
          <span className="text-[10px] text-[#3f9c5a]" aria-hidden="true">
            🔒
          </span>
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            onKeyDown={(e) => {
              /*
                ⚠️ 只跳转 http(s)。没有这个判断的话，输入 "javascript:..."
                再回车就能执行脚本 —— 虽然最终只是 window.open，
                风险有限，但没必要给任何人留这条路。
              */
              if (e.key === "Enter" && /^https?:\/\//i.test(addr)) {
                window.open(addr, "_blank", "noopener,noreferrer");
              }
            }}
            className="no-drag flex-1 bg-transparent text-[11.5px] outline-none"
            aria-label={t("bv.address")}
            spellCheck={false}
          />
        </div>

        <IconBtn label={t("bv.favorite")} onClick={() => {}}>
          ☆
        </IconBtn>
      </div>

      {/* ── 3. 页面内容 ── */}
      <div className="win-body min-h-0 flex-1 overflow-y-auto">
        {/*
          ⚠️ 宽度策略按标签页区分：
             教程页是「左目录 + 右正文」两栏，限宽会挤成一团，所以撑满；
             另外两个是卡片列表，限宽居中更好看。

             判断放在这里而不是塞进子组件 ——
             子组件不该关心"我在多宽的容器里"，它只管画自己的卡片。
        */}
        <div
          className={active.id === "guide" ? "h-full px-4 py-4" : "mx-auto max-w-[560px] px-5 py-5"}
        >
          {active.id !== "guide" && (
            <>
              <h3 className="mb-1 text-[17px] font-semibold">{active.tab}</h3>
              <p className="mb-4 text-[11.5px] text-[var(--fg-dim)]">{active.desc}</p>
            </>
          )}

          {renderContent()}
        </div>
      </div>

      {/* ── 状态栏：让"浏览器"这件事更完整 ── */}
      <div className="flex shrink-0 items-center gap-3 border-t border-[var(--surface-border)]
                      bg-[var(--surface-2)] px-3 py-0.5 text-[10.5px] text-[var(--fg-faint)]">
        <span>{t("bv.statusBar")}</span>
        <span className="ml-auto">100%</span>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="grid h-6 w-6 shrink-0 place-items-center rounded text-[13px] text-[var(--fg-dim)]
                 transition-colors hover:bg-[var(--hover)] disabled:opacity-30
                 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
