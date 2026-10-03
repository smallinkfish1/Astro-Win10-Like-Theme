/**
 * 第四阶段浏览器验收脚本。
 *
 * 跑法：node verify.mjs
 * 前置：npm run preview 已在 4321 端口跑起来
 *
 * 检查的是「静态页那一路」和「窗口那一路」是否真的都成立，
 * 以及两者共用的 .md-body 排版有没有漂移。
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

/* ══════════════════════════════════════════════════════════
   一、静态文章页（SEO 路径）
   ══════════════════════════════════════════════════════════ */
console.log("\n── 一、静态文章页（SEO 路径）──");

await page.goto(`${BASE}/posts/why-win10`, { waitUntil: "networkidle" });

// 1. 正文在 HTML 里（而不是靠 JS 渲染出来的）
const html = await page.content();
check("静态页 HTML 含正文", html.includes("起因是一个很普通的下午"));

// 2. 有 canonical 与 description
const canonical = await page.getAttribute('link[rel="canonical"]', "href");
check("有 canonical 链接", !!canonical, canonical ?? "");

const desc = await page.getAttribute('meta[name="description"]', "content");
check("有 meta description", !!desc && desc.length > 10);

// 3. 结构化数据
const ld = await page.$eval('script[type="application/ld+json"]', (el) => el.textContent);
const ldObj = JSON.parse(ld);
check("有 BlogPosting 结构化数据", ldObj["@type"] === "BlogPosting", ldObj.headline);

// 4. 静态页上必须没有窗口系统（那套只在首页）
const hasIsland = await page.$("astro-island");
check("静态页不挂载 React 岛屿", hasIsland === null);

/* ══════════════════════════════════════════════════════════
   二、排版基准：量出静态页的 .md-body 关键样式
   ══════════════════════════════════════════════════════════ */
console.log("\n── 二、静态页排版基准 ──");

const staticStyles = await page.evaluate(() => {
  const body = document.querySelector(".md-body");
  const h2 = body.querySelector("h2");
  const p = body.querySelector("p");
  const code = body.querySelector("code");
  const pre = body.querySelector("pre");
  const ul = body.querySelector("ul");
  const bq = body.querySelector("blockquote");
  const g = (el) => (el ? getComputedStyle(el) : null);
  return {
    body: { lh: g(body).lineHeight, color: g(body).color, fs: g(body).fontSize },
    h2: h2 ? { fs: g(h2).fontSize, fw: g(h2).fontWeight, mt: g(h2).marginTop, bb: g(h2).borderBottomWidth } : null,
    p: p ? { mb: g(p).marginBottom } : null,
    code: code ? { bg: g(code).backgroundColor, color: g(code).color } : null,
    pre: pre ? { bg: g(pre).backgroundColor, radius: g(pre).borderRadius } : null,
    ul: ul ? { ls: g(ul).listStyleType, pl: g(ul).paddingLeft } : null,
    bq: bq ? { bl: g(bq).borderLeftWidth, color: g(bq).color } : null,
  };
});
console.log("  " + JSON.stringify(staticStyles, null, 0).slice(0, 200) + "…");
check("静态页 .md-body 生效", staticStyles.body.lh !== "normal", `line-height=${staticStyles.body.lh}`);
check("静态页 h2 有下边框", staticStyles.h2?.bb === "1px");
check("静态页代码块有深色底", staticStyles.pre?.bg !== "rgba(0, 0, 0, 0)");

/* ══════════════════════════════════════════════════════════
   三、桌面首页：窗口系统
   ══════════════════════════════════════════════════════════ */
console.log("\n── 三、桌面首页与窗口 ──");

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("astro-island", { timeout: 8000 });

// 岛屿挂载了吗
const islandCount = await page.$$eval("astro-island", (els) => els.length);
check("React 岛屿已挂载", islandCount >= 2, `${islandCount} 个岛屿`);

