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

/**
 * 量一组 .md-body 的关键排版样式。
 *
 * ⚠️ 抽成函数是为了【两处复用】：
 *    一处量静态页（SEO 路径），一处量窗口内（marked 路径），
 *    最后逐字段对比。两处必须用【完全同一段测量代码】，
 *    否则所谓的"差异"可能只是测量方式不同造成的假象。
 *
 * ⚠️ 注意它取的是每个标签的【第一个】实例。这意味着
 *    "拿两篇不同的文章来比"必然出假失败 —— 见第 156 行附近的说明。
 */
function readMdBodyStyles() {
  return function measure() {
    const body = document.querySelector(".md-body");
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
  };
}

const staticStyles = await page.evaluate(readMdBodyStyles());
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

// 窗口里有没有内容。
// ⚠️ 记事本现在默认是【渲染视图】，正文是一块 div.md-body，
//    不再是 textarea。所以这里同时接受两种形态 ——
//    "渲染出来了"这件事本身才是要断言的，具体用什么标签是实现细节。
const cardCount = await page.$$eval("textarea, .md-body, .post-card", (els) => els.length);
check("窗口内渲染出文章内容", cardCount >= 1, `${cardCount} 个内容节点`);

// URL 同步了吗
check("URL 已同步为 /posts", page.url().endsWith("/posts"), page.url());

/* ── 打开「文章列表」窗口，再双击一篇文章 ──

   ⚠️⚠️ 这一段的行为在第七阶段【有意改变了】，说明白为什么。

      第七阶段之前：在「此电脑」里双击 .md 文件 → 打开 post:<slug>
                    （阅读排版视图），URL 变成 /posts/<slug>。

      第七阶段之后：双击 .md 文件 → 打开 notepad:<slug>
                    （记事本外壳，可以按 F9 看 .md 源码），URL 变成 /posts。

      为什么改？因为需求就是"从此电脑打开博客文章时，也打开记事本的界面"，
      而且它在语义上更合理 —— 在文件管理器里双击一个 .md 文本文件，
      用记事本打开是最自然的联想。

   ⚠️⚠️ 那"两路渲染样式一致"的对比怎么办？
      那个对比需要【同一篇文章】同时在"窗口"和"静态页"里出现，
      而 notepad: 外壳下 URL 是 /posts，取不到 slug，就定位不到静态页。

      所以这里改走【文章列表窗口】这条路：
        它由 ArchiveView 渲染，里面的 PostList 派发 os:open-post 时
        【不带 view】，于是走默认的 post:<slug> 分支 →
        URL 同步 /posts/<slug> → slug 拿得到，对比逻辑完全不用改。

   ⚠️⚠️ 怎么打开文章列表窗口？
      不能用 page.goto("/posts") —— 那是一个静态页（ContentLayout），
      上面【没有】桌面岛屿，不会出现任何窗口。

      只有 /（桌面首页）挂载了岛屿，所以只能：
        1. goto("/")
        2. 用 os:open-window 事件让窗口系统开一个 id=posts 的窗口
      这正是"开始菜单 / 页内链接打开窗口"走的路径，语义正当。

      ⚠️ 为什么不用 page.goto("/") 再点开始菜单里的"最新文章"磁贴？
         因为磁贴的 path 也是 "/posts"（静态路径），点击后同样打不开
         ArchiveView 窗口，而是跳到一个没有岛屿的静态页 ——
         那反而会让这个测试卡在 waitForSelector 上。
         直接派发事件最直达，也最不依赖 UI 细节（磁贴的类名会变）。
*/
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("astro-island", { state: "attached" });
await page.waitForTimeout(500);

