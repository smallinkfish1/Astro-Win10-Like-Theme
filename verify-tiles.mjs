/**
 * 第五阶段（磁贴网格 + 点击交互）浏览器验收脚本。
 *
 * 跑法：node verify-tiles.mjs
 * 前置：npx astro preview --port 4400 已在跑
 */
import { chromium } from "playwright";

const BASE = "http://localhost:4400";
const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${name}${detail ? "  → " + detail : ""}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

// 收集页面控制台警告（磁贴 id 重复之类）
const warnings = [];
page.on("console", (m) => {
  if (m.type() === "warning") warnings.push(m.text());
});

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("astro-island", { timeout: 8000 });
await page.waitForTimeout(600);

/* ══════════════ 一、打开开始菜单 ══════════════ */
console.log("\n── 一、开始菜单与磁贴网格 ──");

await page.click('button[aria-label="开始"]');
await page.waitForTimeout(500);

const gridBox = await page.$("#tile-grid");
check("磁贴网格已渲染", gridBox !== null);

const tiles = await page.$$("[data-tile-id]");
check("磁贴数量正确", tiles.length === 10, `${tiles.length} 个（4 配置 + 2 分类 + 4 标签）`);

/* ══════════════ 二、几何：必须是正方形 ══════════════ */
console.log("\n── 二、磁贴几何（正方形 + 尺寸档位）──");

const geo = await page.evaluate(() => {
  const els = [...document.querySelectorAll("[data-tile-id]")];
  return els.map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      id: el.getAttribute("data-tile-id"),
      label: el.textContent?.trim() ?? "",
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      pos: cs.position,
      bg: cs.backgroundColor,
      color: cs.color,
    };
  });
});

// 1. 全部是正方形
const nonSquare = geo.filter((g) => Math.abs(g.w - g.h) > 1);
check("所有磁贴都是正方形", nonSquare.length === 0,
  nonSquare.length ? nonSquare.map((g) => `${g.id}:${g.w}×${g.h}`).join(", ") : `共 ${geo.length} 个，宽高全部相等`);

// 2. 两种尺寸档位
const sizeSet = [...new Set(geo.map((g) => g.w))].sort((a, b) => a - b);
check("存在两种尺寸档位", sizeSet.length === 2, `实测边长: ${sizeSet.join("px / ")}px`);

const small = sizeSet[0];
const large = sizeSet[1];
// 期望：大 = 小 × 2 + gap(=6)
check("大磁贴 = 小磁贴 × 2 + 缝隙", large === small * 2 + 6,
  `${large} === ${small}×2 + 6`);

// 3. 绝对定位
check("磁贴使用绝对定位", geo.every((g) => g.pos === "absolute"));

// 4. 文字是白色（深色底上要看得清）
check("文字为白色", geo.every((g) => g.color === "rgb(255, 255, 255)"));

/* ══════════════ 三、对齐：网格必须严丝合缝 ══════════════ */
console.log("\n── 三、网格对齐（无重叠/无错位）──");

const align = await page.evaluate(() => {
  const grid = document.querySelector("#tile-grid");
  const gr = grid.getBoundingClientRect();
  const els = [...document.querySelectorAll("[data-tile-id]")];
  return {
    gridW: Math.round(gr.width),
    gridH: Math.round(gr.height),
    tiles: els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.getAttribute("data-tile-id"),
        // 相对网格左上角的偏移
        dx: Math.round(r.x - gr.x),
        dy: Math.round(r.y - gr.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    }),
  };
});

const CELL = 76;
const GAP = 6;
const STEP = CELL + GAP; // 82

// 每个磁贴的偏移必须是 (cell+gap) 的整数倍
const misaligned = align.tiles.filter((t) => t.dx % STEP !== 0 || t.dy % STEP !== 0);
check("所有磁贴对齐到网格", misaligned.length === 0,
  misaligned.length ? misaligned.map((t) => `${t.id} @(${t.dx},${t.dy})`).join(", ")
                    : `步长 ${STEP}px，全部落在格点上`);