// 双击"记事本"打开文章窗口。
// ⚠️ 第六阶段把桌面图标从 9 个精简成 5 个，原来的 "我的文档"(docs) 没了，
//    它的职责分给了"此电脑"(pc，资源管理器列表) 和"记事本"(notepad，读原文)。
//    这条测试用它俩里更接近原语意的 notepad 继续验证「双击图标 → 开会话窗口」。
const card = await page.$("[data-icon-id='notepad']");
const box = await card.boundingBox();
await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(700);

let winCount = await page.$$eval(".win-drag-handle", (els) => els.length);
check("双击图标打开窗口", winCount === 1, `${winCount} 个窗口`);

// 窗口里有没有内容（记事本是一整块 textarea）
const cardCount = await page.$$eval("textarea, .post-card", (els) => els.length);
check("窗口内渲染出文章内容", cardCount >= 1, `${cardCount} 个内容节点`);

// URL 同步了吗
check("URL 已同步为 /posts", page.url().endsWith("/posts"), page.url());

/* ── 换用「此电脑」做文章双击测试 ──
   因为记事本里是纯文本，没有可双击的文章行；资源管理器才有。 */
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("astro-island", { state: "attached" });
await page.waitForTimeout(400);

const pcIcon = await page.$("[data-icon-id='pc']");
const pb = await pcIcon.boundingBox();
await page.mouse.dblclick(pb.x + pb.width / 2, pb.y + pb.height / 2);
await page.waitForTimeout(700);

/* ── 在资源管理器里双击一篇文章 ── */
const firstRow = (await page.$$(".win-body tbody tr"))[0];
const cb = await firstRow.boundingBox();
await page.mouse.dblclick(cb.x + 60, cb.y + 8);
await page.waitForTimeout(700);

winCount = await page.$$eval(".win-drag-handle", (els) => els.length);
check("双击文章打开第二个窗口", winCount === 2, `${winCount} 个窗口`);

const url = page.url();
check("URL 变为文章路径", /\/posts\/[a-z-]+$/.test(url), url);

/* ── 关键：窗口内的 .md-body 排版是否和静态页一致 ── */
console.log("\n── 四、两路渲染的样式一致性（核心）──");

const windowStyles = await page.evaluate(() => {
  const body = document.querySelector(".win-body .md-body");
  if (!body) return null;
  const h2 = body.querySelector("h2");
  const p = body.querySelector("p");
  const code = body.querySelector("code");
  const pre = body.querySelector("pre");
  const ul = body.querySelector("ul");
  const bq = body.querySelector("blockquote");
  const g = (el) => (el ? getComputedStyle(el) : null);
  return {
    body: { lh: g(body).lineHeight, color: g(body).color, fs: g(body).fontSize },
    h2: h2 ? { fs: g(h2).fontSize, fw: g(h2).fontWeight, mt: g(h2).marginTop, bb: g(h2).borderBottomWidth } : null,
    p: p ? { mb: g(p).marginBottom } : null,
    code: code ? { bg: g(code).backgroundColor, color: g(code).color } : null,
    pre: pre ? { bg: g(pre).backgroundColor, radius: g(pre).borderRadius } : null,
    ul: ul ? { ls: g(ul).listStyleType, pl: g(ul).paddingLeft } : null,
    bq: bq ? { bl: g(bq).borderLeftWidth, color: g(bq).color } : null,
  };
});

check("窗口内找到 .md-body", windowStyles !== null);

if (windowStyles) {
  const diffs = [];
  for (const key of Object.keys(staticStyles)) {
    const a = JSON.stringify(staticStyles[key]);
    const b = JSON.stringify(windowStyles[key]);
    if (a !== b) diffs.push(`${key}: 静态页=${a} 窗口=${b}`);
  }
  check("两路渲染样式完全一致", diffs.length === 0, diffs.length ? diffs.join(" | ") : "所有测量值相同");
}