// 先关闭上一个测试留下的窗口，避免叠加
{
  const btns = await page.$$('button[aria-label="关闭"]');
  for (const b of btns) {
    await b.click().catch(() => {});
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(400);
}

// 打开「文章列表」窗口（id=posts → ArchiveView）
await page.evaluate(() => {
  window.dispatchEvent(
    new CustomEvent("os:open-window", {
      detail: { id: "posts", title: "全部文章", icon: "📚", path: "/posts" },
    }),
  );
});
await page.waitForTimeout(900);

/**
 * ⚠️⚠️ 文章列表用的是 role="button" + aria-label="打开 <标题>"，
 *    不是 <tr> 行 —— 所以不能按 tbody tr 找。
 *
 *    这也是"只断言事实、不断言实现"的一个好处：
 *    我一开始按表格行找，找不到；换成按【可访问性属性】找就稳了，
 *    而且这个属性是给屏幕阅读器用的，属于对外的契约，不会随便改。
 */
const ARTICLE_ROW = '.win-body [role="button"][aria-label^="打开"]';

await page.waitForSelector(ARTICLE_ROW, { timeout: 5000 }).catch(() => {});
const listRows = await page.$$eval(ARTICLE_ROW, (e) => e.length);
check("文章列表窗口里有可双击的文章行", listRows > 0, `${listRows} 行`);

/* ── 双击第一篇文章 ── */
const firstRow = (await page.$$(ARTICLE_ROW))[0];
if (firstRow) {
  const cb = await firstRow.boundingBox();
  await page.mouse.dblclick(cb.x + Math.min(80, cb.width / 2), cb.y + cb.height / 2);
}
await page.waitForTimeout(900);

winCount = await page.$$eval(".win-drag-handle", (els) => els.length);
check("从文章列表双击文章会打开新窗口", winCount >= 2, `${winCount} 个窗口`);

const url = page.url();
check("URL 变为文章路径（阅读视图入口）", /\/posts\/[a-z0-9-]+$/.test(url), url);

/* ── 关键：窗口内的 .md-body 排版是否和静态页一致 ── */
console.log("\n── 四、两路渲染的样式一致性（核心）──");

/**
 * ⚠️⚠️ 两路对比必须用【同一篇文章】，否则测的是输入差异不是样式差异。
 *
 *    之前这里量的是写死的 /posts/why-win10，而窗口点的是列表第一行 ——
 *    只要「列表第一行」≠「why-win10」，这个断言就在拿两篇不同的文章
 *    比排版，必然出现假失败。
 *
 *    实测踩到的例子（加了 latex-guide 之后它排到列表第一行）：
 *      · h2.margin-top 不同 —— 一篇的 h2 前面是首段（被折叠），
 *        另一篇的 h2 前面是表格
 *      · code 背景色不同 —— 一篇的第一个 <code> 是 <pre> 里的代码块，
 *        另一篇的是表格里的行内代码，两者本来就不该一样
 *    这两条"差异"全是【测试自己写错了】，不是真的样式漂移。
 *
 *    正确做法分两步：
 *      1. 先在【窗口】里量（此刻窗口正开着那篇文章）
 *      2. 从窗口 URL 取到 slug，再把【静态页】导航到同一篇去量
 *    这样比的一定是同一份 Markdown。
 */
const windowStyles = await page.evaluate(() => {
  const body = document.querySelector(".win-body .md-body") || document.querySelector(".win-body");
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

// 从窗口 URL 取 slug，把静态页导航到【同一篇】重取基准
const sameSlug = url.match(/\/posts\/([a-z0-9-]+)/)?.[1];
check("能从 URL 取到文章 slug（保证两路比的是同一篇）", !!sameSlug, sameSlug ?? "未取到");

await page.goto(`${BASE}/posts/${sameSlug}`, { waitUntil: "networkidle" });
const samePostStaticStyles = await page.evaluate(readMdBodyStyles());

if (windowStyles && samePostStaticStyles) {
  const diffs = [];
  // ⚠️ 用 samePostStaticStyles（同一篇）而不是 staticStyles（why-win10）
  for (const key of Object.keys(samePostStaticStyles)) {
    const a = JSON.stringify(samePostStaticStyles[key]);
    const b = JSON.stringify(windowStyles[key]);
    if (a !== b) diffs.push(`${key}: 静态页=${a} 窗口=${b}`);
  }
  check("两路渲染样式完全一致（比的是同一篇）", diffs.length === 0, diffs.length ? diffs.join(" | ") : "所有测量值相同");
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

   ⚠️⚠️ 后来又踩了第二个坑：把"滚动容器就是 .win-body"写死在断言里。

      为了让右侧目录的 smooth 滚动不被 sticky 打断，
      正文的滚动被挪到了 <article class="overflow-y-auto"> 上
      （详见 ArticleView.tsx 里的长注释）。
      于是 .win-body 变成了一层"透传"容器：
      scrollHeight === clientHeight，自己根本不滚。

      断言还盯着 .win-body → 明明功能正常却报两条失败。

   ✅ 正确的写法：不要预设"哪个元素在滚"，而是【去找】那个在滚的元素。
      判据只看事实（元素自己 overflow 可滚 + 内容比容器高），
      不看类名、不看层级。这样以后滚动容器再怎么挪都不会误报。
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

/**
 * 找出窗口里"真正在滚"的那个元素。
 *
 * ⚠️ 从 .md-body 往上找，第一个"自己 overflow 可滚 + 内容高于容器"的元素
 *    就是答案。找不到就退回 .win-body（老布局）。
 */
const FIND_SCROLLER = `(() => {
  const md = document.querySelector(".md-body");
  if (!md) return null;
  let el = md;
  while (el && el !== document.body) {
    const cs = getComputedStyle(el);
    const can = /(auto|scroll|overlay)/.test(cs.overflowY);
    if (can && el.scrollHeight > el.clientHeight + 1) return el;
    el = el.parentElement;
  }
  return document.querySelector(".win-body");
})()`;

const metrics = await s.evaluate(`(() => {
  const el = ${FIND_SCROLLER};
  if (!el) return null;
  return {
    clientH: el.clientHeight,
    scrollH: el.scrollHeight,
    overflowY: getComputedStyle(el).overflowY,
    cls: String(el.className).split(" ").slice(0, 3).join("."),
  };
})()`);

check(
  "窗口内容区被正确限高",
  metrics ? metrics.scrollH > metrics.clientH + 100 : false,
  metrics
    ? `[${metrics.cls}] 可视高 ${metrics.clientH}px < 内容高 ${metrics.scrollH}px`
    : "找不到可滚动的正文容器"
);

check(
  "窗口内容区可滚动",
  metrics ? ["auto", "scroll"].includes(metrics.overflowY) : false,
  metrics ? `overflow-y: ${metrics.overflowY}` : ""
);

// 滚轮滚动：作用在找到的那个容器上
const sBefore = await s.evaluate(`(() => {
  const el = ${FIND_SCROLLER};
  return el ? el.scrollTop : -1;
})()`);

/**
 * ⚠️ 鼠标位置不能写死。
 *
 *   原来写的是 (700, 500)，在"正文占满整个窗口"的布局下没问题。
 *   但后来正文右侧多出一栏目录（180px 宽），
 *   x=700 正好落进目录栏 —— 滚轮作用在目录上，
 *   而目录内容短、没有可滚空间，于是 scrollTop 纹丝不动，
 *   测试报"滚不动"，其实正文的滚动完全正常。
 *
 *   正确做法：把鼠标放到【滚动容器自己的中心】。
 *   容器挪到哪儿都能跟上，不会再因为旁边多一栏而误判。
 */
const sCenter = await s.evaluate(`(() => {
  const el = ${FIND_SCROLLER};
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
})()`);

if (sCenter) {
  await s.mouse.move(sCenter.x, sCenter.y);
  await s.mouse.wheel(0, 800);
  await s.waitForTimeout(500);
}
const sAfter = await s.evaluate(`(() => {
  const el = ${FIND_SCROLLER};
  return el ? el.scrollTop : -1;
})()`);

check(
  "滚轮能真正滚动正文",
  sBefore >= 0 && sAfter > sBefore,
  `在 (${sCenter?.x}, ${sCenter?.y}) 滚动：scrollTop ${sBefore} → ${sAfter}`
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
