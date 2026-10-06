import { create } from "zustand";

/** 一个窗口实例的完整状态 */
export interface WinState {
  /**
   * 【稳定身份】窗口被创建时分配一次，此后【永不改变】。
   *
   * ⚠️⚠️ 这个字段的存在是为了修一个真实的 bug，删掉会立刻复发，别动它。
   *
   *   背景：`id` 是可以【原地变更】的 ——
   *     控制面板点左侧分类时，窗口 id 从 control:appearance
   *     变成 control:about（同一次操作里原地改，不新建窗口）。
   *     这是需求明确要求的（"不要新开窗口"）。
   *
   *   问题：WindowManager 里是
   *       <AnimatePresence>{windows.map(w => <Window key={w.id} …/>)}</AnimatePresence>
   *     AnimatePresence 判断"子元素是否还在"靠的就是这个 key。
   *     id 一变，它的视角里就是「旧 key（control:appearance）消失了，
   *     新 key（control:about）出现了」—— 于是它给【同一个窗口】
   *     启动了退出动画（缩小 + 淡出），同时又挂了一个进场动画。
   *
   *   症状（很难查，因为要卡在动画进行中的几百毫秒里操作）：
   *     · 在动画播完前点了右上角关闭 → 任务栏按钮消失了，
   *       但窗口还画在屏幕上；
   *     · 拖那个残留窗口，松手后会弹回原位 ——
   *       因为它的 onDragStop 调 move(id, …)，而那个 id 在 store 里
   *       已经不存在了，写不进去；Rnd 是受控组件，
   *       下一帧又按 store 里的旧坐标渲染回来。
   *
   *   修法：另给一个创建后不再变的 uid，让 AnimatePresence 用 uid 当 key。
   *     这样切分类时 key 不变 → AnimatePresence 认为"还是同一个窗口"
   *     → 不会误播退出动画 → 也就没有僵尸节点。
   *
   *   ⚠️ 那"切分类后右侧内容换了"这件事靠什么触发？
   *      靠 id 变 → renderContent(id) 返回不同组件。
   *      AnimatePresence 的 key 和内容刷新是【两件事】，可以分开。
   */
  uid: string;

  /**
   * 业务标识，用于查找和去重。可以原地变更。
   *
   * 约定（见 WindowManager.renderContent）：
   *   pc / notepad / browser / recycle / tags / about / posts  固定视图
   *   post:<slug>        文章阅读视图
   *   notepad:<slug>     用记事本外壳打开某篇
   *   control:<分类>     控制面板的某个分类
   *   tag:<名> / category:<名>  筛选视图
   */
  id: string;
  /** 标题栏显示的文字 */
  title: string;
  /** 对应桌面图标的 emoji 或图片路径（/icons/xxx.png），任务栏复用 */
  icon: string;
  /** 当前左上角坐标（相对视口） */
  x: number;
  y: number;
  /** 当前尺寸 */
  w: number;
  h: number;
  /** 最大化之前的尺寸，用于还原 */
  prev: { x: number; y: number; w: number; h: number } | null;
  /** 是否最小化 */
  minimized: boolean;
  /** 是否最大化 */
  maximized: boolean;
  /** 层级，越大越靠前 */
  z: number;
  /** URL 里显示的路径，如 /posts */
  path: string;
}

/** 打开窗口时的入参：只需要告诉我要开哪个，位置尺寸由 store 算 */
type OpenPayload = Pick<WinState, "id" | "title" | "icon" | "path"> & Partial<Pick<WinState, "w" | "h">>;

interface WindowStore {
  windows: WinState[];
  /** 全局层级计数器，每次聚焦 +1 */
  topZ: number;
  /** 开始菜单是否展开 */
  startMenuOpen: boolean;
  /** 打开（或已开则聚焦）一个窗口 */
  open: (p: OpenPayload) => void;
  /** 关闭并销毁 */
  close: (id: string) => void;
  /** 最小化 / 还原 */
  toggleMinimize: (id: string) => void;
  /** 最小化后从任务栏点回来 */
  restore: (id: string) => void;
  /** 最大化 / 还原 */
  toggleMaximize: (id: string) => void;
  /** 拖拽结束时写入新坐标 */
  move: (id: string, x: number, y: number) => void;
  /** 缩放结束时写入新尺寸 */
  resize: (id: string, x: number, y: number, w: number, h: number) => void;
  /** 点谁谁到最前面 */
  focus: (id: string) => void;
  /** 任务栏按钮：可见且已聚焦则最小化，否则还原并置顶 */
  toggleFromTaskbar: (id: string) => void;
  /** 开始菜单开关 */
  setStartMenu: (open: boolean) => void;
  toggleStartMenu: () => void;
  /** 一键最小化全部窗口（"回到桌面"） */
  minimizeAll: () => void;
}

