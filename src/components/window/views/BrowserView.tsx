import { useState, useMemo } from "react";

/**
 * 「浏览器」窗口 —— 一个套在桌面里的迷你浏览器。
 *
 * 为什么需要它？
 *   前四个图标管的都是"站内"：此电脑看文章、记事本读原文、回收站看草稿、
 *   控制面板调外观。浏览器是唯一一个朝外的窗口 ——
 *   友情链接、我的社交主页、订阅入口都住在这里。
 *
 * 结构完全照搬真实浏览器：
 *   标签页栏 → 地址栏（后退/前进/刷新 + 地址）→ 页面内容
 *
 * ⚠️ 关于"后退/前进"的实现取舍：
 *    真实浏览器有 history 栈，但这里的内容是【固定三页】的，
 *    不值得为它维护一个真正的栈。所以后退/前进实际上就是在
 *    这三个 tab 之间移动 —— 行为上是等价的，代码少一个数量级。
 *    如果我以后要做"从友情链接点进去看某个站"这种多级浏览，
 *    再换成真的 history 栈。
 *
 * ⚠️ 外链一律 target="_blank" + rel="noopener noreferrer"。
 *    少了 noopener，被打开的页面可以通过 window.opener 拿到
 *    我们这个页面的引用并改它的地址（钓鱼常用手法）。
 */

/** 浏览器里的一个"页面" */
interface Page {
  id: string;
  /** 标签页上显示的名字 */
  tab: string;
  /** 地址栏里显示的 URL —— 用真实域名，看着才像浏览器 */
  url: string;
  title: string;
}

const PAGES: Page[] = [
  {
    id: "links",
    tab: "友情链接",
    url: "https://blog.example.com/links",
    title: "友情链接",
  },
  {
    id: "social",
    tab: "找到我",
    url: "https://blog.example.com/contact",
    title: "找到我",
  },
];

/** 友情链接。把 href 换成朋友的域名即可 */
const LINKS: { name: string; url: string; desc: string; emoji: string }[] = [
  {
    name: "Astro 官方文档",
    url: "https://docs.astro.build",
    desc: "本站的框架。内容优先、默认零 JS，和这个博客的思路一致。",
    emoji: "🚀",
  },
  {
    name: "MDN Web Docs",
    url: "https://developer.mozilla.org",
    desc: "查 CSS / JS 语法最权威的地方，写这个桌面时开得最多的一个站。",
    emoji: "📖",
  },
  {
    name: "React 中文文档",
    url: "https://zh-hans.react.dev",
    desc: "窗口、任务栏、开始菜单这些交互岛都是 React 写的。",
    emoji: "⚛️",
  },
  {
    name: "Tailwind CSS",
    url: "https://tailwindcss.com",
    desc: "整个项目的样式都在 className 里，没写过一行独立样式表。",
    emoji: "🎨",
  },
];

/** 「找到我」这一页的内容 */
const SOCIALS: { name: string; handle: string; url: string; emoji: string }[] = [
  { name: "GitHub", handle: "github.com", url: "https://github.com", emoji: "🐙" },
  { name: "RSS 订阅", handle: "/rss.xml", url: "/rss.xml", emoji: "📡" },
  { name: "Email", handle: "me@example.com", url: "mailto:me@example.com", emoji: "✉️" },
  { name: "站点地图", handle: "/sitemap.xml", url: "/sitemap.xml", emoji: "🗺️" },
];

