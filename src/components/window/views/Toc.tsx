import { useEffect, useRef, useState } from "react";
import type { TocItem } from "../../../lib/markdown";

/**
 * 文章目录（TOC）侧栏。
 *
 * 长得像 Hexo / 大多数博客的右侧浮动目录：
 *   - 按标题层级缩进
 *   - 当前正在读的章节高亮
 *   - 点击平滑滚动过去
 *
 * ⚠️⚠️ 为什么高亮要用 IntersectionObserver 而不是监听 scroll？
 *
 *   监听 scroll 是最直觉的做法，但有两个坑：
 *
 *     1. 滚动事件触发频率极高（一次滚动几十次），
 *        每次都去 getBoundingClientRect() 会强制同步布局（layout thrashing），
 *        在本来就有 2.4 万个 DOM 节点的文章上等于雪上加霜。
 *
 *     2. 得自己算"哪个标题离顶部最近"——而"最近"的判定
 *        在不同滚动速度下表现不一致，容易出现高亮跳来跳去。
 *
 *   IntersectionObserver 是浏览器原生能力：它异步地告诉你
 *   "这些元素现在在不在视口里"，不需要我们自己算，也不阻塞滚动。
 *
 * ⚠️ 为什么用 rootMargin: "-10% 0px -70% 0px"？
 *    这四块值把"视口"重新划成了一个很窄的横条：
 *      上面裁掉 10%（避开顶部工具栏）
 *      下面裁掉 70%（只留中间偏上那一小段）
 *    只要标题进入这个横条，就认为"你正在读这一节"。
 *
 *    不这么划的话，多个标题会同时落在视口里，
 *    观察到的是"一批元素同时交叉"——那就分不清该高亮谁了。
 */

/**
 * 滚动容器的兜底选择器。
 *
 * ⚠️ 只在 scrollRef 拿到的元素【自己不可滚动】时才用得上。
 *    正常情况（ArticleView 把 ref 挂在 overflow-y-auto 的 <article> 上）
 *    会直接命中，不会走到这里。
 *
 *    保留这个兜底的场景：将来如果把 Toc 复用到别的视图，
 *    而那个视图的 ref 挂在了内层容器上 —— 就靠它向上找到真正的滚动祖先。
 */
const SCROLL_ROOT = ".win-body";

/**
 * 判断一个元素是不是"能滚的"。
 *
 * ⚠️ 为什么要判断而不是直接用？
 *    因为 scrollTo 一个不可滚动的元素【不会报错，也不会动】——
 *    这正是之前那个"点目录没反应"bug 最难查的地方：
 *    代码一路跑到底，没有任何异常，就是不滚。
 *    提前判断一下，出问题时至少能 fail fast。
 */
function isScrollable(el: HTMLElement): boolean {
  const cs = getComputedStyle(el);
  const canOverflow = /(auto|scroll|overlay)/.test(cs.overflowY);
  return canOverflow && el.scrollHeight > el.clientHeight + 1;
}

/**
 * 解析出"真正该滚的那个元素"。
 *
 * ⚠️⚠️ 顺序很重要：先看传进来的 ref 【自己】能不能滚，
 *    不行再向上找最近的 .win-body。反过来写就会出错 ——
 *
 *    现在 ArticleView 把 ref 挂在 <article class="overflow-y-auto"> 上，
 *    它自己就是滚动容器。如果直接 closest(".win-body")，
 *    会【跳过它】匹配到更外层的 .win-body —— 而那个元素
 *    因为内部已经被 article 消化掉了滚动，自己往往滚不动。
 *    结果就是 scrollTo 作用在一个滚不动的元素上，静默失败。
 *
 * ⚠️ 放在模块顶层而不是组件内，是为了让 useEffect 的依赖数组干净 ——
 *    放组件里每次渲染都是新函数引用，写进依赖会导致 effect 反复重跑。
 */
function resolveScrollRoot(ref: HTMLElement | null): HTMLElement | null {
  if (ref && isScrollable(ref)) return ref;
  return (ref?.closest(SCROLL_ROOT) as HTMLElement | null) ?? null;
}

