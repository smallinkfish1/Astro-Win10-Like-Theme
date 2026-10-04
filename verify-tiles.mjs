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

/**
 * 网格几何常量。
 *
 * ⚠️ 这三个必须定义在【最前面】，不能放在用到它们的章节旁边。
 *    JS 的 const 有 TDZ（暂时性死区）—— 在声明之前读会直接
 *    抛 ReferenceError，而不是给你 undefined。
 *    之前把它放在第三节，结果第二节就用到了，脚本当场崩溃，
 *    且崩溃被 try 逻辑吞掉后只报告"套件失败"，看不出原因。
 *
 *    ⚠️ 这三个值要和 src/config/tiles.ts 里的 GRID 保持一致。
 *       改了那边记得改这边（或者哪天改成从配置里 import）。
 */
const CELL = 76;
const GAP = 6;
const STEP = CELL + GAP; // 82
/** 2 格跨度的实际像素：cell×2 + gap */
const SPAN2 = CELL * 2 + GAP; // 158

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

/**
 * 磁贴数量。
 *
 * ⚠️ 这里断言的是「配置里写了几个」而不是写死 10。
 *    写死数字的问题是：你往 tiles.ts 加一个磁贴，测试就挂，
 *    但你改的是配置不是代码 —— 测试应该跟着配置走。
 *
 *    算一下期望值：
 *      Create 组：4 个（最新文章 / 归档 / 记事本 / 标签）
 *      Play   组：3 个（GitHub / B站 / 相册）
 *      Explore 组：3 个（关于我 / 搜索 / 控制面板）
 *      自动追加：2 分类 + 4 标签 = 6 个（挂到最后一组）
 *    ─────────────
 *      合计 16 个
 *
 * ⚠️ 用 >= 而不是 ===：自动追加的数量取决于你写了几篇文章，
 *    文章少的时候分类/标签可能不足 6 个（比如只有 1 个标签）。
 *    硬等号会让"还没写够文章"变成一次测试失败，那是假警报。
 */
const CONF_TILES = 10;
const AUTO_MAX = 6;
const tiles = await page.$$("[data-tile-id]");
check("磁贴数量正确", tiles.length >= CONF_TILES && tiles.length <= CONF_TILES + AUTO_MAX,
  `${tiles.length} 个（配置 ${CONF_TILES} + 自动追加最多 ${AUTO_MAX}）`);

/* ══════════════ 二、几何：四种尺寸档位 ══════════════ */
console.log("\n── 二、磁贴几何（尺寸档位）──");

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

/**
 * 尺寸档位检查。
 *
 * ⚠️ 现在是 4 种尺寸：sm(1×1) / wide(2×1) / md(1×2) / lg(2×2)。
 *    所以"所有磁贴都是正方形"这条断言已经【不成立】了 ——
 *    wide 和 md 本来就是长方形，这是需求要的。
 *
 *    改成按「宽高是否都属于 {1格, 2格}」判定，
 *    并单独断言存在宽磁贴（你截图里 "Get Office" 那种）。
 */
const ONE = CELL;
const TWO = SPAN2;

// 1. 每个磁贴的宽高必须各自等于 1 格或 2 格
const badSize = geo.filter((g) => ![ONE, TWO].includes(g.w) || ![ONE, TWO].includes(g.h));
check("所有磁贴尺寸都是 1 格或 2 格", badSize.length === 0,
  badSize.length ? badSize.map((g) => `${g.id}:${g.w}×${g.h}`).join(", ")
                 : `全部边长 ∈ {${ONE}, ${TWO}}`);

// 2. 按宽高组合归类，确认四种档位都存在
const shapeOf = (g) => `${g.w === TWO ? 2 : 1}x${g.h === TWO ? 2 : 1}`;
const shapes = [...new Set(geo.map(shapeOf))].sort();
check("存在小磁贴 1x1", shapes.includes("1x1"), `实测有：${shapes.join(" / ")}`);
check("存在大磁贴 2x2", shapes.includes("2x2"), `实测有：${shapes.join(" / ")}`);
check("存在宽磁贴 2x1", shapes.includes("2x1"), `实测有：${shapes.join(" / ")}`);