const TASKBAR_H = 40;

/**
 * 每个应用「开多大才舒服」的默认尺寸。
 *
 * ⚠️ 为什么放在 store 而不是各调用点？
 *    因为打开同一个窗口有很多入口：桌面图标、开始菜单快捷方式、
 *    URL 还原、任务栏还原、页内跳转……只要有一处忘了带尺寸，
 *    那个入口开出来的窗口就是默认的 720×480 —— 并且这个 bug 只在
 *    特定入口出现，非常难查。放在 store 里，所有入口自动一致。
 *
 * 这几个数字不是拍脑袋的：
 *   notepad 740×620 —— 上面一条菜单栏、下面一条状态栏各占 ~28px，
 *                      480 高会让正文只剩两行，看着像坏了
 *   pc      840×560 —— 左树 155px + 右表格三列，720 宽会把标题挤到换行
 *   browser 700×580 —— 内容是一列卡片，太宽反而显得空
 *   control 900×620 —— 改成左右分栏后，左导航固定 168px；
 *                      再按老的 620 宽算，右侧只剩 450px，
 *                      壁纸缩略图网格会挤成两列，很难看清。
 *                      900 宽能放下四列缩略图，是控制面板的舒适值。
 *   其余保持接近默认值，够用就行
 */
const APP_SIZE: Record<string, { w: number; h: number }> = {
  pc: { w: 840, h: 560 },
  notepad: { w: 740, h: 620 },
  browser: { w: 700, h: 580 },
  recycle: { w: 720, h: 520 },
  control: { w: 900, h: 620 },
};

/**
 * 给窗口 id 找预设尺寸。
 *
 * ⚠️⚠️ 必须支持【前缀匹配】。
 *
 *    窗口 id 有两类：
 *      简单 id       "pc"、"notepad"、"control"
 *      带参数的 id   "post:why-win10"、"notepad:why-win10"、"control:appearance"
 *
 *    带参数的 id 查 APP_SIZE["notepad:why-win10"] 会得到 undefined，
 *    于是回落到全局默认的 720×480 ——
 *    表现就是"从桌面图标打开的记事本很高（620），
 *    从此电脑打开文章的记事本却很矮（480）"，
 *    同一个应用两个尺寸，很难看，而且非常难查
 *    （因为两个入口都"能用"，只是长相不同）。
 *
 *    所以这里先查全长 id，查不到就取冒号前面那段再查。
 *
 * ⚠️ 为什么不干脆用 startsWith 遍历一遍？
 *    那样 "notepadd:xxx" 这种错拼也会命中 "notepad"，把 bug 藏起来。
 *    精确切分 + 再查表，错了就错了（回落到默认尺寸），反而好发现。
 */
function presetSize(id: string): { w: number; h: number } | undefined {
  const direct = APP_SIZE[id];
  if (direct) return direct;
  const head = id.split(":")[0];
  return APP_SIZE[head];
}

/** 自动排布：新窗口按数量错开，避免完全叠在一起 */
function nextPosition(count: number) {
  const base = 120;
  const step = 28;
  const offset = (count % 8) * step;
  return { x: base + offset, y: base + offset };
}

/**
 * 生成窗口的稳定 uid。
 *
 * ⚠️ 为什么用自增计数器，而不是 Math.random() 或 crypto.randomUUID()？
 *
 *   1. 可读性。uid 会出现在 DOM 的 data 属性和调试输出里，
 *      "win-3" 比 "a3f9c1e2-…" 好认得多。
 *   2. 服务端渲染安全。Math.random() 在 SSR 和客户端会得到不同值，
 *      导致 hydration mismatch 警告；自增计数器在 React 树里是稳定的。
 *   3. 唯一性够用。窗口是单会话的东西，数量顶天几十个，
 *      不存在跨会话碰撞的问题 —— 不需要 UUID 那种强度。
 *
 * ⚠️ 计数器放在模块作用域，而不是 store 的 state 里。
 *    放进 state 的坏处：它会被当成"需要渲染的数据"，
 *    每次 +1 都触发一轮订阅者的重渲染 —— 但它其实没人订阅。
 *    模块作用域的量，改了不通知任何人，正是我们想要的。
 */
let uidSeq = 0;
function nextUid() {
  uidSeq += 1;
  return `win-${uidSeq}`;
}