export default function BrowserView() {
  const [activeId, setActiveId] = useState(PAGES[0].id);
  /** 地址栏允许手输，但只用于「看起来像浏览器」，回车会去真实跳转 */
  const [addr, setAddr] = useState(PAGES[0].url);

  const active = useMemo(() => PAGES.find((p) => p.id === activeId) ?? PAGES[0], [activeId]);
  const activeIdx = PAGES.findIndex((p) => p.id === activeId);

  /** 切页时同步地址栏 */
  const goto = (id: string) => {
    const p = PAGES.find((x) => x.id === id);
    if (!p) return;
    setActiveId(id);
    setAddr(p.url);
  };

  const step = (delta: number) => {
    const next = PAGES[activeIdx + delta];
    if (next) goto(next.id);
  };

  return (
    <div className="flex h-full flex-col bg-[var(--surface)]">
      {/* ── 1. 标签页栏 ── */}
      <div className="flex shrink-0 items-end gap-0.5 bg-[var(--surface-3)] px-1 pt-1">
        {PAGES.map((p) => {
          const on = p.id === activeId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => goto(p.id)}
              className={`flex max-w-[170px] items-center gap-1.5 rounded-t px-3 py-1.5 text-[11.5px]
                          transition-colors ${
                            on
                              ? "bg-[var(--surface)] font-medium text-[var(--fg)]"
                              : "text-[var(--fg-dim)] hover:bg-[var(--hover)]"
                          }`}
            >
              <span className="text-[11px] leading-none" aria-hidden="true">
                {p.id === "links" ? "🔗" : "👤"}
              </span>
              <span className="truncate">{p.tab}</span>
            </button>
          );
        })}
        {/* 新标签页按钮：装饰，但让人一眼认出这是标签栏 */}
        <span
          className="mb-0.5 ml-1 grid h-5 w-5 place-items-center rounded text-[13px]
                     text-[var(--fg-faint)]"
          title="新建标签页（演示界面）"
          aria-hidden="true"
        >
          +
        </span>
      </div>

      {/* ── 2. 地址栏 ── */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--surface-border)] bg-[var(--surface)] px-2 py-1.5">
        <IconBtn label="后退" disabled={activeIdx <= 0} onClick={() => step(-1)}>
          ←
        </IconBtn>
        <IconBtn label="前进" disabled={activeIdx >= PAGES.length - 1} onClick={() => step(1)}>
          →
        </IconBtn>
        <IconBtn label="刷新" onClick={() => setAddr(active.url)}>
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
              if (e.key === "Enter" && /^https?:\/\//i.test(addr)) {
                window.open(addr, "_blank", "noopener,noreferrer");
              }
            }}
            className="no-drag flex-1 bg-transparent text-[11.5px] outline-none"
            aria-label="地址栏"
            spellCheck={false}
          />
        </div>

        <IconBtn label="收藏" onClick={() => {}}>
          ☆
        </IconBtn>
      </div>

      {/* ── 3. 页面内容 ── */}
      <div className="win-body min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[560px] px-5 py-5">
          <h3 className="mb-1 text-[17px] font-semibold">{active.title}</h3>
          <p className="mb-4 text-[11.5px] text-[var(--fg-dim)]">
            {active.id === "links"
              ? "这个博客一路上参考过的地方，推荐给同样在做个人站的朋友。"
              : "想聊聊、想订阅、想看源码，从这里走。"}
          </p>

          {active.id === "links" ? (
            <ul className="flex flex-col gap-2">
              {LINKS.map((l) => (
                <li key={l.url}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="no-drag flex items-start gap-3 rounded border border-[var(--surface-border)]
                               bg-[var(--surface-2)] p-3 transition-colors
                               hover:border-[var(--accent)] hover:bg-[var(--surface-3)]"
                  >
                    <span className="text-[20px] leading-none" aria-hidden="true">
                      {l.emoji}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-[13px] font-medium">
                        {l.name}
                        <span className="text-[10px] text-[var(--accent)]">↗</span>
                      </span>
                      <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--fg-dim)]">
                        {l.desc}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {SOCIALS.map((s) => (
                <li key={s.name}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="no-drag flex items-center gap-3 rounded border border-[var(--surface-border)]
                               bg-[var(--surface-2)] p-3 transition-colors
                               hover:border-[var(--accent)] hover:bg-[var(--surface-3)]"
                  >
                    <span className="text-[20px] leading-none" aria-hidden="true">
                      {s.emoji}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-medium">{s.name}</span>
                      <span className="block truncate text-[11px] text-[var(--fg-dim)]">
                        {s.handle}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── 状态栏：让"浏览器"这件事更完整 ── */}
      <div className="flex shrink-0 items-center gap-3 border-t border-[var(--surface-border)]
                      bg-[var(--surface-2)] px-3 py-0.5 text-[10.5px] text-[var(--fg-faint)]">
        <span>演示页面 · 外链均在新标签页打开</span>
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