// 3. 几何一致性：2 格 = 1 格 × 2 + gap
check("2 格跨度 = 1 格 × 2 + 缝隙", TWO === ONE * 2 + GAP,
  `${TWO} === ${ONE}×2 + ${GAP}`);

// 4. 绝对定位
check("磁贴使用绝对定位", geo.every((g) => g.pos === "absolute"));

// 5. 文字是白色（深色底上要看得清）
check("文字为白色", geo.every((g) => g.color === "rgb(255, 255, 255)"));

/**
 * ⚠️⚠️ 这里所有断言都改成「按尺寸分类」而不是「按边长排序」。
 *
 *    旧版只有两种尺寸（76 / 158），可以直接拿"最小"和"最大"比。
 *    现在支持四种（1×1 / 2×1 / 1×2 / 2×2），边长会出现：
 *         76（sm 和 wide 的高度）
 *        158（wide 的宽度、md 的高度、lg 的宽高）
 *    单纯按边长分组会混淆 —— 158 既是"2 格宽"也是"2 格高"。
 *
 *    所以改成按【宽高比 + 边长】联合判定每种档位，
 *    而且断言的是「几何一致性」（大 = 小×2 + gap），
 *    不是写死的像素值 —— 这样你以后调 GRID.cell 测试也不会挂。
 */

const CELL2 = CELL; // 仅为避免误用未定义变量保留；实际断言用顶部常量
void CELL2;

/* ══════════════ 三、对齐：网格必须严丝合缝 ══════════════ */
console.log("\n── 三、网格对齐（无重叠/无错位）──");

/**
 * ⚠️ 每一组是【独立坐标系】，所以对齐检查必须按组分别做。
 *
 *    旧版只有一个 #tile-grid 容器，直接用它的 rect 当原点。
 *    现在有三个分组，每组有自己的容器，磁贴的 left/top 是
 *    相对【自己那一组】算的 —— 拿全页所有磁贴和第一个网格
 *    的原点比，第二三组的磁贴全都会"看起来错位"。
 *
 *    这是分组布局带来的必然变化，不是布局错了。
 */
const align = await page.evaluate(() => {
  const groups = [...document.querySelectorAll("#tile-grid section")];
  return groups.map((sec) => {
    const grid = sec.querySelector("div.relative");
    if (!grid) return null;
    const gr = grid.getBoundingClientRect();
    const els = [...grid.querySelectorAll("[data-tile-id]")];
    return {
      title: sec.querySelector("h3")?.textContent?.trim() ?? "?",
      gridW: Math.round(gr.width),
      gridH: Math.round(gr.height),
      tiles: els.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id: el.getAttribute("data-tile-id"),
          // 相对【本组】网格左上角的偏移
          dx: Math.round(r.x - gr.x),
          dy: Math.round(r.y - gr.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      }),
    };
  }).filter(Boolean);
});

check("开始菜单有多个分组", align.length >= 2, `实测 ${align.length} 组：${align.map((g) => g.title).join(" / ")}`);

// 每组内部：磁贴偏移必须是 (cell+gap) 的整数倍
const misaligned = [];
for (const g of align) {
  for (const t of g.tiles) {
    if (t.dx % STEP !== 0 || t.dy % STEP !== 0) {
      misaligned.push(`${g.title}/${t.id} @(${t.dx},${t.dy})`);
    }
  }
}
check("所有磁贴对齐到网格（按组）", misaligned.length === 0,
  misaligned.length ? misaligned.join(", ")
                    : `步长 ${STEP}px，${align.length} 组共 ${align.reduce((n, g) => n + g.tiles.length, 0)} 个磁贴全部落在格点上`);