export default function Toc({
  items,
  /** 由 ArticleView 传入：点目录时用它去拿真实的滚动容器 */
  scrollRef,
}: {
  items: TocItem[];
  scrollRef: React.RefObject<HTMLElement | null>;
}) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");
  /** 目录自己的高亮项要跟着滚动，否则读到底部时目录里选中的项已经在可视区外了 */
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!items.length) return;

    const root = resolveScrollRoot(scrollRef.current);
    if (!root) return;

    const targets = items
      .map((it) => root.querySelector<HTMLElement>(`#${CSS.escape(it.id)}`))
      .filter((el): el is HTMLElement => !!el);

    if (!targets.length) return;

    /**
     * ⚠️ 用一个 Map 记录"每个标题当前是否在观测带里"，
     *    而不是直接在高亮回调里 setActiveId。
     *
     *    原因：IntersectionObserver 的回调是【批量】给的，
     *    一次可能报告多个元素同时进入或离开。
     *    如果每来一条就 setActiveId，同一帧内会连设好几次，
     *    最终结果取决于回调顺序 —— 表现就是高亮乱跳。
     *
     *    正确做法：先更新状态表，再从表里按【文档顺序】
     *    挑出第一个处于可见状态的标题。
     */
    const visible = new Map<string, boolean>();

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).id;
          visible.set(id, e.isIntersecting);
        }

        // 按文档顺序找第一个可见的标题 —— 这就是"当前章节"
        const current = items.find((it) => visible.get(it.id));
        if (current) setActiveId(current.id);
      },
      { root, rootMargin: "-10% 0px -70% 0px", threshold: 0 }
    );

    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [items, scrollRef]);

  /** 高亮项滚进目录自己的可视区（目录也可能很长，需要内部滚动） */
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-toc-id="${CSS.escape(activeId)}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  if (!items.length) return null;

  /** 点击跳转 */
  const jump = (id: string) => {
    const root = resolveScrollRoot(scrollRef.current);
    const target = root?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!root || !target) return;

    /**
     * ⚠️⚠️ 这里不能用 target.scrollIntoView()，得自己算偏移量。
     *
     *   为什么？两个原因：
     *
     *   1. 【滚动容器不确定】
     *      scrollIntoView 让浏览器自己找"最近的、可滚动的祖先"。
     *      这个祖先未必是我们以为的 .win-body ——
     *      中间可能还夹着别的 overflow 容器。
     *      找错了就是"点了没反应"或"只滚一点点"。
     *      自己明确指定 scrollTo 到 root 上，没有这个不确定性。
     *
     *   2. 【要留上边距】
     *      scrollIntoView({block:"start"}) 会把标题顶到容器最上沿，
     *      紧贴窗口标题栏，读起来很挤。
     *      用 scrollTo 可以精确地减掉 12px 留白。
     *
     * ⚠️ 为什么用 getBoundingClientRect 而不是 offsetTop？
     *    offsetTop 是相对 offsetParent 的，而 .md-body 里嵌套很深
     *    （表格、引用块……），offsetParent 不一定是滚动容器，
     *    直接拿 offsetTop 会跳错位置。
     *    getBoundingClientRect().top 是相对视口的，
     *    配合当前 scrollTop 换算，结果永远正确 ——
     *    不管中间隔了多少层 overflow 容器。
     */
    const delta = target.getBoundingClientRect().top - root.getBoundingClientRect().top;
    const top = Math.max(0, root.scrollTop + delta - 12);

    /**
     * ⚠️⚠️ 优先 smooth，但如果动画被静默打断，必须能兜住。
     *
     *   之前用 sticky 布局时，smooth 动画会被浏览器【静默打断】——
     *   滚动停在中途（实测 1734px 的目标只走到 253px），
     *   不报错、不抛异常，只看现象就是"点了只轻轻动一下"。
     *   这类 bug 最难查，因为所有断言都是"通过"的。
     *
     *   现在布局已改成 article 自己滚（滚动内容里没有 sticky 了），
     *   smooth 不会再被打断。但为了这类问题不再"静默失败"，
     *   这里加一道最终校验：等动画该结束时看看有没有到位，
     *   没到位就直接补一刀 —— 保证"点了就一定跳过去"。
     */
    const reduced =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    try {
      root.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
    } catch {
      // 老浏览器不认 options 对象
      root.scrollTop = top;
    }

    /**
     * ⚠️ 兜底检查的时机很关键：
     *    必须在 smooth 动画【结束之后】才检查。动画大约 300~500ms，
     *    这里等 600ms。如果不等，会在动画中途误判"没到位"
     *    然后一刀瞬移过去 —— 那 smooth 就白做了（看起来像卡住后突然跳）。
     */
    if (!reduced) {
      window.setTimeout(() => {
        // ⚠️ 用户可能在动画期间自己滚了，那就不该再纠正 ——
        //    不然会跟用户抢滚动条。所以只在"几乎还在原地"时才补。
        if (Math.abs(root.scrollTop - top) > 4) root.scrollTop = top;
      }, 600);
    }

    // 立刻标记为当前，别等 observer 回调 —— 否则点完会有短暂的高亮滞后
    setActiveId(id);
  };

  return (
    <nav className="toc" aria-label="文章目录">
      <div className="toc-title">目录</div>
      <ul className="toc-list" ref={listRef}>
        {items.map((it) => (
          <li
            key={it.id}
            /* 层级用 data 属性 + CSS 控制缩进，比内联 style 好维护 */
            data-depth={it.depth}
            data-toc-id={it.id}
            className={`toc-item${it.id === activeId ? " is-active" : ""}`}
          >
            <button type="button" onClick={() => jump(it.id)} title={it.text}>
              {it.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