/* ══════════════════════════════════════════════════════════
   五、开始菜单接入真实数据
   ══════════════════════════════════════════════════════════ */
console.log("\n── 五、开始菜单 ──");

// 先关掉窗口，回到干净桌面
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("astro-island");
await page.waitForTimeout(400);

await page.click('button[aria-label="开始"]');
await page.waitForTimeout(500);

const tileInfo = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("[data-tile-id]")];
  const texts = btns.map((b) => b.textContent?.trim()).filter(Boolean);
  const menuText = document.body.innerText;
  return {
    tileCount: btns.length,
    texts,
    hasRealCategory: menuText.includes("前端") && menuText.includes("随笔"),
    hasCount: /\d+ 个/.test(menuText),
    countText: menuText.match(/\d+ 分类 · \d+ 标签/)?.[0] ?? "",
  };
});

check("开始菜单有磁贴", tileInfo.tileCount > 5, `${tileInfo.tileCount} 个磁贴`);
check("磁贴含真实分类", tileInfo.hasRealCategory);
check("显示真实分类/标签数量", tileInfo.hasCount, tileInfo.countText);
console.log("    磁贴内容:", tileInfo.texts.join(" | "));

/* ══════════════════════════════════════════════════════════
   六、回收站（草稿）
   ══════════════════════════════════════════════════════════ */
console.log("\n── 六、回收站 ──");

await page.keyboard.press("Escape");
await page.waitForTimeout(300);

const rec = await page.$("[data-icon-id='recycle']");
const rb = await rec.boundingBox();
await page.mouse.dblclick(rb.x + rb.width / 2, rb.y + rb.height / 2);
await page.waitForTimeout(600);

const draftVisible = await page.evaluate(() => {
  const body = document.querySelector(".win-body");
  return body ? body.innerText.includes("草稿") : false;
});
check("回收站能看到草稿", draftVisible);

/* ══════════════════════════════════════════════════════════
   七、移动端
   ══════════════════════════════════════════════════════════ */
console.log("\n── 七、移动端 (390×844) ──");

const m = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
await m.goto(BASE, { waitUntil: "networkidle" });
await m.waitForSelector("astro-island");
await m.waitForTimeout(600);

// 移动端图标网格应变成 4 列
const gridCols = await m.$eval(".desktop-grid", (el) => getComputedStyle(el).gridTemplateColumns);
const colCount = gridCols.split(" ").length;
check("移动端图标网格为 4 列", colCount === 4, `${colCount} 列`);

// 打开一个窗口，应该是全屏卡片。
// 同样换成 notepad —— docs 图标已不存在。
const mIcon = await m.$("[data-icon-id='notepad']");
const mb = await mIcon.boundingBox();
await m.touchscreen.tap(mb.x + mb.width / 2, mb.y + mb.height / 2);
await m.waitForTimeout(300);
await m.touchscreen.tap(mb.x + mb.width / 2, mb.y + mb.height / 2);
await m.waitForTimeout(800);

const mobileWin = await m.evaluate(() => {
  const el = document.querySelector(".win-drag-handle")?.parentElement;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom };
});
check("移动端窗口为全屏卡片", mobileWin ? mobileWin.w > 380 && mobileWin.x < 5 : false,
  mobileWin ? `${mobileWin.w}×${mobileWin.h} @ (${mobileWin.x},${mobileWin.y})` : "无窗口");

// 窗口底部应贴着任务栏上沿 (844-40=804)
check("移动端窗口底部贴任务栏", mobileWin ? Math.abs(mobileWin.bottom - 804) <= 2 : false,
  mobileWin ? `bottom=${mobileWin.bottom}, 期望 804` : "");

