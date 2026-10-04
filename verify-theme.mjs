/**
 * 第六阶段验收：毛玻璃 + 动画 + 暗色模式
 *
 * 检查原则：不看类名，看【计算后的样式和真实行为】。
 */
import { chromium } from "playwright";

const BASE = "http://localhost:4400";
const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${name}${detail ? `  → ${detail}` : ""}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("astro-island", { state: "attached" });
await page.waitForTimeout(700);

/* ══════════════════════════════════════════════════════════
   一、毛玻璃材质
   ══════════════════════════════════════════════════════════ */
console.log("\n── 一、毛玻璃 ──");

const acrylic = await page.evaluate(() => {
  const bar = document.querySelector(".acrylic");
  if (!bar) return null;
  const cs = getComputedStyle(bar);
  return {
    backdrop: cs.backdropFilter || cs.webkitBackdropFilter,
    bg: cs.backgroundColor,
    blurVar: getComputedStyle(document.documentElement).getPropertyValue("--acrylic-blur").trim(),
  };
});

check("任务栏应用了 backdrop-filter", !!acrylic && acrylic.backdrop.includes("blur"), acrylic?.backdrop ?? "未找到 .acrylic");

check(
  "backdrop-filter 含 saturate（Acrylic 的饱和度增强）",
  !!acrylic && acrylic.backdrop.includes("saturate"),
  acrylic?.backdrop ?? ""
);

check("模糊半径来自 CSS 变量", acrylic?.blurVar === "15px", `--acrylic-blur = ${acrylic?.blurVar}`);

check(
  "底色是半透明 rgba（不是纯色）",
  !!acrylic && /rgba\(/.test(acrylic.bg) && !/,\s*1\)$/.test(acrylic.bg),
  acrylic?.bg ?? ""
);

// 亮色主题的底色应该偏冷灰（B 略高于 R）
const isCoolGray = (bg) => {
  const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return false;
  const [r, g, b] = [+m[1], +m[2], +m[3]];
  return b >= r && b - r <= 20 && Math.abs(g - r) <= 8;
};
check("底色是偏冷的中性灰（偏冷灰的 Win10 质感）", isCoolGray(acrylic?.bg ?? ""), acrylic?.bg ?? "");

/* ══════════════════════════════════════════════════════════
   二、暗色模式
   ══════════════════════════════════════════════════════════ */
console.log("\n── 二、暗色模式 ──");

// 打开控制面板
await page.evaluate(() => {
  window.dispatchEvent(
    new CustomEvent("os:open-window", {
      detail: { id: "control", title: "控制面板", icon: "⚙️", path: "/settings" },
    })
  );
});
await page.waitForTimeout(700);

/**
 * ⚠️ 开关数量从 3 变成 4 —— 新增了「开始菜单深色」。
 *
 *    这条断言的本意是「控制面板正常渲染出了开关」，
 *    不是为了锁定"必须刚好 3 个"。所以改成 >= 3：
 *    以后再加开关（比如"减少动效"）不会误报失败，
 *    但控制面板渲染不出来（0 个）依然会被抓到。
 */
const hasSwitch = await page.evaluate(
  () => document.querySelectorAll('[role="switch"]').length
);
check("控制面板有开关（>=3）", hasSwitch >= 3, `实测 ${hasSwitch} 个`);

/**
 * ⚠️⚠️ 切暗色的按钮【不再是 [role="switch"][0]】了。
 *
 *    第七阶段重做控制面板时，「亮色/暗色」从一个开关
 *    （暗色模式 on/off）改成了【二选一分段按钮】
 *    （aria-pressed 的"亮色 / 暗色"两个按钮）。
 *
 *    为什么改？因为"暗色模式：开/关"这个措辞是不对称的 ——
 *    它把亮色当成了"默认态"，暗色当成了"附加功能"。
 *    而实际使用中两者是对等的两种模式，Win10 设置里也是
 *    "浅色 / 深色"两个并列选项。改成分段按钮语义更准确，
 *    用户也不用先理解"关掉会变成什么"。
 *
 *    ⚠️ 所以这条断言不能再按下标点 —— 下标 0 现在是
 *    「开始菜单深色」那个开关，点了不会切主题，测试会假失败。
 *
 *    ✅ 改成按【内容】找：在控制面板里找文字正好是「暗色」的按钮。
 *       这是按用户能看见的东西定位，UI 顺序怎么调都不会碎。
 */
