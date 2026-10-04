import { useEffect, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import { motion } from "motion/react";
import { useWindowStore, type WinState } from "../../store/windowStore";
import { useIsMobile } from "../../hooks/useIsMobile";
import { isImageIcon } from "../../lib/tiles";

const TASKBAR_H = 40;

/**
 * 标题栏高度。
 *
 * ⚠️ 这个值被两处引用，必须是同一个数：
 *    - 标题栏自己的 className 里用 `h-8`（=32px）
 *    - 内容区的高度用 `calc(100% - TITLEBAR_H px)` 算
 * 对不上的话，内容区会多出或少掉一条 —— 表现是底部被裁/留白。
 * 所以提成常量，改的时候只改这一行。
 */
const TITLEBAR_H = 32;

/**
 * 「内容很重」的判定阈值 —— 渲染后的 DOM 节点数。
 *
 * 实测参考（化学手册那篇）：
 *   17,518 字符 Markdown → 878,587 字符 HTML → 24,544 个节点
 *
 * 5000 是"开始能感觉到缩放卡顿"的经验线。
 * 低于它的窗口拖起来本来就流畅，加冻结反而只多了一次闪烁。
 */
const FREEZE_NODE_THRESHOLD = 5000;

/**
 * 窗口开关动画的曲线与时长。
 *
 * 和 global.css 里的 --ease-win 保持一致（cubic-bezier(0.1, 0.9, 0.2, 1)）——
 * 这个曲线是 Win10 的默认动效曲线：起步快、收尾缓。
 *
 * ⚠️ 为什么不用 motion 内置的 "easeOut" / spring？
 *    因为那套是 iOS/Material 的手感，偏"弹"。Windows 的动效更"干"，
 *    几乎没有回弹。用自定义贝塞尔才能对上那个感觉。
 *
 * 为什么不用 spring 做窗口缩放？
 *    spring 有回弹和二次震动，窗口这类大面板用 spring 会显得晃，
 *    Win10 的窗口也是纯缓动、不回弹的。
 */
const WIN_TRANSITION = {
  duration: 0.28,
  ease: [0.1, 0.9, 0.2, 1] as const,
};

/** 三个标题栏按钮的图形，用内联 SVG 保证清晰度，不依赖图标库 */
const ICONS = {
  minimize: (
    <svg viewBox="0 0 10 10" className="h-[10px] w-[10px] fill-none stroke-current stroke-[1.1]">
      <path d="M0 5h10" />
    </svg>
  ),
  maximize: (
    <svg viewBox="0 0 10 10" className="h-[10px] w-[10px] fill-none stroke-current stroke-[1.1]">
      <rect x="0.5" y="0.5" width="9" height="9" />
    </svg>
  ),
  restore: (
    <svg viewBox="0 0 10 10" className="h-[10px] w-[10px] fill-none stroke-current stroke-[1.1]">
      <rect x="0.5" y="2.5" width="7" height="7" />
      <path d="M2.5 2.5V0.5h7v7h-2" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 10 10" className="h-[10px] w-[10px] fill-none stroke-current stroke-[1.1]">
      <path d="M0 0l10 10M10 0L0 10" />
    </svg>
  ),
};

/**
 * 窗口图标：可能是 emoji，也可能是图片路径（/icons/pc.png）。
 *
 * 判断规则和桌面图标、磁贴共用同一个 isImageIcon（lib/tiles.ts），
 * 三处规则必须一致 —— 否则会出现"桌面上是图标，任务栏里变成一串路径文字"。
 */
function WinIcon({ icon, className = "" }: { icon: string; className?: string }) {
  if (isImageIcon(icon)) {
    return (
      <img
        src={icon}
        alt=""
        draggable={false}
        className={`h-[15px] w-[15px] shrink-0 object-contain ${className}`}
      />
    );
  }
  return <span className={`leading-none ${className}`}>{icon}</span>;
}

export default function Window({ win, children }: { win: WinState; children?: React.ReactNode }) {
  const isMobile = useIsMobile();
  const { close, toggleMinimize, toggleMaximize, move, resize, focus } = useWindowStore();

  /**
   * 缩放期冻结状态 —— 见下方 Rnd 的 onResizeStart 注释。
   * 只在"内容很重"的窗口上会被置为 true。
   */
  const [freezing, setFreezing] = useState(false);

  /**
   * 这个窗口的内容是不是"重"到需要缩放时冻结？
   *
   * ⚠️ 判断依据是【渲染后的 DOM 节点数】，不是源文件大小。
   *
   *    实测换算：化学手册那篇 17,518 字符 Markdown
   *             → 878,587 字符 HTML（膨胀 50 倍）
   *             → 24,544 个 DOM 节点
   *
   *    5000 节点是"开始能感觉到卡"的经验阈值。
   *    低于它的文章拖起来本来就流畅，冻结反而会引入不必要的闪烁。
   *
   * ⚠️ 为什么用 useEffect + state 而不是 useMemo？
   *    必须在 DOM 渲染【之后】才能量到真实节点数。
   *    useMemo 在 render 阶段跑，那时 DOM 还没更新。
   *
   * ⚠️⚠️ 为什么依赖数组里是 win.title，而不是 children？
   *
   *    children 是 ReactNode，React 没法可靠地比较它 ——
   *    每次父组件重渲染都会生成新的 ReactNode，写进去等于"每次都重测"，
   *    而我们只在下一帧测一次节点数，会白跑很多次。
   *
   *    win.title 是个字符串，稳定、可比，而且它正好随文章变化
   *    （打开新文章 → 标题变 → 触发重测）。这就是我们要的触发点。
   *
   * ⚠️ 为什么用 requestAnimationFrame 而不是直接量？
   *    useEffect 跑在 DOM 提交【之后】，理论上能直接量到。
   *    但记事本/文章视图是懒渲染的（renderMarkdown 可能在 effect 里跑），
   *    推到下一帧更稳，代价是 16ms 延迟 —— 用户感知不到。
   */
  const [shouldFreeze, setShouldFreeze] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const measure = () => {
      const body = rootRef.current?.querySelector(".md-body");
      if (!body) {
        setShouldFreeze(false);
        return;
      }
      setShouldFreeze(body.querySelectorAll("*").length > FREEZE_NODE_THRESHOLD);
    };

    /**
     * 测两次，而不是一次。
     *
     * ⚠️ 为什么要测两次？
     *   第一帧（rAF）通常够用了 —— DOM 已经提交。
     *   但有两类窗口会在【之后】才把正文填进去：
     *
     *     1. 记事本的「渲染视图」：html 是 useMemo 算的，
     *        但用户可能先看到源码视图，再按 F9 切过去；
     *     2. 任何"内容异步就绪"的视图。
     *
     *   只测一次的话，这些窗口的 shouldFreeze 永远是 false，
     *   缩放时还是会卡 —— 而且不报错，属于静默失效。
     *
     *   补测一次（延迟 600ms）几乎零成本，却能兜住这类情况。
     *   ⚠️ 不再加更多次：再加下去就是轮询了，
     *      而窗口内容在一次渲染后就稳定了，没必要持续观察。
     */
    const raf = requestAnimationFrame(measure);
    const timer = window.setTimeout(measure, 600);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [win.title]);

  /**
   * 动画开关。
   *
   * 读的是 <html> 上的 class，而不是 useAppearance() 的 React 状态。
   * 原因：Window 有很多个实例，如果每个都去订阅 hook，
   * 一次切换会触发 N 次重渲染。这里只在挂载时读一次就够了 ——
   * 用户改设置时，CSS 那套（.no-anim *) 会兜住纯 CSS 动画，
   * 而 motion 的 initial 传 false 也能让入场动画失效。
   *
   * ⚠️ 注意：这里【不是】响应式的。用户在控制面板里关掉动画后，
   *    已经开着的窗口不会重新读这个值。这是有意的取舍 ——
   *    代价是"需要重开一个窗口才完全生效"，
   *    换来的是避免 N 个窗口同时重渲染。
   */
  const animOn =
    typeof document === "undefined" || !document.documentElement.classList.contains("no-anim");

  if (win.minimized) return null;

  /** 标题栏 —— 移动端和桌面端共用，只是移动端禁用拖拽 */
  const titleBar = (
    <div
      className="win-drag-handle flex shrink-0 select-none items-center gap-2 px-2 text-[12px]
                 text-[var(--fg-on-acrylic)]"
      /* 高度用常量而不是 h-8：和下面内容区的 calc(100% - TITLEBAR_H) 绑死，
         避免两处各写一个数字、改了一处忘了另一处 */
      style={{ height: TITLEBAR_H }}
      /**
       * 标题栏用 accent 渐变，这是 Win10 的「彩色标题栏」外观。
       *
       * ⚠️ 这里用的 accent-gradient 是一个 CSS 变量而不是写死的渐变色，
       *    这样暗色模式下它会自动换成更亮一点的蓝（见 global.css 的 .theme-dark）。
       *    写死的话暗色下标题栏会显得又闷又脏。
       *
       * ⚠️⚠️ 标题栏刻意【不】做 backdrop-filter 模糊。
       *
       *    原因是 react-rnd 已经在窗口根节点上用 transform 做位移，
       *    而 backdrop-filter 遇到带 transform 的祖先时，
       *    在部分浏览器（尤其 Safari）会退化甚至整块变黑。
       *    标题栏是纯色渐变，本来也看不出模糊效果，
       *    所以这里只用纯色，把毛玻璃留给任务栏和开始菜单这两个真正需要的面板。
       */
      style={{ background: "var(--titlebar-gradient)" }}
      onDoubleClick={() => !isMobile && toggleMaximize(win.id)}
    >
      <WinIcon icon={win.icon} className="text-[13px]" />
      <span className="flex-1 truncate">{win.title}</span>

      {/* 三个控制按钮：不参与拖拽，所以要加 no-drag */}
      <div className="no-drag flex items-center">
        <button
          aria-label="最小化"
          onClick={() => toggleMinimize(win.id)}
          className="grid h-8 w-11 place-items-center text-white/85 transition-colors hover:bg-white/20"
        >
          {ICONS.minimize}
        </button>
        <button
          aria-label={win.maximized ? "还原" : "最大化"}
          onClick={() => toggleMaximize(win.id)}
          className="no-drag hidden h-8 w-11 place-items-center text-white/85 transition-colors hover:bg-white/20 md:grid"
        >
          {win.maximized ? ICONS.restore : ICONS.maximize}
        </button>
        <button
          aria-label="关闭"
          onClick={() => close(win.id)}
          className="grid h-8 w-11 place-items-center text-white/85 transition-colors
                     hover:bg-[#e81123] hover:text-white"
        >
          {ICONS.close}
        </button>
      </div>
    </div>
  );

  /**
   * 窗口内容区：Win10 的窗口是浅灰底 + 白内容区。
   *
   * ⚠️ 内边距只在「有真实内容」时才给。
   *    因为每个视图组件（PostList / ArchiveView / ArticleView …）自己
   *    就是按 h-full 布局设计的，需要撑满内容区来做内部滚动。
   *    如果这里统一加 p-4，视图的高度就会比容器少 32px，
   *    内部滚动条会出现"滚不到底"或"多出一截空白"的怪异现象。
   *
   * ⚠️⚠️ 为什么外面还要再包一层 win-body-wrap？（这层是修 bug 加的，别删）
   *
   *    症状：文章窗口里滚轮怎么滚都不动，正文像被切掉了。
   *
   *    原因是 min-h-0 flex-1 这套组合有一个隐含前提：
   *    父链上必须有一级是【有确定高度】的，flex 才能算出剩余空间。
   *
   *    但我们这条链的顶端是 <astro-island>（client:only 的外包标签），
   *    它的高度是 auto，实际尺寸 0×0。于是 flex-1 一路算下来
   *    得到的是"按内容自然撑高" —— 实测 .win-body 的 clientHeight
   *    变成了 3146px（整篇文章的高度），它自己反而没有可滚动空间，
   *    内容就被外层 Rnd 的 overflow:hidden 直接裁掉了。
   *
   *    修法是给一个确定高度的锚。关键是【不要再用 flex-1】：
   *    Rnd 的容器虽然是 flex 布局，但它内部的高度分配在
   *    client:only 的场景下同样不可靠（实测 flex-1 算出来是 0）。
   *
   *    所以改成百分比：Rnd 容器有确定高度（如 600px），
   *    win-body-wrap 用 h-full 拿到 100%，
   *    再让 .win-body 用 h-full 拿到 100%。整条链都是
   *    「父有确定高度 → 子取 100%」，与 flex 计算解耦，
   *    谁在外面套什么标签都不影响。
   */
  const body = (
    /*
      ⚠️⚠️⚠️ 高度链，这段是踩了三个坑之后才写对的，动之前先把下面看完。

      ── 坑 1：min-h-0 flex-1
         .win-body 算出来 3146px（整篇文章的高度），自己没有滚动空间，
         正文被外层裁掉。

      ── 坑 2：h-full
         h-full 拿的是父容器 100% = 整个窗口高度（560），不是
         「窗口减标题栏」。于是 32 + 560 = 592，比窗口高 32px，
         底部被 overflow:hidden 切掉一条 —— 状态栏只剩上半截。

      ── 坑 3（真因，最容易被忽略）：react-rnd 会覆盖 display
         上面两个方案都建立在「Rnd 那个节点是 flex-col 容器」的假设上。
         实测它【不是】：

             Rnd 节点  computed display = block   ← 不是 flex
                       className 里明明写了 flex flex-col

         react-rnd 在内部给可缩放节点设置了行内 display，
         行内样式优先级高于 class，所以我写的 flex flex-col 根本没生效。
         容器不是 flex，flex-1 自然没有可分配的剩余空间，
         flex-basis 退化到 0% —— 于是坑 1 的塌缩又回来了（实测 328px）。

      ── 正确解法：不用 flex，用 calc 直接算
         标题栏的高度是【确定值】（TITLEBAR_H = 32）。
         既然 Rnd 给的高度也是确定的（win.h），那把两者相减就行，
         完全不需要依赖父节点是不是 flex：

             height = calc(100% - 32px)

         100% 指的是 Rnd 节点的高度（560），减掉标题栏正好 528。
         这样写对 Rnd 的 display 值没有任何要求，它想改成什么都行。
    */
    <div
      ref={rootRef}
      className="win-body-wrap relative overflow-hidden"
      style={{ height: `calc(100% - ${TITLEBAR_H}px)` }}
    >
      <div
        className="win-body h-full overflow-auto bg-[var(--surface)] text-[13px] leading-relaxed text-[var(--fg)]"
        /**
         * ⚠️⚠️ 缩放冻结的落点就在这里。
         *
         *   冻结期间给正文盖一层隐身（visibility: hidden），
         *   浏览器就跳过这 2.4 万个节点的重排，缩放瞬间顺滑。
         *
         *   ⚠️ 为什么加在 .win-body 上而不是整窗口？
         *     标题栏上有三个按钮，冻结整窗口会让按钮也消失 ——
         *     用户会以为窗口坏了。只冻结正文区，标题栏照常显示。
         *
         *   ⚠️ 为什么用 style 而不是 className？
         *     这是个二态开关，切换频率高（每次缩放两次）。
         *     加 class 会走 Tailwind 的类名拼接 + CSS 匹配；
         *     直接写行内 style 是改一个属性，更直接，
         *     而且行内样式优先级最高，不会被 .win-body 的其它规则盖掉。
         */
        style={freezing ? { visibility: "hidden" } : undefined}
      >
        {children !== undefined && children !== null ? (
          /*
            ⚠️ 这层 padding 容器必须自己也带 h-full。

            链是这样走的：
              Rnd（有确定高度）
                → win-body-wrap  flex-1
                → .win-body      h-full
                → 这个 div        h-full
                → 视图组件        h-full

            视图里写的 h-full 会去问父元素要高度。父元素（这个 padding div）
            高度必须是确定值，h-full 才有意义 ——
            否则视图的高度会退化成"按内容撑开"。

            对普通文档流内容（文章正文）没问题，因为它本来就该按内容撑高。
            但对【内部有 flex 布局要撑满】的视图（记事本的 textarea、
            资源管理器的左右分栏）就是致命的：textarea 会塌成一行高。
          */
          <div className="h-full p-4">{children}</div>
        ) : (
          <div className="p-4 text-[var(--fg-dim)]">
            <p className="mb-2 text-[15px] font-semibold text-[var(--fg)]">{win.title}</p>
            <p>这个窗口还没有接上内容。</p>
            <p className="mt-3 text-[12px] text-[var(--fg-faint)]">URL 路径：{win.path}</p>
          </div>
        )}
      </div>
    </div>
  );

  /** 移动端：全屏卡片，不拖拽不缩放，贴满屏幕（上方留一点缝做视觉层次） */
  if (isMobile) {
    return (
      <motion.div
        /**
         * 移动端同样用 motion 做开关动画，但只需要缩放 —— 位置是固定的。
         * 注意这里【没有】Rnd 包裹，所以不存在和 react-rnd 的冲突问题。
         */
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={WIN_TRANSITION}
        className="fixed inset-x-0 top-0 z-40 flex flex-col overflow-hidden bg-[var(--surface)] shadow-2xl"
        style={{ bottom: TASKBAR_H, borderRadius: 0 }}
      >
        {titleBar}
        {body}
      </motion.div>
    );
  }

  /**
   * 桌面端：react-rnd 提供拖拽 + 缩放，motion 只负责「打开 / 关闭」这一进一出。
   *
   * ⚠️⚠️ 这里有一个必须处理对的冲突，是本阶段最容易翻车的地方。
   *
   *      两个库都想控制同一个 DOM 节点的 transform：
   *
   *        react-rnd  用 style.transform = translate(x, y) 实现拖拽定位
   *        motion     用 transform 做 scale 缩放动画
   *
   *      如果让 motion 直接接管 Rnd 的根节点，两边会互相覆盖 ——
   *      表现是窗口一打开就跳到 (0,0)，或者拖到一半位置被重置。
   *
   *      解法是【分层】：外层 motion.div 只负责 scale/opacity，
   *      内层 Rnd 独占 translate。两者各管一个维度，互不干涉。
   *
   *      所以多了一层 div，这不是冗余。
   *
   *      代价：外层必须 absolute inset-0 铺满父容器，
   *      否则内层 Rnd 的 bounds="parent" 会算错（父容器变成 0 高度）。
   *
   * ⚠️ 关窗流程：按下关闭按钮 → store 里标记 closing → 窗口播退出动画
   *    → 动画结束 → 真正从 store 删除。中间那一步「标记 closing」
   *    由下方的 useClosingWindows 协调，不能直接删，
   *    否则 DOM 立刻消失，退出动画根本没机会播。
   */
  return (
    <motion.div
      className="absolute inset-0"
      initial={animOn ? { opacity: 0, scale: 0.92 } : false}
      animate={{ opacity: 1, scale: 1 }}
      exit={animOn ? { opacity: 0, scale: 0.92 } : undefined}
      transition={WIN_TRANSITION}
      /**
       * transform-origin 定在窗口中心：Win10 的窗口就是从中心「长出来」的。
       * 如果默认用左上角，视觉上会像从角落"甩"出来，很怪。
       *
       * ⚠️⚠️ pointerEvents: "none" 是【必须】的，删了会出大问题。
       *
       *    这层 motion.div 是 absolute inset-0，也就是【铺满整个视口】。
       *    它本身是透明的、看不见的，但【看得见 ≠ 能点】：
       *    一个透明的 div 依然会拦截鼠标事件。
       *
       *    症状：桌面上双击图标完全没反应（图标明明就露在外面）。
       *    用 devtools 点一下会选中这个 div —— 事件被它吃掉了。
       *
       *    修法是"穿透"：外两层铺满视口的容器都设 pointer-events: none，
       *    只有真正有面积的窗口本体（Rnd 节点）恢复成 auto。
       *    这样空白处的点击会穿过窗口层，落到下面的桌面图标上。
       */
      style={{ transformOrigin: "center center", zIndex: win.z, pointerEvents: "none" }}
    >
      {/* 二层容器同样是铺满视口的，所以同样要穿透。
          它的作用只是给 Rnd 提供一个"有确定尺寸的父节点"（bounds="parent" 需要）。 */}
      <div className="h-full w-full" style={{ pointerEvents: "none" }}>
        <Rnd
          // key 里带 maximized，切换时让 Rnd 用新几何重新挂载，避免内部状态残留
          key={`${win.id}-${win.maximized}`}
          size={{ width: win.maximized ? "100%" : win.w, height: win.maximized ? "100%" : win.h }}
          position={{ x: win.maximized ? 0 : win.x, y: win.maximized ? 0 : win.y }}
          minWidth={360}
          minHeight={220}
          // ⚠️ bounds 必须是「parent」而不是某个 ref：
          // client:load / client:only 生成的 <astro-island> 是 0×0 的包装标签，
          // 父级容器 #os-window-layer 才是真正的满屏区域。
          bounds="parent"
          disableDragging={win.maximized}
          enableResizing={!win.maximized}
          dragHandleClassName="win-drag-handle"
          cancel=".no-drag"
          onMouseDown={() => focus(win.id)}
          onDragStart={() => focus(win.id)}
          onDragStop={(_e, d) => move(win.id, d.x, d.y)}
          /**
           * ⚠️⚠️ 缩放期的性能开关 —— 这是解决"公式多的文章拖起来卡"的关键。
           *
           *   症状：200+ 公式的文章（2.4 万个 DOM 节点），
           *        在窗口里拖拽缩放时明显卡顿，松手后还要等一两秒才跟上。
           *
           *   原因：缩放时容器宽度每一帧都在变，
           *        浏览器必须给全部 2.4 万个节点重算换行和位置。
           *        一帧算不完 → 掉帧 → 手感发黏。
           *
           *   解法：缩放【过程中】把正文藏起来（visibility: hidden）。
           *        浏览器跳过不可见元素的布局计算，缩放瞬间变流畅。
           *        松手后立刻恢复显示，并重新算一次布局。
           *
           *   ⚠️ 为什么用 visibility: hidden 而不是 display: none？
           *      display: none 会把元素从渲染树里摘掉，
           *      恢复时要【从头】重建布局（更慢，而且会丢失滚动位置）。
           *      visibility: hidden 只是不画，盒子还在，
           *      恢复时几乎零成本 —— 滚动位置也不会丢。
           *
           *   ⚠️ 为什么不是 opacity: 0？
           *      opacity: 0 的元素仍然要参与布局和绘制（只是透明），
           *      省不掉我们想省的那部分开销。visibility 才会真正跳过绘制。
           *
           *   ⚠️ 那用户会不会看到"内容闪一下消失"？
           *     只有内容【渲染很重】的文章才开这个开关（见上面的 shouldFreeze）。
           *     普通文章节点少，一秒能算几十帧，根本不需要冻结 ——
           *     开关本身反而会造成不必要的闪烁。
           *     判定标准是【渲染后的 DOM 节点数 > FREEZE_NODE_THRESHOLD(5000)】。
           *
           *   ⚠️ 为什么用节点数，而不是"正文长度 > N 字符"这种拍脑袋的估计？
           *     因为 Markdown 渲染成 HTML 的膨胀率是【不固定】的：
           *       化学手册：17,518 字符 → 878,587 字符 HTML（50 倍）
           *       纯文字文章膨胀率可能只有 3~5 倍
           *     用字符数估会把"公式多的小文章"漏掉、把"纯文字长文"误伤。
           *     直接量渲染后的真实节点数，是唯一准确的判据。
           */
          onResizeStart={() => {
            if (shouldFreeze) setFreezing(true);
          }}
          onResizeStop={(_e, _dir, ref, _delta, pos) => {
            // ⚠️ 先解除冻结，再写入新几何 —— 顺序不能反。
            //    如果先 resize 再解冻，中间那一帧会用旧尺寸布局一次，闪得更明显。
            setFreezing(false);
            resize(win.id, pos.x, pos.y, ref.offsetWidth, ref.offsetHeight);
          }}
          className="flex flex-col overflow-hidden rounded-t-[6px] bg-[var(--surface)]
                     shadow-[0_10px_36px_rgba(0,0,0,.45)]"
          /**
           * ⚠️ 这里是「穿透链」的终点：窗口本体必须把事件收回来。
           *
           *    上面两层铺满视口的容器都设了 pointer-events: none，
           *    如果不在这里恢复成 auto，整个窗口会变得「点不动」——
           *    标题栏拖不了、按钮按不动、正文选不中文字。
           *
           *    ⚠️ 为什么用 style 而不是加个 class？
           *      react-rnd 会往这个节点上写行内 style（position/width/height/
           *      transform/display…）。如果我加个 class 想设 pointer-events，
           *      只要 react-rnd 哪天也在行内写了 pointer-events，
           *      行内优先级更高就会把 class 盖掉。
           *      索性也用行内写，跟它站在同一优先级上，谁是最后写的谁生效 ——
           *      而我们在 JSX 里的 style 属性是 react-rnd 合并之后的结果，
           *      这里没有别的来源写它，所以稳定。
           *
           *    auto 的语义：恢复默认值，也就是「能接收事件」。
           *    不是 inheriting —— pointer-events 恰恰是【会继承】的属性，
           *    父级 none 会让子级默认也 none，所以必须显式写回 auto。
           */
          style={{ pointerEvents: "auto" }}
          resizeHandleClasses={{
            top: "rnd-handle",
            bottom: "rnd-handle",
            left: "rnd-handle",
            right: "rnd-handle",
            topLeft: "rnd-handle",
            topRight: "rnd-handle",
            bottomLeft: "rnd-handle",
            bottomRight: "rnd-handle",
          }}
        >
          {titleBar}
          {body}
        </Rnd>
      </div>
    </motion.div>
  );
}