export const useWindowStore = create<WindowStore>((set, get) => ({
  windows: [],
  topZ: 10,
  startMenuOpen: false,

  open: (p) => {
    const state = get();
    const existing = state.windows.find((w) => w.id === p.id);

    // 已经开着：不再新建，直接还原 + 置顶
    if (existing) {
      set({
        topZ: state.topZ + 1,
        windows: state.windows.map((w) =>
          w.id === p.id ? { ...w, minimized: false, z: state.topZ + 1 } : w
        ),
      });
      return;
    }

    // 尺寸优先级：调用方显式指定 > 应用默认表 > 全局默认
    const preset = presetSize(p.id);
    const w = p.w ?? preset?.w ?? 720;
    const h = p.h ?? preset?.h ?? 480;

    /**
     * 小屏兜底：预设尺寸是按桌面写的，在窄屏上会超出视口。
     * 这里夹一下，保证窗口至少完整可见（留 16px 边距）。
     * 移动端走的是另一条分支（Window.tsx 里的全屏卡片），不受影响。
     */
    const vw = typeof window !== "undefined" ? window.innerWidth : w;
    const vh = typeof window !== "undefined" ? window.innerHeight : h + TASKBAR_H;
    const fitW = Math.max(280, Math.min(w, vw - 32));
    const fitH = Math.max(200, Math.min(h, vh - TASKBAR_H - 32));

    const pos = nextPosition(state.windows.length);
    const z = state.topZ + 1;

    // 视口夹取：保证窗口不会开在屏幕外
    const maxX = typeof window !== "undefined" ? window.innerWidth - fitW - 16 : pos.x;
    const maxY =
      typeof window !== "undefined" ? window.innerHeight - TASKBAR_H - fitH - 16 : pos.y;

    set({
      topZ: z,
      windows: [
        ...state.windows,
        {
          // ⚠️ uid 只在这一行生成一次，之后任何地方都不许改它。
          //    它是 AnimatePresence 的 key，改了就等于"换了个窗口"，
          //    会重新触发进场/退场动画 —— 正是我们要消灭的那个 bug。
          uid: nextUid(),
          id: p.id,
          title: p.title,
          icon: p.icon,
          path: p.path,
          x: Math.max(16, Math.min(pos.x, maxX)),
          y: Math.max(16, Math.min(pos.y, maxY)),
          w: fitW,
          h: fitH,
          prev: null,
          minimized: false,
          maximized: false,
          z,
        },
      ],
    });
  },

  close: (id) =>
    set((s) => ({ windows: s.windows.filter((w) => w.id !== id) })),

  toggleMinimize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, minimized: true } : w
      ),
    })),

  restore: (id) => {
    const s = get();
    const z = s.topZ + 1;
    set({
      topZ: z,
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, minimized: false, z } : w
      ),
    });
  },

  toggleMaximize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id) return w;
        // 还原：把 prev 里的内容写回去
        if (w.maximized && w.prev) {
          return { ...w, maximized: false, ...w.prev, prev: null };
        }
        // 最大化：先把当前几何存进 prev
        return {
          ...w,
          maximized: true,
          prev: { x: w.x, y: w.y, w: w.w, h: w.h },
        };
      }),
    })),

  move: (id, x, y) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, x, y } : w)),
    })),

  resize: (id, x, y, w, h) =>
    set((s) => ({
      windows: s.windows.map((win) =>
        win.id === id ? { ...win, x, y, w, h } : win
      ),
    })),

  focus: (id) => {
    const s = get();
    const target = s.windows.find((w) => w.id === id);
    // 已经在最顶层就不用动了，省一次渲染
    if (!target || target.z === s.topZ) return;
    const z = s.topZ + 1;
    set({
      topZ: z,
      windows: s.windows.map((w) => (w.id === id ? { ...w, z } : w)),
    });
  },

  /**
   * 任务栏按钮的行为（贴着 Win10 的真实逻辑）：
   *   - 窗口最小化  → 点一下：还原并置顶
   *   - 窗口可见且已是最前 → 点一下：最小化（相当于"收起"）
   *   - 窗口可见但在后面  → 点一下：置顶（不最小化）
   * 第三种情况最容易漏，漏了就会出现"点一下反而把窗口藏起来"的怪异手感。
   */
  toggleFromTaskbar: (id) => {
    const s = get();
    const win = s.windows.find((w) => w.id === id);
    if (!win) return;
    const z = s.topZ + 1;

    if (win.minimized) {
      set({
        topZ: z,
        windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: false, z } : w)),
      });
      return;
    }
    // 可见且已经在最顶层 → 最小化
    if (win.z === s.topZ) {
      set({
        windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)),
      });
      return;
    }
    // 可见但在后面 → 置顶
    set({
      topZ: z,
      windows: s.windows.map((w) => (w.id === id ? { ...w, z } : w)),
    });
  },

  setStartMenu: (open) => set({ startMenuOpen: open }),

  toggleStartMenu: () => set((s) => ({ startMenuOpen: !s.startMenuOpen })),

  minimizeAll: () =>
    set((s) => ({
      startMenuOpen: false,
      windows: s.windows.map((w) => ({ ...w, minimized: true })),
    })),
}));