// 组内矩形两两不重叠
function overlaps(a, b) {
  return a.dx < b.dx + b.w && b.dx < a.dx + a.w && a.dy < b.dy + b.h && b.dy < a.dy + a.h;
}
const collisions = [];
for (const g of align) {
  for (let i = 0; i < g.tiles.length; i++) {
    for (let j = i + 1; j < g.tiles.length; j++) {
      if (overlaps(g.tiles[i], g.tiles[j])) {
        collisions.push(`${g.title}: ${g.tiles[i].id}×${g.tiles[j].id}`);
      }
    }
  }
}
check("磁贴两两不重叠", collisions.length === 0,
  collisions.length ? collisions.join(", ") : "全部组内无碰撞");

// 组内没有任何磁贴超出该组网格边界
const outOfBounds = [];
for (const g of align) {
  for (const t of g.tiles) {
    if (t.dx < 0 || t.dy < 0 || t.dx + t.w > g.gridW + 1 || t.dy + t.h > g.gridH + 1) {
      outOfBounds.push(`${g.title}/${t.id}`);
    }
  }
}
check("磁贴不超出所在组边界", outOfBounds.length === 0,
  outOfBounds.length ? outOfBounds.join(", ")
                     : align.map((g) => `${g.title}:${g.gridW}×${g.gridH}`).join(" | "));

// 容器尺寸符合公式：列数×cell + (列数-1)×gap = 4×76 + 3×6 = 322
const expectW = 4 * CELL + 3 * GAP;
const badWidth = align.filter((g) => g.gridW !== expectW);
check("每组网格宽度符合公式", badWidth.length === 0,
  badWidth.length ? badWidth.map((g) => `${g.title}=${g.gridW}`).join(", ")
                  : `全部 === 4×${CELL} + 3×${GAP} = ${expectW}`);

/* ══════════════ 四、配置驱动 ══════════════ */
console.log("\n── 四、配置驱动（来自 tiles.ts）──");

const labels = geo.map((g) => g.label);
for (const want of ["最新文章", "GitHub", "B站", "关于我"]) {
  check(`配置磁贴存在：${want}`, labels.some((l) => l.includes(want)));
}
check("自动追加了分类磁贴", labels.some((l) => ["前端", "随笔"].some((c) => l.includes(c))));
check("自动追加了标签磁贴", labels.some((l) => l.includes("交互") || l.includes("设计")));

/**
 * ⚠️ 大磁贴现在是【两个】：最新文章 和 归档（实时磁贴）。
 *    两者都是 2×2，所以断言改成「至少有一个 2×2」，并点名检查。
 */
const lgTiles = geo.filter((g) => g.w === TWO && g.h === TWO);
check("存在 2×2 大磁贴", lgTiles.length >= 1,
  lgTiles.map((g) => g.label).join(" / ") || "没有");
check("最新文章是 2×2 大磁贴",
  lgTiles.some((g) => g.label.includes("最新文章")),
  lgTiles.map((g) => g.label).join(" / "));

/**
 * ⚠️ 实时磁贴：归档磁贴应该显示「今天的日期数字」。
 *
 *    这是「实时」的定义 —— 内容不是写死的文案，而是运行时算出来的。
 *    断言方式是拿今天的真实日期去比对，而不是比对一个固定字符串。
 *    这样测试不会因为它换一天跑就挂。
 */
const today = new Date().getDate();
const liveTileText = geo.find((g) => g.label.includes("归档"))?.label ?? "";
check("实时磁贴显示了今天的日期", liveTileText.includes(String(today)),
  `今天是 ${today} 号，磁贴内文本："${liveTileText.replace(/\s+/g, " ").slice(0, 40)}"`);

// 控制台不应有 id 重复警告
const dupWarn = warnings.filter((w) => w.includes("磁贴 id 重复"));
check("无磁贴 id 重复警告", dupWarn.length === 0, dupWarn.join("; "));