const themesSwitched = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('[role="switch"], button[aria-pressed]')];
  const dark = btns.find((b) => b.textContent?.trim() === "暗色");
  if (!dark) return null;
  dark.click();
  return true;
});
await page.waitForTimeout(600);

check(
  "控制面板里有「暗色」这个模式选项",
  themesSwitched === true,
  themesSwitched ? "找到了并点了" : "没找到文字为「暗色」的按钮",
);

const dark = await page.evaluate(() => {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const bar = document.querySelector(".acrylic");
  return {
    hasClass: root.classList.contains("theme-dark"),
    surface: cs.getPropertyValue("--surface").trim(),
    fg: cs.getPropertyValue("--fg").trim(),
    acrylicBg: cs.getPropertyValue("--acrylic-bg").trim(),
    barBg: bar ? getComputedStyle(bar).backgroundColor : null,
    stored: localStorage.getItem("win10-blog:theme"),
  };
});

check("html 上挂上了 theme-dark", dark.hasClass);
check("--surface 切到暗色", dark.surface === "#1f1f1f", `--surface = ${dark.surface}`);
check("--fg 切到亮色文字", dark.fg === "#e8eaed", `--fg = ${dark.fg}`);
check("任务栏底色跟着切暗", dark.barBg && dark.barBg.includes("28, 30, 34"), dark.barBg ?? "");
check("主题已写入 localStorage", dark.stored === "dark", `localStorage = ${dark.stored}`);

// 刷新后应该仍然是暗色（持久化 + 无闪烁）
//
// ⚠️⚠️ 这里必须用 goto(BASE) 回到桌面，【不能】用 page.reload()。
//
//    踩过的坑：切完主题后 URL 已经被 history.replaceState 改成了 /settings
//    （打开控制面板窗口时会同步 URL）。此时 reload() 刷新的是
//    /settings 这个【静态页】，而静态页用的是 ContentLayout，
//    既没有 React 岛屿，也没有主题启动脚本 ——
//    于是 waitForSelector("astro-island") 超时、class 读出来是空。
//
//    我一开始误以为是持久化失效，其实是测错了页面。
//    这个现象反过来暴露了一个真实的产品缺口（静态页不支持暗色模式），
//    已经记录在文档的"已知限制"里。
//
//    FOUC 检查的关键是「页面自己的脚本执行之前」读一次 class。
//
//    ⚠️ 探针写法要注意：addInitScript 执行时 <html> 【一定】还不存在
//       （document 刚创建，documentElement 是 null）。
//       所以不能在那里直接读 class —— 读到的永远是 "(no-html)"。
//
//       正确做法是轮询等 documentElement 出现，记下它【第一次】可读时的 class。
//       如果主题是 <head> 里的同步脚本打的，
//       那么 documentElement 一出现就已经带着 class 了。
await page.addInitScript(() => {
  window.__themeProbe = "(pending)";
  const tick = () => {
    if (document.documentElement) {
      window.__themeProbe = document.documentElement.className || "(empty)";
      return;
    }
    // documentElement 还没出来，下一帧再看
    requestAnimationFrame(tick);
  };
  tick();
});

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(400);

const fresh = page;

const beforeHydrate = await fresh.evaluate(() => ({
  firstSeen: window.__themeProbe ?? "(未记录)",
  now: document.documentElement.className,
  dark: document.documentElement.classList.contains("theme-dark"),
  url: location.pathname,
}));

check(
  "重新进入桌面仍是暗色（localStorage 持久化生效）",
  beforeHydrate.dark,
  `html.class = "${beforeHydrate.now}"，路径 = ${beforeHydrate.url}`
);

check(
  "无闪白：html 元素一出现就已带主题类",
  beforeHydrate.firstSeen.includes("theme-dark"),
  `首次可读时的 class = "${beforeHydrate.firstSeen}"`
);

/**
 * ⚠️ 这条是本次最重要的检查：FOUC（闪白）。
 *
 *   判断依据是「html 元素第一次可读时，class 里就已经有 theme-dark」。
 *   能满足这条的只有一种实现：同步内联在 <head> 里的脚本。
 *   如果是 React 在 effect 里切主题，首次读到的会是空字符串 ——
 *   那意味着用户会先看到一帧亮色，也就是"闪白"。
 */

await fresh.waitForSelector("astro-island", { state: "attached" });
await fresh.waitForTimeout(800);

/* ══════════════════════════════════════════════════════════
   三、动画开关
   ══════════════════════════════════════════════════════════ */
console.log("\n── 三、动画 ──");

