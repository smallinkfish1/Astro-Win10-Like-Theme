import { useState, useMemo, useRef, useEffect } from "react";
import { formatDate, readingTime, type ClientPost } from "../../../lib/markdown";

/**
 * 「记事本」窗口 —— 仿 Win10 Notepad 读文章。
 *
 * 和「此电脑」「浏览器」的分工：
 *   此电脑   → 用文件的方式*找*文章（列表、排序、分类）
 *   记事本   → 用纯文本的方式*读*文章（不渲染 Markdown，就是原文）
 *   浏览器   → 站在站外的视角（友情链接、社交主页）
 *
 * 为什么特意做个"不渲染"的阅读器？
 *   因为 Markdown 原文本身就是一种可读的东西，写作时看得最多的
 *   也是这一层。把它做成真实的记事本界面，等于给这个博客多开了一个
 *   「作者视角」的入口 —— 而且它天然能展示 frontmatter 的排版。
 *
 * 还原的细节：
 *   - 顶部菜单栏：文件 / 编辑 / 格式 / 查看 / 帮助
 *   - 「格式」菜单里可以勾选"自动换行"（真的能用，不是装饰）
 *   - 正文等宽字体、白底黑字、无行号，就是 Win10 记事本的样子
 *   - 左下角状态栏显示 行/列，会跟着光标动
 */

/**
 * 把文章的元信息重新拼成一段 YAML frontmatter。
 *
 * ⚠️ 这里有个容易想错的地方：
 *    「直接把 .md 文件的原始文本读出来显示」是做不到的。
 *    Astro 的 content collection 在构建期就把 frontmatter 解析掉了，
 *    entry.body 里【只剩正文】，--- 那一段已经不存在了。
 *    （想拿到原始文本得用 import.meta.glob 的 ?raw，那会额外打包
 *      一份完整的 .md 进产物，代价太大。）
 *
 *    所以这里换个思路：用已经解析好的结构化字段【反向拼回】YAML。
 *    好处是拿到的就是文章的真实元信息，对任何一篇文章都成立，
 *    而且不用多打一份包。
 */
function buildFrontmatter(a: ClientPost): string {
  const tags = a.tags.length ? `[${a.tags.map((t) => `"${t}"`).join(", ")}]` : "[]";
  return [
    "---",
    `title: ${a.title}`,
    `description: ${a.description || ""}`,
    `pubDate: ${a.pubDate.slice(0, 10)}`,
    `category: ${a.category}`,
    `tags: ${tags}`,
    ...(a.accent ? [`accent: "${a.accent}"`] : []),
    "---",
  ].join("\n");
}