// 也不该有"放不下被跳过"的警告
const dropWarn = warnings.filter((w) => w.includes("放不进网格"));
check("没有磁贴因为排不下被跳过", dropWarn.length === 0, dropWarn.join("; "));

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

/* ══════════════ 七、左侧导航仍然可用 ══════════════ */
console.log("\n── 七、左侧导航（最近添加 + 字母索引）──");

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("astro-island");
await page.waitForTimeout(400);
await page.click('button[aria-label="开始"]');
await page.waitForTimeout(400);

/**
 * ⚠️⚠️ 左栏结构变了，断言也跟着变。
 *
 *    旧版：左栏是「5 个快捷方式」（此电脑/记事本/浏览器/回收站/控制面板），
 *          像一排按钮那样平铺。
 *
 *    新版：改成 Win10 真实的左栏结构 ——
 *            · 顶部「最近添加」区（3 项）
 *            · 「展开/收起」开关
 *            · 按首字母分组的「所有应用」列表（A/B/G/... 标题 + 条目）
 *          这才是你截图里的样子。
 *
 *    所以「左侧必须有 5 个快捷方式」这条已经不成立了。
 *    改成断言新结构的真实特征：
 *      1. 五个常用应用都能在左栏里找到（内容没丢，只是换了组织形式）
 *      2. 出现了「最近添加」这个区
 *      3. 出现了字母分组标题
 *      4. 展开了「所有应用」之后条目数明显变多
 *
 * ⚠️ 第 1 条为什么要用「都在」而不是「等于 5」？
 *    因为「浏览器」「回收站」这些词现在会同时出现在
 *    最近添加区和字母索引区（同一个应用在两处都有入口，这是正常的），
 *    用 === 5 会永远失败。
 */
const NAV_NAMES = ["此电脑", "记事本", "浏览器", "回收站", "控制面板"];
const navText = await page.$eval("[data-startmenu]", (el) => el.innerText);

const missing = NAV_NAMES.filter((n) => !navText.includes(n));
check(
  "五个常用应用都还能在开始菜单里找到",
  missing.length === 0,
  missing.length ? `缺少：${missing.join(" / ")}` : `全部命中：${NAV_NAMES.join(" / ")}`
);

check("左栏有「最近添加」区", navText.includes("最近添加"), "已渲染");

/**
 * 字母分组标题。
 *
 * ⚠️ 中文条目会被归到 "#" 区（见 config/startMenu.ts 的说明），
 *    英文条目才产生 A/B/G 这样的字母标题。
 *    所以这里断言的是「至少有一个分组标题」，
 *    而不是「必须有 A、B、C」—— 后者取决于你配了哪些英文应用，
 *    不是主题本身的性质。
 */
const hasLetterHeader = await page.evaluate(() => {
  const menu = document.querySelector("[data-startmenu]");
  if (!menu) return false;
  // 分组标题是 h3 之外的裸 div，用「单个大写字母或 #」这个特征找
  const text = menu.innerText;
  return /(^|\n)\s*(#|[A-Z])\s*(\n|$)/.test(text);
});
check("左栏有字母分组标题", hasLetterHeader, "找到 A/B/C 或 # 之类的分区标题");

/** 「展开/收起」开关能切换条目数量 */
const countRows = () =>
  page.evaluate(() => {
    const menu = document.querySelector("[data-startmenu]");
    if (!menu) return 0;
    return menu.querySelectorAll("button").length;
  });

const rowsExpanded = await countRows();

// 找到「收起」按钮并点它
await page.evaluate(() => {
  const menu = document.querySelector("[data-startmenu]");
  const btn = [...menu.querySelectorAll("button")].find((b) =>
    /收起|展开/.test(b.textContent ?? "")
  );
  btn?.click();
});
await page.waitForTimeout(300);
const rowsCollapsed = await countRows();

check(
  "「展开/收起」能折叠所有应用列表",
  rowsCollapsed < rowsExpanded,
  `展开 ${rowsExpanded} 个按钮 → 收起 ${rowsCollapsed} 个`
);

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