// 矩形两两不重叠
function overlaps(a, b) {
  return a.dx < b.dx + b.w && b.dx < a.dx + a.w && a.dy < b.dy + b.h && b.dy < a.dy + a.h;
}
const collisions = [];
for (let i = 0; i < align.tiles.length; i++) {
  for (let j = i + 1; j < align.tiles.length; j++) {
    if (overlaps(align.tiles[i], align.tiles[j])) {
      collisions.push(`${align.tiles[i].id}×${align.tiles[j].id}`);
    }
  }
}
check("磁贴两两不重叠", collisions.length === 0,
  collisions.length ? collisions.join(", ") : `${align.tiles.length} 个磁贴无碰撞`);

// 没有任何磁贴超出网格边界
const outOfBounds = align.tiles.filter(
  (t) => t.dx < 0 || t.dy < 0 || t.dx + t.w > align.gridW + 1 || t.dy + t.h > align.gridH + 1
);
check("磁贴不超出网格边界", outOfBounds.length === 0,
  outOfBounds.length ? outOfBounds.map((t) => t.id).join(", ")
                     : `网格 ${align.gridW}×${align.gridH}px`);

// 容器尺寸应等于 列数×cell + (列数-1)×gap
const expectW = 4 * CELL + 3 * GAP;
check("网格宽度符合公式", align.gridW === expectW,
  `${align.gridW} === 4×${CELL} + 3×${GAP}`);

/* ══════════════ 四、配置驱动 ══════════════ */
console.log("\n── 四、配置驱动（来自 tiles.ts）──");

const labels = geo.map((g) => g.label);
for (const want of ["最新文章", "GitHub", "B站", "关于我"]) {
  check(`配置磁贴存在：${want}`, labels.some((l) => l.includes(want)));
}
check("自动追加了分类磁贴", labels.some((l) => ["前端", "随笔"].some((c) => l.includes(c))));
check("自动追加了标签磁贴", labels.some((l) => l.includes("交互") || l.includes("设计")));

// 大磁贴应该是「最新文章」
const lgTile = geo.find((g) => g.w === large);
check("大磁贴是最新文章", lgTile?.label.includes("最新文章") ?? false, lgTile?.label ?? "");

// 控制台不应有 id 重复警告
const dupWarn = warnings.filter((w) => w.includes("磁贴 id 重复"));
check("无磁贴 id 重复警告", dupWarn.length === 0, dupWarn.join("; "));

/* ══════════════ 五、点击交互 ══════════════ */
console.log("\n── 五、点击交互 ──");

// 5.1 站内路径：应打开窗口
const postsTile = await page.$('[data-tile-id="all-posts"]');
const pb = await postsTile.boundingBox();
await postsTile.click();
await page.waitForTimeout(700);

let winCount = await page.$$eval(".win-drag-handle", (els) => els.length);
check("点站内磁贴打开窗口", winCount === 1, `${winCount} 个窗口`);
check("URL 已同步为 /posts", page.url().endsWith("/posts"), page.url());

let menuGone = (await page.$("#tile-grid")) === null;
check("点击后开始菜单收起", menuGone);

// 5.2 外链：应该新开标签页，不打开窗口
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("astro-island");
await page.waitForTimeout(400);
await page.click('button[aria-label="开始"]');
await page.waitForTimeout(400);

const before = page.context().pages().length;
const ghTile = await page.$('[data-tile-id="github"]');
const gb = await ghTile.boundingBox();

// window.open 要拦下来，否则会真的去访问 github
await page.evaluate(() => {
  window.__opened = [];
  window.open = (url, target, features) => {
    window.__opened.push({ url, target, features });
    return null;
  };
});

await ghTile.click();
await page.waitForTimeout(400);

const opened = await page.evaluate(() => window.__opened);
check("外链磁贴调用 window.open", opened.length === 1, JSON.stringify(opened[0] ?? null));
check("外链目标是新标签页", opened[0]?.target === "_blank");
check("外链带 noopener", (opened[0]?.features ?? "").includes("noopener"));
check("外链地址正确", opened[0]?.url?.includes("github.com") ?? false, opened[0]?.url ?? "");
check("外链不打开桌面窗口",
  (await page.$$eval(".win-drag-handle", (e) => e.length)) === 0);