export default function NotepadView({ posts }: { posts: ClientPost[] }) {
  /** 当前在读的文章。默认第一篇（最新的） */
  const [slug, setSlug] = useState<string>(posts[0]?.slug ?? "");
  const [wrap, setWrap] = useState(true);
  /** 菜单栏展开的是哪一项，null 表示都收起 */
  const [menu, setMenu] = useState<string | null>(null);

  /** 光标位置（行 / 列），状态栏用 */
  const [pos, setPos] = useState({ line: 1, col: 1 });
  /** 字号档位：Win10 记事本「格式 → 字体」给的就是这几档 */
  const [fontIdx, setFontIdx] = useState(1);
  const FONTS = [11, 12, 14, 16, 18];

  const areaRef = useRef<HTMLTextAreaElement>(null);

  const article = useMemo(
    () => posts.find((p) => p.slug === slug) ?? posts[0],
    [posts, slug]
  );

  /**
   * 记事本里显示的内容：元信息（拼回的 frontmatter）在最上面，
   * 后面接正文 —— 就是一个纯文本 .md 文件该有的样子。
   */
  const text = useMemo(() => {
    if (!article) return "";
    return `${buildFrontmatter(article)}\n\n${article.body}`;
  }, [article]);

  /** 点菜单外部就收起。用 pointerdown 而不是 click，手感更跟手 */
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest("[data-np-menu]")) setMenu(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);

  /** 跟随光标更新行列号 */
  const onSelect = () => {
    const el = areaRef.current;
    if (!el) return;
    const upto = el.value.slice(0, el.selectionStart);
    const line = upto.split("\n").length;
    const col = upto.length - upto.lastIndexOf("\n");
    setPos({ line, col });
  };

  /** 把光标前的文本读出来，切文章时重置到开头 */
  useEffect(() => {
    setPos({ line: 1, col: 1 });
    if (areaRef.current) areaRef.current.scrollTop = 0;
  }, [slug]);

  /** 上一篇 / 下一篇 —— 「查看」菜单里的"转到" */
  const goto = (delta: number) => {
    const i = posts.findIndex((p) => p.slug === slug);
    const next = posts[(i + delta + posts.length) % posts.length];
    if (next) setSlug(next.slug);
  };

  if (!article) {
    return (
      <div className="grid h-full place-items-center bg-white text-[12px] text-[#8a94a3]">
        记事本里还没有内容
      </div>
    );
  }

  /** 菜单定义。每一项要么执行一个动作，要么是纯展示项（disabled） */
  const MENUS: { name: string; items: { label: string; run?: () => void; check?: boolean }[] }[] = [
    {
      name: "文件",
      items: [
        { label: "新建", run: () => window.open("/posts", "_blank", "noopener") },
        {
          label: "在静态页打开 ↗",
          run: () => window.open(`/posts/${article.slug}`, "_blank", "noopener,noreferrer"),
        },
        { label: "—" },
        { label: "退出记事本", run: () => window.dispatchEvent(new CustomEvent("os:close-window")) },
      ],
    },
    {
      name: "编辑",
      items: [
        { label: "全选", run: () => areaRef.current?.select() },
        { label: "复制", run: () => navigator.clipboard?.writeText(text) },
        { label: "—" },
        { label: "查找…（用浏览器 Ctrl+F）" },
      ],
    },
    {
      name: "格式",
      items: [
        { label: "自动换行", check: wrap, run: () => setWrap((w) => !w) },
        { label: "—" },
        ...FONTS.map((f, i) => ({
          label: `字体 ${f}px`,
          check: i === fontIdx,
          run: () => setFontIdx(i),
        })),
      ],
    },
    {
      name: "查看",
      items: [
        { label: "上一篇", run: () => goto(-1) },
        { label: "下一篇", run: () => goto(1) },
      ],
    },
    {
      name: "帮助",
      items: [{ label: "关于记事本", run: () => window.open("/about", "_blank", "noopener") }],
    },
  ];

  /**
   * 当前这篇的"文件大小"。
   * 用 Blob 算真实字节数 —— 看着像不像记事本，很大程度靠这行小字。
   */
  const bytes = new Blob([text]).size;

  return (
    <div
      className="flex h-full flex-col bg-[var(--surface)]"
      onClick={() => setMenu(null)}
    >
      {/* ── 菜单栏 ── */}
      <div className="flex shrink-0 items-center border-b border-[var(--surface-border)] bg-[var(--surface-2)] px-1 text-[12px]">
        {MENUS.map((m) => (
          <div key={m.name} className="relative" data-np-menu>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenu((cur) => (cur === m.name ? null : m.name));
              }}
              onMouseEnter={() => setMenu((cur) => (cur ? m.name : cur))}
              className={`rounded px-2.5 py-1 transition-colors ${
                menu === m.name ? "bg-[var(--active)]" : "hover:bg-[var(--hover)]"
              }`}
            >
              {m.name}
            </button>

            {menu === m.name && (
              <div
                className="absolute left-0 top-full z-30 min-w-[190px] rounded-sm border
                           border-[var(--surface-border)] bg-[var(--surface)] py-1 shadow-lg"
              >
                {m.items.map((it, i) =>
                  it.label === "—" ? (
                    <div key={i} className="my-1 border-t border-[var(--surface-border)]" />
                  ) : (
                    <button
                      key={i}
                      type="button"
                      disabled={!it.run}
                      onClick={(e) => {
                        e.stopPropagation();
                        it.run?.();
                        setMenu(null);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1 text-left text-[12px]
                                 transition-colors hover:bg-[var(--accent)] hover:text-white
                                 disabled:cursor-default disabled:text-[var(--fg-faint)]
                                 disabled:hover:bg-transparent disabled:hover:text-[var(--fg-faint)]"
                    >
                      <span className="w-3 shrink-0 text-[10px]">{it.check ? "✓" : ""}</span>
                      <span className="truncate">{it.label}</span>
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        ))}

        {/* 右侧：快速切换文章的下拉 */}
        <select
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="no-drag ml-auto mr-1 max-w-[220px] rounded border border-[var(--surface-border)]
                     bg-[var(--surface)] px-1.5 py-0.5 text-[11px] outline-none"
          aria-label="切换文章"
        >
          {posts.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      {/* ── 正文：真的用 textarea，才能有"记事本"的编辑手感 ── */}
      <textarea
        ref={areaRef}
        value={text}
        readOnly
        spellCheck={false}
        wrap={wrap ? "soft" : "off"}
        onSelect={onSelect}
        onClick={onSelect}
        onKeyUp={onSelect}
        className="win-body min-h-0 flex-1 resize-none bg-[var(--surface)] p-3 font-mono
                   leading-[1.55] text-[var(--fg)] outline-none"
        style={{
          fontSize: `${FONTS[fontIdx]}px`,
          whiteSpace: wrap ? "pre-wrap" : "pre",
          overflowX: wrap ? "hidden" : "auto",
        }}
        aria-label={`${article.title} 的 Markdown 原文`}
      />

      {/* ── 状态栏 ── */}
      <div className="flex shrink-0 items-center gap-4 border-t border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-1 text-[11px] text-[var(--fg-dim)]">
        <span className="truncate">
          {article.title}
          <span className="ml-2 text-[var(--fg-faint)]">
            {formatDate(article.pubDate)} · {readingTime(article.body)}阅读
          </span>
        </span>
        <span className="ml-auto shrink-0 tabular-nums">
          第 {pos.line} 行，第 {pos.col} 列
        </span>
        <span className="shrink-0 text-[var(--fg-faint)]">
          {wrap ? "自动换行" : "不换行"} · {bytes} 字节
        </span>
      </div>
    </div>
  );
}