/**
 * 开始菜单的入场动画。
 *
 * ⚠️⚠️ 这里断言的东西变了，值得说明为什么。
 *
 *    旧版开始菜单用的是【CSS 动画】（.anim-menu 类，
 *    animation-name: menu-slide-up），所以那时候检查
 *    getComputedStyle 的 animationName 是对的。
 *
 *    现在改用 Framer Motion（motion/react）了。
 *    Framer Motion 的动画【不走 CSS animation】——
 *    它是在 JS 里逐帧改元素的 style.transform / style.opacity，
 *    所以 animation-name 永远是 "none"。
 *    继续检查 animation-name 会永远失败，但动画其实是好的。
 *
 *    正确的断言方式是检查「动画的产出」而不是「动画的机制」：
 *      1. 元素初始状态应该带 transform（位移/缩放），
 *         说明起点不是最终位置 —— 有东西要"动过来"
 *      2. 等动画播完后，transform 应该收敛到接近最终的
 *         matrix(1,0,0,1,0,0)（即没有位移没有缩放）
 *
 *    这两条合起来就证明了「确实有从 A 到 B 的位移过程」，
 *    而不管你用 CSS 还是 JS 实现。这就是「断言事实，不断言机制」。
 */
const menuAnim = await fresh.evaluate(async () => {
  const btn = document.querySelector('[aria-label="开始"]');
  if (!btn) return { error: "找不到开始按钮" };
  btn.click();

  // 等菜单出现（最多 1 秒）
  const menu = await new Promise((resolve) => {
    let n = 0;
    const tick = () => {
      const el = document.querySelector("[data-startmenu]");
      if (el) return resolve(el);
      if (++n > 60) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });

  if (!menu) return { error: "点了开始按钮但菜单没出现" };

  // 出现瞬间的 transform —— 应该还是"在下面 + 缩小"的状态
  const startT = getComputedStyle(menu).transform;

  // 等 400ms，足够 0.22s 的动画播完
  await new Promise((r) => setTimeout(r, 400));

  const endT = getComputedStyle(menu).transform;
  const cs = getComputedStyle(menu);

  return {
    startTransform: startT,
    endTransform: endT,
    origin: cs.transformOrigin,
    opacity: cs.opacity,
  };
});

/** 解析 matrix 里的位移和缩放，判断是不是"已归位" */
function parseMatrix(t) {
  if (!t || t === "none") return { tx: 0, ty: 0, sx: 1, sy: 1 };
  const m = t.match(/matrix\(([^)]+)\)/);
  if (!m) return { tx: 0, ty: 0, sx: 1, sy: 1 };
  const [a, , , d, e, f] = m[1].split(",").map((v) => parseFloat(v.trim()));
  return { tx: e, ty: f, sx: a, sy: d };
}

const start = parseMatrix(menuAnim?.startTransform);
const end = parseMatrix(menuAnim?.endTransform);
const hasMotion = Math.abs(start.ty) > 1 || Math.abs(start.sx - 1) > 0.005;
const settled =
  Math.abs(end.ty) < 1.5 && Math.abs(end.sx - 1) < 0.01 && Math.abs(end.tx) < 1.5;

check(
  "开始菜单有入场动画（Framer Motion 位移/缩放）",
  menuAnim?.error ? false : hasMotion,
  menuAnim?.error ??
    `起始 transform=${menuAnim.startTransform}（有位移/缩放）`
);
check(
  "动画收敛到最终位置（无残留位移）",
  menuAnim?.error ? false : settled,
  `结束时 transform=${menuAnim.endTransform}`
);
check(
  "transform-origin 在左下角",
  !!menuAnim?.origin && menuAnim.origin.startsWith("0px"),
  menuAnim?.origin ?? ""
);

// 磁贴有错峰与悬停微动效
const tileFx = await fresh.evaluate(() => {
  const t = document.querySelector("[data-tile-id]");
  if (!t) return null;
  const cs = getComputedStyle(t);
  return {
    anim: cs.animationName,
    i: t.style.getPropertyValue("--i"),
    transition: cs.transitionProperty,
    dur: cs.transitionDuration,
  };
});
check("磁贴有入场动画", tileFx?.anim === "tile-in", `animation-name = ${tileFx?.anim}`);
check("磁贴带错峰索引 --i", tileFx?.i !== "" && tileFx?.i !== null, `--i = ${tileFx?.i}`);
check(
  "磁贴有 hover 位移/阴影过渡",
  !!tileFx && tileFx.transition.includes("transform"),
  tileFx?.transition ?? ""
);