check("外链点击后菜单收起", (await page.$("#tile-grid")) === null);

/* ══════════════ 六、大磁贴点击 ══════════════ */
console.log("\n── 六、大磁贴 ──");

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("astro-island");
await page.waitForTimeout(400);
await page.click('button[aria-label="开始"]');
await page.waitForTimeout(400);

const big = await page.$('[data-tile-id="all-posts"]');
const bb = await big.boundingBox();
await big.click();
await page.waitForTimeout(700);

const bigWin = await page.evaluate(() => {
  const el = document.querySelector(".win-drag-handle")?.parentElement;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});
check("大磁贴打开更大的窗口", bigWin ? bigWin.w === 860 : false,
  bigWin ? `${bigWin.w}×${bigWin.h}` : "无窗口");

/* ══════════════ 七、快捷方式仍然可用 ══════════════ */
console.log("\n── 七、左侧快捷方式（未被破坏）──");

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("astro-island");
await page.waitForTimeout(400);
await page.click('button[aria-label="开始"]');
await page.waitForTimeout(400);

/**
 * 快捷方式按钮的文字是「图标 + 文字」（比如 "🖥️此电脑"），
 * 所以要用 includes 而不是全等。一开始写成全等，测试假失败了。
 *
 * ⚠️ 第六阶段把快捷方式换成了 5 个桌面同款（图标也换成 /icons/*.png），
 *    所以这里跟着更新成新的五个名字。
 */
const QUICK_NAMES = ["此电脑", "记事本", "浏览器", "回收站", "控制面板"];
const quick = await page.$$eval("button", (btns, names) =>
  btns
    .map((b) => b.textContent?.trim() ?? "")
    .filter((t) => names.some((k) => t.includes(k))),
  QUICK_NAMES
);
check("左侧 5 个快捷方式都在", quick.length === 5, quick.join(" / "));

// 点「此电脑」应打开归档窗口
const pcBtn = await page.evaluateHandle(() => {
  return [...document.querySelectorAll("button")].find((b) =>
    b.textContent?.trim().includes("此电脑")
  );
});
await pcBtn.asElement().click();
await page.waitForTimeout(600);
check("快捷方式仍能开窗口",
  (await page.$$eval(".win-drag-handle", (e) => e.length)) === 1);
check("快捷方式 URL 同步", page.url().endsWith("/archive"), page.url());

/* ══════════════ 八、移动端 ══════════════ */
console.log("\n── 八、移动端 (390×844) ──");

const m = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await m.goto(BASE, { waitUntil: "networkidle" });
await m.waitForSelector("astro-island");
await m.waitForTimeout(600);

await m.evaluate(() => {
  const btn = document.querySelector('button[aria-label="开始"]');
  btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await m.waitForTimeout(600);

const mobileGrid = await m.evaluate(() => {
  const g = document.querySelector("#tile-grid");
  if (!g) return null;
  const r = g.getBoundingClientRect();
  const menu = g.closest(".startmenu-scroll");
  return {
    gridW: Math.round(r.width),
    viewportW: window.innerWidth,
    menuOverflowX: menu ? menu.scrollWidth - menu.clientWidth : null,
  };
});
check("移动端磁贴网格仍渲染", mobileGrid !== null,
  mobileGrid ? `网格宽 ${mobileGrid.gridW}px` : "");
check("移动端开始菜单不超出屏幕", mobileGrid ? mobileGrid.gridW <= 390 : false,
  mobileGrid ? `网格 ${mobileGrid.gridW} ≤ 视口 ${mobileGrid.viewportW}` : "");

await browser.close();

/* ══════════════ 汇总 ══════════════ */
const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass);
console.log(`\n${"═".repeat(58)}`);
console.log(`验收结果：${pass}/${results.length} 通过`);
if (fail.length) {
  console.log("\n未通过项：");
  fail.forEach((f) => console.log(`  ❌ ${f.name}  ${f.detail}`));
}
console.log("═".repeat(58));
process.exit(fail.length ? 1 : 0);