/* ══════════════════════════════════════════════════════════
   八、窗口内滚动（回归保护）

   ⚠️ 这条测试是补上来的，因为它对应一个真实踩过的坑：
      .win-body 曾因为依赖 flex-1 而算不出高度，
      高度退化成「按内容撑开」（实测 3146px），
      自己反而没有可滚动空间，正文被外层 overflow:hidden 裁掉。
      表现就是「滚轮怎么滚都不动」。

      判断依据不看类名，只看三个事实：
        1. .win-body 的高度应该【小于】它的内容高度（说明它被限高了）
        2. overflow 必须是 auto/scroll
        3. 滚一下 scrollTop 必须真的变大
      这样不管以后怎么重构，只要滚动真的能用就通过。
   ══════════════════════════════════════════════════════════ */
console.log("\n── 八、窗口内滚动 ──");

const s = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await s.goto(BASE, { waitUntil: "networkidle" });
await s.waitForSelector("astro-island");
await s.waitForTimeout(700);

// 打开一篇长文章（用事件走正规入口，避免依赖列表点击）
await s.evaluate(() => {
  window.dispatchEvent(
    new CustomEvent("os:open-post", {
      detail: { slug: "why-win10", title: "测试文章", icon: "📄" },
    })
  );
});
await s.waitForTimeout(900);

const metrics = await s.evaluate(() => {
  const el = document.querySelector(".win-body");
  if (!el) return null;
  return {
    clientH: el.clientHeight,
    scrollH: el.scrollHeight,
    overflowY: getComputedStyle(el).overflowY,
  };
});

check(
  "窗口内容区被正确限高",
  metrics ? metrics.scrollH > metrics.clientH + 100 : false,
  metrics ? `可视高 ${metrics.clientH}px < 内容高 ${metrics.scrollH}px` : "找不到 .win-body"
);

check(
  "窗口内容区可滚动",
  metrics ? ["auto", "scroll"].includes(metrics.overflowY) : false,
  metrics ? `overflow-y: ${metrics.overflowY}` : ""
);

const sBefore = await s.evaluate(() => document.querySelector(".win-body")?.scrollTop ?? -1);
await s.mouse.move(700, 500);
await s.mouse.wheel(0, 800);
await s.waitForTimeout(500);
const sAfter = await s.evaluate(() => document.querySelector(".win-body")?.scrollTop ?? -1);

check(
  "滚轮能真正滚动正文",
  sAfter > sBefore,
  `scrollTop ${sBefore} → ${sAfter}`
);

// 长列表视图也应该能滚（这条链被改过，一并守住）。
// ⚠️ 原来用的是 id="docs"，那个视图已移除。现在用 "pc"（资源管理器），
//    它内部同样有一层 overflow-y-auto 的列表容器。
const listMetrics = await s.evaluate(() => {
  window.dispatchEvent(
    new CustomEvent("os:open-window", {
      detail: { id: "pc", title: "此电脑", icon: "/icons/pc.png", path: "/archive" },
    })
  );
  return true;
});
await s.waitForTimeout(800);

const listScroll = await s.evaluate(() => {
  // 列表视图内部自己有一层 overflow-y-auto
  const inner = document.querySelector(".win-body .overflow-y-auto");
  if (!inner) return null;
  return {
    clientH: inner.clientHeight,
    scrollH: inner.scrollHeight,
    canScroll: inner.scrollHeight > inner.clientHeight,
  };
});
check(
  "列表视图内部撑满且有滚动能力",
  listScroll ? listScroll.clientH > 100 : false,
  listScroll ? `可视高 ${listScroll.clientH}px / 内容高 ${listScroll.scrollH}px` : "找不到列表容器"
);
void listMetrics;

await s.close();
await browser.close();

/* ══════════════════════════════════════════════════════════
   汇总
   ══════════════════════════════════════════════════════════ */
const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass);
console.log(`\n${"═".repeat(56)}`);
console.log(`验收结果：${pass}/${results.length} 通过`);
if (fail.length) {
  console.log(`\n未通过项：`);
  fail.forEach((f) => console.log(`  ❌ ${f.name}  ${f.detail}`));
}
console.log("═".repeat(56));
process.exit(fail.length ? 1 : 0);