// 关闭菜单，测关闭动画开关
await fresh.keyboard.press("Escape");
await fresh.waitForTimeout(300);

const animOff = await fresh.evaluate(async () => {
  // 模拟用户在控制面板里关掉动画
  document.documentElement.classList.add("no-anim");
  const btn = document.querySelector('[aria-label="开始"]');
  if (!btn) return { error: "找不到开始按钮" };
  btn.click();

  // 同样要等菜单挂载，不能立刻读
  const menu = await new Promise((resolve) => {
    let n = 0;
    const tick = () => {
      const el = document.querySelector("[data-startmenu]");
      if (el) return resolve(el);
      if (++n > 60) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });

  if (!menu) return { error: "菜单没出现" };
  const cs = getComputedStyle(menu);
  return { dur: cs.animationDuration, transition: cs.transitionDuration };
});
check(
  "关掉动画后时长被压到 0.01ms",
  !!animOff?.dur && parseFloat(animOff.dur) < 0.01,
  animOff?.error ?? `animation-duration = ${animOff?.dur}`
);

await fresh.evaluate(() => document.documentElement.classList.remove("no-anim"));
await fresh.keyboard.press("Escape");
await fresh.waitForTimeout(300);

/* ══════════════════════════════════════════════════════════
   四、毛玻璃降级
   ══════════════════════════════════════════════════════════ */
console.log("\n── 四、毛玻璃降级（关掉后必须变成实色）──");

const noAcrylic = await fresh.evaluate(() => {
  document.documentElement.classList.add("no-acrylic");
  const bar = document.querySelector(".acrylic");
  const cs = getComputedStyle(bar);
  return { backdrop: cs.backdropFilter, bg: cs.backgroundColor };
});
check(
  "关掉后 backdrop-filter 被移除",
  !noAcrylic.backdrop || noAcrylic.backdrop === "none",
  `backdrop-filter = ${noAcrylic.backdrop}`
);
check(
  "关掉后底色变成不透明（否则壁纸会透出来看不清字）",
  noAcrylic.bg.includes("240, 242, 246") || !noAcrylic.bg.includes("0.78"),
  `background = ${noAcrylic.bg}`
);
await fresh.evaluate(() => document.documentElement.classList.remove("no-acrylic"));

/* ══════════════════════════════════════════════════════════
   五、窗口开关动画 + 无回归
   ══════════════════════════════════════════════════════════ */
console.log("\n── 五、窗口 ──");

const winFx = await fresh.evaluate(() => {
  window.dispatchEvent(
    new CustomEvent("os:open-window", {
      detail: { id: "docs", title: "全部文章", icon: "📁", path: "/posts" },
    })
  );
  return true;
});
void winFx;
await fresh.waitForTimeout(700);

const winInfo = await fresh.evaluate(() => {
  const rnd = document.querySelector(".win-drag-handle")?.parentElement;
  if (!rnd) return null;
  const outer = rnd.parentElement;
  const inner = rnd;
  return {
    rndTransform: getComputedStyle(rnd).transform,
    outerTransform: getComputedStyle(outer).transform,
    // 窗口位置是否正常（不是被顶到 0,0）
    rect: (() => {
      const r = rnd.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
    })(),
  };
});

check(
  "窗口位置正常（motion 未破坏 Rnd 的定位）",
  winInfo ? winInfo.rect.x > 50 && winInfo.rect.y > 50 : false,
  winInfo ? `位置 (${winInfo.rect.x}, ${winInfo.rect.y})，宽 ${winInfo.rect.w}` : "无窗口"
);
check(
  "外层 motion 的 scale 已回到 1（动画结束）",
  winInfo ? winInfo.outerTransform === "none" || winInfo.outerTransform.includes("matrix(1,") : false,
  winInfo?.outerTransform ?? ""
);

// 滚动仍然正常（第五阶段修的 bug，这里守一遍防止动 layout 时回归）
//
// ⚠️ 判断依据只看事实：.win-body 的高度应该【小于】它的内容高度，
//    且 overflow 是 auto/scroll。不看类名 —— 类名会重构，事实不会。
const scrollOk = await fresh.evaluate(() => {
  const b = document.querySelector(".win-body");
  if (!b) return null;
  const cs = getComputedStyle(b);
  return {
    clientH: b.clientHeight,
    scrollH: b.scrollHeight,
    overflowY: cs.overflowY,
    canScroll: b.scrollHeight > b.clientHeight,
  };
});
check(
  "窗口内容区限高仍正常（无回归）",
  !!scrollOk && scrollOk.clientH > 100 && scrollOk.clientH < 900 && scrollOk.overflowY === "auto",
  scrollOk ? `可视高 ${scrollOk.clientH}px / 内容高 ${scrollOk.scrollH}px / overflow=${scrollOk.overflowY}` : "找不到 .win-body"
);

/* ══════════════════════════════════════════════════════════
   六、静态页主题支持

   ⚠️ 这一节是补测的，因为它是真实缺口：
      静态页（/posts/x、/about 等）用的是 ContentLayout，
      一开始没接主题 —— 暗色模式用户从桌面点进文章会看到一片亮白。
      同一个站两个主题，体验割裂。
   ══════════════════════════════════════════════════════════ */
console.log("\n── 六、静态页主题 ──");

await page.goto(`${BASE}/about`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);

const staticDark = await page.evaluate(() => {
  const body = document.body;
  const cs = getComputedStyle(body);
  const toggle = document.querySelector("[data-theme-toggle]");
  return {
    cls: document.documentElement.className,
    bodyBg: cs.backgroundColor,
    bodyColor: cs.color,
    hasToggle: !!toggle,
    icon: document.querySelector("[data-theme-icon]")?.textContent ?? null,
  };
});

check(
  "静态页也带上了 theme-dark（跨页面主题一致）",
  staticDark.cls.includes("theme-dark"),
  `html.class = "${staticDark.cls}"`
);

check(
  "静态页背景跟随暗色（不是亮白）",
  !staticDark.bodyBg.includes("244, 246, 249") && staticDark.bodyBg !== "rgb(255, 255, 255)",
  `body background = ${staticDark.bodyBg}`
);

check("静态页有主题切换按钮", staticDark.hasToggle);

/**
 * ⚠️ 图标的语义是「点击后会变成什么」，不是「当前是什么」。
 *
 *   所以暗色模式下显示 ☀️（点它切到亮色），
 *   亮色模式下显示 🌙（点它切到暗色）。
 *
 *   这和 Google、GitHub 等主流做法一致，也是用户直觉：
 *   按钮上的图标暗示的是"按下去会发生什么"。
 *
 *   我第一版测试把它断言反了，白排查了一轮 —— 记在这里免得以后又绕进去。
 */
check(
  "静态页按钮图标为太阳（暗色态，点击将切到亮色）",
  staticDark.icon === "☀️",
  `图标 = ${staticDark.icon}`
);

// 点一下切换，应变成亮色
const afterToggle = await page.evaluate(async () => {
  document.querySelector("[data-theme-toggle]")?.click();
  await new Promise((r) => setTimeout(r, 250));
  return {
    cls: document.documentElement.className,
    icon: document.querySelector("[data-theme-icon]")?.textContent ?? null,
    stored: localStorage.getItem("win10-blog:theme"),
  };
});

check(
  "静态页点按钮能切回亮色",
  !afterToggle.cls.includes("theme-dark"),
  `html.class = "${afterToggle.cls}"`
);
check(
  "静态页切换后图标变月亮（亮色态，点击将切到暗色）",
  afterToggle.icon === "🌙",
  `图标 = ${afterToggle.icon}`
);
check(
  "静态页切换写入了同一个 localStorage 键",
  afterToggle.stored === "light",
  `localStorage = ${afterToggle.stored}`
);

// 切回暗色，避免影响后面的检查
await page.evaluate(() => {
  if (!document.documentElement.classList.contains("theme-dark")) {
    document.querySelector("[data-theme-toggle]")?.click();
  }
});

/* ══════════════════════════════════════════════════════════
   七、控制台无报错
   ══════════════════════════════════════════════════════════ */
console.log("\n── 七、控制台 ──");
const realErrors = errors.filter((e) => !e.includes("favicon") && !e.includes("404"));
check("无 JS 运行时报错", realErrors.length === 0, realErrors.slice(0, 3).join(" | ") || "干净");

await browser.close();

/* ══════════════════════════════════════════════════════════
   汇总
   ══════════════════════════════════════════════════════════ */
const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass);
console.log(`\n${"═".repeat(56)}`);
console.log(`验收结果：${pass}/${results.length} 通过`);
if (fail.length) {
  console.log("\n失败项：");
  for (const f of fail) console.log(`  ❌ ${f.name}  ${f.detail}`);
}
console.log(`${"═".repeat(56)}`);
process.exit(fail.length ? 1 : 0);
