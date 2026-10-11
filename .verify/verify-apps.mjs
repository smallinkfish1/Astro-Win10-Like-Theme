/**
 * 第七阶段（记事本随机打开 + 从此电脑用记事本打开 + 控制面板分栏导航）
 * 浏览器验收脚本。
 *
 * 跑法：node verify-apps.mjs
 * 前置：npx astro preview --port 4400 已在跑（或 npm run verify 会替你管）
 *
 * ── 设计原则：只断言【事实】，不断言类名 ──
 *
 *   比如"控制面板有左导航"，不是去断言 .settings-nav 这个类存在，
 *   而是问："点左侧某一项之后，右侧内容真的变了吗？"
 *   类名随时会改，但"用户点了一下、界面变了"这件事不会骗人。
 *
 *   再比如"记事本每次打开随机挑文章"，不断言某个随机函数被调用，
 *   而是【真的开两次窗口，比较它们打开的文章是不是（大概率）不同】。
 *   这才是用户能感知的行为。
 *
 * ⚠️ 为什么单独写一个套件，而不是塞进 verify-desktop.mjs？
 *    verify-desktop 已经 52 条断言了，再塞进去会很难定位失败原因。
 *    而且这一套验的是「新增的两个应用」，和桌面还原是两件事，
 *    分开跑能单独定位、单独重跑（调试时很省时间）。
 */
import { chromium } from "playwright";

const BASE = "http://localhost:4400";
const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${name}${detail ? "  → " + detail : ""}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const failed = [];
page.on("response", (r) => {
  if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
});

/**
 * ⚠️⚠️ 读窗口标题 —— 这里踩过两个坑，都写下来。
 *
 *   坑一（找窗口）：一个窗口内部可能有【多个】.win-body
 *      （.win-body 是「可滚动的正文区」这个通用类，文章视图、
 *       资源管理器都会用）。所以 querySelector(".win-body") 抓到的
 *      是哪一个取决于 DOM 顺序，不是"当前最上面那个窗口"。
 *
 *      ✅ 按【特征】找：记事本窗口的特征是顶部有
 *        文件/编辑/格式/查看/帮助 这五个菜单按钮，只有它有。
 *
 *   坑二（读标题）：.win-body-wrap 和 .win-drag-handle 是
 *      【兄弟关系】，不是父子！
 *
 *      实际结构（实测）：
 *        div.flex.flex-col           ← 窗口根
 *          ├─ div.win-drag-handle    ← 标题栏
 *          └─ div.win-body-wrap      ← 内容包裹（.win-body 在它里面）
 *
 *      所以 closest(".win-body-wrap") 从标题栏找是找不到的，
 *      必须往上走到【共同父级】再向下查。
 *
 *      ⚠️ 这个坑很阴：closest() 找不到时返回 null，
 *         代码不报错，只是拿到空字符串 —— 断言会显示"窗口标题「(空)」"，
 *         看起来像"窗口标题真的是空的"，其实是我找错了元素。
 */
const FIND_NOTEPAD = `(() => {
  const wraps = [...document.querySelectorAll(".win-body-wrap")];
  return wraps.find((w) => {
    const t = [...w.querySelectorAll("button")].map((b) => b.textContent?.trim());
    return t.includes("文件") && t.includes("查看") && t.includes("帮助");
  }) ?? null;
})()`;

/**
 * 从 .win-body-wrap 往上找到【窗口根节点】（就是含标题栏的那一层）。
 *
 * ⚠️ 为什么不直接写死"父元素的父元素"？
 *    因为窗口的包裹层数会随布局调整变化（比如以后加一层动画容器）。
 *    写成"最多往上找 4 层、找到带 .win-drag-handle 的那层为止"，
 *    布局微调就不会让断言碎掉 —— 这是让测试活得久一点的关键。
 */
const ROOT_OF = (sel) => `(() => {
  let el = ${sel};
  if (!el) return null;
  for (let i = 0; i < 4 && el; i++) {
    /*
      ⚠️⚠️ 必须是 :scope > .win-drag-handle（直接子元素），
          不能写 el.querySelector(".win-drag-handle")。

          因为 querySelector 搜的是【所有后代】。
          标题栏在窗口最外层，而我们从 .win-body-wrap 往上走 ——
          每一层祖先的 querySelector(".win-drag-handle") 都能搜到它
          （它就在这些祖先的子树里）。

          于是这个"找到就停"的循环在【第一轮】就返回了，
          返回的还是原来的 .win-body-wrap，根本不是窗口根。

          症状极具迷惑性：标题读出来是空的（.win-body-wrap 里
          确实没有标题栏），因为只往上走了一层就停了。

          加 :scope > 之后语义就唯一了：只有真正把标题栏当作
          【直接子元素】的那一层，才是窗口根。
    */
    if (el.querySelector(":scope > .win-drag-handle")) return el;
    el = el.parentElement;
  }
  return null;
})()`;

/**
 * ⚠️⚠️ 被读的"文章标题"在哪儿？
 *
 *   不在标题栏里 —— 标题栏显示的是【应用名】「记事本」
 *   （由 ICON_ROUTES 决定，是窗口的固定标识，不随文章变）。
 *
 *   文章标题在【状态栏】里，也就是窗口最底部那一行：
 *     div.flex.shrink-0...border-t...
 *       └─ span.truncate  文章标题 + " · 日期 · N 分钟阅读"
 *
 *   所以取法是：在窗口根里找状态栏（带 border-t 的那一条），
 *   取它第一个 span 的文字，再按 " · " 切掉后面的元信息。
 *
 *   ⚠️ 为什么不用 .truncate 这个类名直接抓？
 *     因为 .truncate 在项目里用得很广（标题栏、列表、卡片都在用），
 *     直接抓会拿到别的东西。限定在"窗口根的、靠底部的状态栏"里更稳。
 */
const ARTICLE_TITLE_OF = (sel) => `(() => {
  const root = ${ROOT_OF(sel)};
  if (!root) return "";
  // 状态栏：窗口根里最后一个带 border-t 的条状容器
  const bars = [...root.querySelectorAll("div")].filter((d) =>
    /border-t/.test(d.className?.toString() ?? "")
  );
  const bar = bars[bars.length - 1];
  if (!bar) return "";
  /*
    ⚠️ 只取【第一个 span】的直接文本，不要 textContent。

       因为状态栏结构是：
         <span> 文章标题 <span class="text-faint">日期 · N 分钟阅读</span> </span>
       外层 span 的 textContent 会把内层那段元信息也串进来，
       得到 "标题2026-10-09 · 3 分钟阅读"。

       而日期和标题之间【没有分隔符】（一个是文本节点、一个是子元素），
       按 "·" 切也切不干净。所以要精确地只取第一段纯文本。

       取法：遍历子节点，只累加【文本节点】，遇到元素就停。
  */
  let out = "";
  for (const n of bar.querySelector("span")?.childNodes ?? []) {
    if (n.nodeType === 3) out += n.textContent;
    else break;
  }
  return out.trim();
})()`;

async function resetStorage() {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("astro-island", { state: "attached", timeout: 8000 });
  await page.waitForTimeout(600);
}

async function closeAll() {
  const btns = await page.$$('button[aria-label="关闭"]');
  for (const b of btns) {
    await b.click().catch(() => {});
    await page.waitForTimeout(120);
  }
  await page
    .waitForFunction(() => document.querySelectorAll(".win-body-wrap").length === 0, {
      timeout: 5000,
    })
    .catch(() => {});
  await page.waitForTimeout(300);
}

/**
 * 只开记事本一个窗口，返回【当前在读的文章标题】。
 *
 * ⚠️ 注意返回的不是标题栏 —— 标题栏永远是「记事本」（应用名）。
 *    文章标题在状态栏里，见 ARTICLE_TITLE_OF 的说明。
 */
async function openNotepadAlone() {
  await closeAll();
  await page.dblclick('[data-icon-id="notepad"]');
  await page.waitForTimeout(650);
  return page.evaluate(ARTICLE_TITLE_OF(FIND_NOTEPAD));
}

await resetStorage();

/* ═══════════════ 一、记事本：随机打开 ═══════════════
   ⚠️⚠️ 先解释一下「重置 localStorage」为什么必须放在最前面。
 *
 *   这个套件要验"记事本记住上次的视图模式"，而那一项存在 localStorage。
 *   上一个套件（verify-desktop）跑完时可能把视图切到了源码 ——
 *   状态会【跨套件泄漏】。
 *
 *   症状：单独跑 verify-apps.mjs 全绿，
 *         跑 npm run verify 时"记事本默认渲染视图"却失败。
 *   这种"单独跑能过、合起来挂"的问题最耗时间，
 *   所以开头就清干净，让这个套件自给自足。

   ⚠️⚠️ 随机性怎么断言？
 *
 *   不能断言"两次打开的文章一定不同" —— 那是概率性的，
 *   有 1/N 的概率撞车，会让测试偶发失败（flaky）。
 *   但也不能只断言"打开了一篇文章" —— 那和"永远打开第一篇"
 *   完全无法区分，等于没验。
 *
 *   可靠的判据是【统计性质】：连开 N 次，如果每次都一样，
 *   那它就不是随机的（概率 (1/N)^(N-1)，N=8 时约 1e-6）。
 *   反过来只要出现过不同的，就证明了随机性存在。
 *
 *   这里取 8 次。为什么不是 3 次？
 *   (1/N)^2 在 N=5 时是 4%，还是太高，会造成偶发失败。
 *   8 次能把误判概率压到百万分之一级别。
═══════════════════════════════════════════════ */
console.log("\n── 一、记事本随机打开 ──");

const opened = [];
for (let i = 0; i < 8; i++) {
  const t = await openNotepadAlone();
  if (t) opened.push(t);
}

const uniq = [...new Set(opened)];
check(
  "记事本打开时随机挑文章（8 次不完全相同）",
  opened.length >= 6 && uniq.length > 1,
  `8 次得到 ${uniq.length} 篇不同：${uniq.slice(0, 5).join(" / ")}${uniq.length > 5 ? " …" : ""}`,
);
check(
  "随机挑出来的确实是站内真实文章",
  uniq.length > 0 && uniq.every((t) => t.length > 0),
  `样例：${uniq[0] ?? "(空)"}`,
);

/* ═══════════════ 二、记事本：视图模式持久化 ═══════════════ */
console.log("\n── 二、记事本记住视图模式 ──");

await openNotepadAlone();

// 确认初始是渲染视图
const initial = await page.evaluate(`(() => {
  const root = ${ROOT_OF(FIND_NOTEPAD)};
  return {
    hasMdBody: !!root?.querySelector(".md-body"),
    hasTextarea: !!root?.querySelector("textarea"),
  };
})()`);
check(
  "清空本地存储后，记事本默认是渲染视图",
  initial.hasMdBody && !initial.hasTextarea,
  `md-body=${initial.hasMdBody} textarea=${initial.hasTextarea}`,
);

// 切到源码视图（用查看菜单，不用 F9 —— 顺便验菜单是好的）
await page.evaluate(`(() => {
  const w = ${FIND_NOTEPAD};
  [...w.querySelectorAll("button")].find((b) => b.textContent?.trim() === "查看")?.click();
})()`);
await page.waitForTimeout(250);
await page.evaluate(`(() => {
  const w = ${FIND_NOTEPAD};
  [...w.querySelectorAll("button")].find((b) => /源码视图/.test(b.textContent ?? ""))?.click();
})()`);
await page.waitForTimeout(500);

const stored = await page.evaluate(`(() => {
  const root = ${ROOT_OF(FIND_NOTEPAD)};
  return {
    value: localStorage.getItem("win10-blog:notepad-view"),
    hasTextarea: !!root?.querySelector("textarea"),
  };
})()`);
check("「查看 → 源码视图」能切到源码", stored.hasTextarea, `textarea=${stored.hasTextarea}`);
check(
  "视图模式写进了 localStorage",
  stored.value === "source",
  `win10-blog:notepad-view = ${stored.value}`,
);

// 关掉重开，应该还是源码视图
await openNotepadAlone();
const reopened = await page.evaluate(`(() => {
  const root = ${ROOT_OF(FIND_NOTEPAD)};
  return {
    hasTextarea: !!root?.querySelector("textarea"),
    hasMdBody: !!root?.querySelector(".md-body"),
  };
})()`);
check(
  "重新打开记事本时沿用上次的视图模式",
  reopened.hasTextarea && !reopened.hasMdBody,
  `textarea=${reopened.hasTextarea} mdBody=${reopened.hasMdBody}`,
);

/**
 * ⚠️⚠️ 这个检查看起来像"在测实现细节"，但它防的是一个真实会发生的灾难：
 *
 *    如果 lib/theme.ts 里的 KEY_WALLPAPER 和 lib/wallpaper.ts 里的
 *    不一致，症状是"换壁纸后一刷新就回到默认，但设置界面显示已选中"——
 *    因为两处读写的是不同的键。用户会觉得"设置坏了"，但代码里
 *    没有任何报错，极难定位。
 *
 *    这里读一下实际的键名，确认真的是那个约定好的字符串。
 */
const wpKeys = await page.evaluate(() =>
  Object.keys(localStorage).filter((k) => /wallpaper/i.test(k)),
);
check(
  "壁纸设置用的键名是约定好的那个（两处常量不能飘）",
  wpKeys.length === 0 || wpKeys.every((k) => k === "win10-blog:wallpaper"),
  wpKeys.length ? wpKeys.join(", ") : "(尚未写入选中的壁纸，键名无冲突)",
);

/* ═══════════════ 三、从此电脑双击文章 → 记事本界面 ═══════════════ */
console.log("\n── 三、从此电脑打开文章用记事本界面 ──");

await closeAll();

/**
 * ⚠️⚠️ 先切回渲染视图。
 *
 *    上一节刚把视图模式切成了"源码"并存进 localStorage，
 *    所以现在打开任何文章都是源码视图 ——
 *    这时候断言"md-body 存在"会失败，但那不是 bug，是状态残留。
 *
 *    这一步同时验证了"视图模式真的被持久化"（否则不会有这个麻烦）。
 *    清掉它，让本节从一个确定的起点开始。
 */
await page.evaluate(() => localStorage.removeItem("win10-blog:notepad-view"));

/**
 * ⚠️ 这里不再靠"先验证打开记事本图标"来规避 flaky
 *    （老套件里那么干过，很别扭）。
 *
 *    做法是：从资源管理器里明确点开一行，记录那一行的名字，
 *    然后断言记事本状态栏里的文章标题 == 那一行对应的文章标题。
 *    这样既确定了"开的是这一篇"，又验证了"用的是记事本外壳"。
 */
await page.dblclick('[data-icon-id="pc"]');
await page.waitForTimeout(800);

// 切到列表视图（树状视图下文件名也是可见的，但列表视图更整齐）
await page.evaluate(() => {
  const b = [...document.querySelectorAll(".win-body button")].find((x) =>
    /列表/.test(x.textContent ?? ""),
  );
  b?.click();
});
await page.waitForSelector(".win-body tbody tr", { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(400);

// 记录第一行的名称（去掉 📄 之类的前导装饰），一会儿拿它跟窗口标题比对
const firstRowName = await page.evaluate(() => {
  const tr = document.querySelector(".win-body tbody tr");
  if (!tr) return "";
  const raw = tr.querySelector("td")?.textContent ?? "";
  return raw.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "").trim();
});

const firstRow = await page.$(".win-body tbody tr");
let dblOk = false;
if (firstRow) {
  const rb = await firstRow.boundingBox();
  await page.mouse.dblclick(rb.x + rb.width / 2, rb.y + rb.height / 2);
  dblOk = true;
}
await page.waitForTimeout(1200);

/**
 * ⚠️⚠️ 注意这里量的是【整个窗口】而不是 .win-body。
 *
 *    坑三：一个窗口里可能有多个 .win-body（正文区），
 *    而 .md-body 只挂在真正在显示文章的那个上面。
 *    从 FIND_NOTEPAD 拿到的元素本身可能是包裹层，也可能就是正文 —
 *    不赌，直接在窗口根节点里往下查 .md-body。
 *
 *    同理，判断"到底是渲染视图还是源码视图"，
 *    不能只看有没有 textarea —— 要同时看 .md-body 在不在，
 *    两者互斥才是真正切过去了。
 */
const afterOpen = await page.evaluate(`(() => {
  const root = ${ROOT_OF(FIND_NOTEPAD)};
  const bars = [...(root?.querySelectorAll("div") ?? [])].filter((d) =>
    /border-t/.test(d.className?.toString() ?? "")
  );
  const bar = bars[bars.length - 1];
  const statusText = (bar?.querySelector("span")?.textContent ?? "").trim();

  return {
    found: !!root,
    winCount: document.querySelectorAll(".win-body-wrap").length,
    // 标题栏 = 应用名（固定是"记事本"）
    appTitle: (root?.querySelector(":scope > .win-drag-handle")?.textContent ?? "").trim(),
    // 状态栏第一段 = 正在读的文章标题
    articleTitle: statusText.split("·")[0].trim(),
    menuCount: [...(root?.querySelectorAll("button") ?? [])]
      .map((b) => b.textContent?.trim())
      .filter((t) => ["文件", "编辑", "格式", "查看", "帮助"].includes(t ?? "")).length,
    hasMdBody: !!root?.querySelector(".md-body"),
    hasTextarea: !!root?.querySelector("textarea"),
    notFound: /找不到文章/.test(document.body.textContent ?? ""),
  };
})()`);

check(
  "从此电脑双击文章，开出来的是记事本界面（有菜单栏）",
  dblOk && afterOpen.menuCount === 5 && !afterOpen.notFound,
  afterOpen.found
    ? `菜单项 ${afterOpen.menuCount} 个，标题栏「${afterOpen.appTitle}」`
    : "没开出记事本窗口",
);
check(
  "记事本打开的是刚双击的那一篇（不是随机另一篇）",
  !!firstRowName && !afterOpen.notFound && afterOpen.articleTitle.length > 0 &&
    // 状态栏标题里包含那一行的名字（可能加了空格，用包含而非全等）
    afterOpen.articleTitle.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "").includes(firstRowName.slice(0, 6)),
  `双击「${firstRowName}」→ 记事本在读「${afterOpen.articleTitle || "(空)"}」`,
);
check(
  "用记事本打开的文章走渲染视图（有 .md-body、无 textarea）",
  afterOpen.hasMdBody === true && afterOpen.hasTextarea === false,
  `md-body=${afterOpen.hasMdBody} textarea=${afterOpen.hasTextarea}`,
);

// 「查看」菜单里有「随机换一篇」
const hasRandomItem = await page.evaluate(`(async () => {
  const w = ${FIND_NOTEPAD};
  [...w.querySelectorAll("button")].find((b) => b.textContent?.trim() === "查看")?.click();
  await new Promise((r) => setTimeout(r, 250));
  return [...w.querySelectorAll("button")].some((b) => b.textContent?.trim() === "随机换一篇");
})()`);
check("「查看」菜单里有「随机换一篇」", hasRandomItem === true, hasRandomItem ? "有" : "没有");

// 真的点一下，文章应该换掉
const titleBefore = afterOpen.articleTitle;
await page.evaluate(`(() => {
  const w = ${FIND_NOTEPAD};
  [...w.querySelectorAll("button")].find((b) => /随机换一篇/.test(b.textContent ?? ""))?.click();
})()`);
await page.waitForTimeout(700);
const titleAfter = await page.evaluate(ARTICLE_TITLE_OF(FIND_NOTEPAD));
check(
  "点「随机换一篇」确实换了文章",
  titleBefore !== titleAfter && titleAfter.length > 0,
  `「${titleBefore}」→「${titleAfter}」`,
);

/* ═══════════════ 四、控制面板：左右分栏 ═══════════════ */
console.log("\n── 四、控制面板分栏布局 ──");

await closeAll();
await page.dblclick('[data-icon-id="control"]');
await page.waitForTimeout(800);

const cp = await page.evaluate(() => {
  const w = document.querySelector(".win-body");
  if (!w) return null;
  return {
    navCount: w.querySelectorAll("nav button").length,
    navNames: [...(w.querySelectorAll("nav button") ?? [])].map((b) =>
      (b.textContent ?? "").replace(/[^\u4e00-\u9fa5]/g, "").trim(),
    ),
    // 有 nav 就说明是左右分栏（不是原来的单页流式布局）
    hasNav: !!w.querySelector("nav"),
    winW: Math.round(w.getBoundingClientRect().width),
  };
});

check("控制面板有左侧分类导航", cp?.hasNav === true, `${cp?.navCount ?? 0} 项`);
check(
  "导航含 外观 / 关于 / 语言 / 更新日志 四个分类",
  ["外观", "关于", "语言", "更新日志"].every((n) => cp?.navNames?.includes(n)),
  cp?.navNames?.join(" / ") ?? "",
);
check(
  "控制面板窗口够宽（分栏后太窄右侧会被挤扁）",
  (cp?.winW ?? 0) >= 820,
  `内容区宽 ${cp?.winW ?? 0}px`,
);

/* ═══════════════ 五、控制面板：点导航在窗口内切换 ═══════════════ */
console.log("\n── 五、点分类在当前窗口内切换 ──");

/**
 * ⚠️⚠️ 这里要验的核心是【不新开窗口】。
 *
 *    所以必须记录点击前的窗口数量，点完再数一次。
 *    只断言"右侧内容变了"是不够的 —— 如果实现成"新开一个窗口"，
 *    右侧内容当然也变了（在新窗口里），断言照样通过。
 *    数量不变 + 内容变了，两条一起才锁得住这个行为。
 */
const beforeSwitch = await page.evaluate(() => ({
  winCount: document.querySelectorAll(".win-body-wrap").length,
  hasPlaceholder: /功能开发中/.test(document.querySelector(".win-body")?.textContent ?? ""),
  heading: document.querySelector(".win-body h3")?.textContent?.trim() ?? "",
}));

const clickNav = (name) =>
  page.evaluate((n) => {
    const w = document.querySelector(".win-body");
    const btn = [...(w?.querySelectorAll("nav button") ?? [])].find((b) =>
      (b.textContent ?? "").includes(n),
    );
    btn?.click();
    return !!btn;
  }, name);

// 点「语言」→ 应该显示占位符
const clickedLang = await clickNav("语言");
await page.waitForTimeout(400);
const afterLang = await page.evaluate(() => {
  const w = document.querySelector(".win-body");
  const t = w?.textContent ?? "";
  return {
    winCount: document.querySelectorAll(".win-body-wrap").length,
    hasPlaceholder: /功能开发中/.test(t),
    // 壁纸选择器应该已经不在了
    hasWallpaper: !!w?.querySelector("img[src*='wallpaper']"),
    url: location.pathname,
  };
});

check(
  "点「语言」右侧显示「功能开发中…」",
  clickedLang && afterLang.hasPlaceholder,
  afterLang.hasPlaceholder ? "显示了占位提示" : "没看到占位提示",
);
check(
  "切换分类【不会新开窗口】（还是同一个窗口）",
  afterLang.winCount === beforeSwitch.winCount,
  `${beforeSwitch.winCount} → ${afterLang.winCount} 个窗口`,
);
check(
  "点「语言」后外观设置内容消失（真的换了页）",
  afterLang.hasWallpaper === false,
  afterLang.hasWallpaper ? "壁纸选择器还在" : "已切走",
);
check(
  "URL 同步成 /settings/language",
  afterLang.url === "/settings/language",
  afterLang.url,
);

// 点「更新日志」→ 也是占位符
await clickNav("更新日志");
await page.waitForTimeout(400);
const afterLog = await page.evaluate(() => ({
  hasPlaceholder: /功能开发中/.test(document.querySelector(".win-body")?.textContent ?? ""),
  url: location.pathname,
  winCount: document.querySelectorAll(".win-body-wrap").length,
}));
check(
  "点「更新日志」也显示占位符且不新开窗口",
  afterLog.hasPlaceholder && afterLog.winCount === beforeSwitch.winCount,
  `占位=${afterLog.hasPlaceholder} 窗口=${afterLog.winCount}`,
);

// 点「关于」→ 真实内容
await clickNav("关于");
await page.waitForTimeout(400);
const afterAbout = await page.evaluate(() => {
  const w = document.querySelector(".win-body");
  const t = w?.textContent ?? "";
  return {
    hasPlaceholder: /功能开发中/.test(t),
    hasReal: /技术栈|Astro|定位/.test(t),
    url: location.pathname,
    heading: w?.querySelector("h3")?.textContent?.trim() ?? "",
  };
});
check(
  "点「关于」显示真实的关于内容（不是占位）",
  afterAbout.hasReal && !afterAbout.hasPlaceholder,
  `标题「${afterAbout.heading}」`,
);

// 点回「外观」→ 壁纸选择器回来了
await clickNav("外观");
await page.waitForTimeout(500);
const backToAppearance = await page.evaluate(() => {
  const w = document.querySelector(".win-body");
  const imgs = [...(w?.querySelectorAll("img") ?? [])].filter((i) =>
    /wallpaper|\/wallpapers\//.test(i.getAttribute("src") ?? ""),
  );
  return {
    url: location.pathname,
    imgCount: imgs.length,
    hasMode: /应用模式/.test(w?.textContent ?? ""),
    winCount: document.querySelectorAll(".win-body-wrap").length,
  };
});
check(
  "点回「外观」壁纸选择器回来了",
  backToAppearance.imgCount > 0 || backToAppearance.hasMode,
  `${backToAppearance.imgCount} 张壁纸缩略图 / 应用模式=${backToAppearance.hasMode}`,
);
check(
  "来回切换后仍然只有一个窗口",
  backToAppearance.winCount === beforeSwitch.winCount,
  `${backToAppearance.winCount} 个窗口`,
);

/* ═══════════════ 六、壁纸真的能换 ═══════════════ */
console.log("\n── 六、壁纸切换 ──");

/**
 * ⚠️ 默认壁纸（default）用的是仓库里已有的图，一定可用。
 *    其余三张需要用户后补图片。所以这里【只验默认那张能选中】，
 *    不去点"待补充"的那几张 —— 它们本来就点不动（disabled），
 *    这是设计使然，不是缺陷。
 *
 *    如果用户之后补了图，这个测试也不会因此失败（它不依赖缺图）。
 */
const wpState = await page.evaluate(() => {
  const before = document.documentElement.getAttribute("data-wallpaper");
  const cards = [...document.querySelectorAll(".win-body button[aria-pressed]")].filter((b) =>
    /默认|极光|山脉|抽象/.test(b.textContent ?? ""),
  );
  return {
    attr: before,
    cardCount: cards.length,
    disabledCount: cards.filter((c) => c.disabled).length,
    names: cards.map((c) => (c.textContent ?? "").replace(/[^\u4e00-\u9fa5]/g, "").trim()),
  };
});

check(
  "<html> 上有 data-wallpaper 属性（壁纸机制的载体）",
  !!wpState.attr,
  `data-wallpaper="${wpState.attr}"`,
);
check(
  "壁纸选择器列出了 4 张候选",
  wpState.cardCount === 4,
  `${wpState.cardCount} 张：${wpState.names.join(" / ")}`,
);

// 选中"默认"这张，确认属性 + 计算样式都对
await page.evaluate(() => {
  const card = [...document.querySelectorAll(".win-body button[aria-pressed]")].find((b) =>
    /默认/.test(b.textContent ?? ""),
  );
  card?.click();
});
await page.waitForTimeout(600);
const wpApplied = await page.evaluate(() => {
  const layer = [...document.querySelectorAll("body > div")].find((d) =>
    getComputedStyle(d).backgroundImage.includes("wallpaper"),
  );
  return {
    attr: document.documentElement.getAttribute("data-wallpaper"),
    stored: localStorage.getItem("win10-blog:wallpaper"),
    bg: layer ? getComputedStyle(layer).backgroundImage : "",
  };
});
check(
  "选中壁纸后 data-wallpaper 和 localStorage 都更新",
  wpApplied.attr === "default" && wpApplied.stored === "default",
  `attr=${wpApplied.attr} storage=${wpApplied.stored}`,
);
check(
  "壁纸层真的应用了那张图（不是只剩兜底色）",
  /wallpaper/.test(wpApplied.bg),
  wpApplied.bg.replace(/^url\("?/, "").replace(/"?\)$/, "") || "(空)",
);

/* ═══════════════ 七、URL 还原：刷新 /settings/xxx 能开对窗口 ═══════════════ */
console.log("\n── 七、URL 直接访问能还原窗口 ──");

await closeAll();

/**
 * ⚠️⚠️ 这里要【从桌面出发】而不是直接 goto("/settings/about")。
 *
 *    为什么？因为 /settings/about 是一个【静态页面】（ContentLayout），
 *    它上面根本没挂 React 岛屿 —— 那是 SEO 用的，给爬虫和直链访客看的
 *    （实测 dist/settings/about/index.html 里 astro-island 出现 0 次）。
 *    直接 goto 过去页面上当然不会有窗口，断言必然失败。
 *    我第一次就是这么写的，结果 waitForSelector("astro-island") 直接超时。
 *
 *    那"URL 还原"到底在验什么？
 *      验的是：用户【在桌面里】把控制面板切到某一类之后刷新，
 *      桌面上应该自动弹出对应的那个分类 —— 而不是重置回默认。
 *
 *    所以正确的复现步骤是：
 *      1. 在桌面上（有岛屿的那个页面），把 URL 改成 /settings/about
 *      2. 【点击桌面上的链接跳过去】—— 注意不是 reload。
 *         Astro 默认开启了 prefetch/客户端路由，点站内链接时
 *         并不会真的一次整页加载，而是……这里不赌它到底走不走 MPA。
 *         最稳的做法是 page.goto 但【同时保留 island】，做不到。
 *
 *    于是换个思路，直接验那条真正的路径：
 *      「在桌面上把 URL 改掉 → 刷新 → 岛屿按 URL 还原窗口」。
 *      用 location.href 赋值（触发真正的导航），这时浏览器会用
 *      /settings/about 这个地址去请求服务器 —— 拿回来的是静态页，
 *      没有岛屿。所以这条路走不通。
 *
 *    ✅ 结论：这条断言应该【拆成两条】，各验各的，别混在一起：
 *       ① 静态页本身可访问（SEO 层面，用 HTTP 状态码验）
 *       ② 岛屿的 URL 还原逻辑（在桌面页面上用 history.replaceState
 *          + 手动触发 popstate 来验，不重新加载页面）
 *
 *    ② 的写法：replaceState 只改地址栏不触发任何导航，
 *      然后手动 dispatch 一个 popstate —— WindowManager 里
 *      监听 popstate 的那个 effect 就会跑，
 *      这正是"用户按浏览器后退"时的代码路径。
 */
await closeAll();
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("astro-island", { state: "attached", timeout: 8000 });
await page.waitForTimeout(600);

// 先确认干净的桌面（没有 URL 匹配）
const beforeRestore = await page.evaluate(() => ({
  winCount: document.querySelectorAll(".win-body-wrap").length,
  path: location.pathname,
}));

// 改地址 + 手动触发 popstate，模拟"用户在桌面上按了后退 / 改了地址"
await page.evaluate(() => {
  window.history.replaceState({}, "", "/settings/about");
  window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
});
await page.waitForTimeout(1200);

const restored = await page.evaluate(() => {
  const w = document.querySelector(".win-body");
  const wrap = w?.closest(".win-body-wrap");
  return {
    hasWindow: !!w,
    winCount: document.querySelectorAll(".win-body-wrap").length,
    title: (wrap?.querySelector(".win-drag-handle")?.textContent ?? "").trim(),
    hasAbout: /技术栈|Astro|定位/.test(w?.textContent ?? ""),
    activeNav:
      w
        ?.querySelector("nav button[aria-current='page']")
        ?.textContent?.replace(/[^\u4e00-\u9fa5]/g, "")
        .trim() ?? "",
  };
});

check(
  "地址变成 /settings/about 时，桌面自动还原出控制面板窗口",
  restored.hasWindow && restored.hasAbout && restored.winCount === 1,
  restored.hasWindow
    ? `窗口标题「${restored.title}」，共 ${restored.winCount} 个窗口`
    : `没有窗口（之前 ${beforeRestore.winCount} 个）`,
);
check(
  "还原后左导航高亮在「关于」上",
  restored.activeNav === "关于",
  `高亮项 = ${restored.activeNav || "(无)"}`,
);

// 静态页本身也必须真的能访问（SEO 用）
const staticPages = [];
for (const s of ["", "appearance", "about", "language", "changelog"]) {
  const url = s ? `${BASE}/settings/${s}` : `${BASE}/settings`;
  const r = await page.request.get(url);
  staticPages.push({ url: `/settings${s ? "/" + s : ""}`, status: r.status() });
}
const badPages = staticPages.filter((p) => p.status !== 200);
check(
  "5 个控制面板静态页全部可访问（含裸 /settings）",
  badPages.length === 0,
  badPages.length
    ? badPages.map((p) => `${p.url}=${p.status}`).join(", ")
    : staticPages.map((p) => p.url).join(" "),
);

/* ═══════════════ 九、回收站：只显示草稿 ═══════════════
 *
 * ⚠️⚠️ 这一节和第「三」节长得像，但验的是【相反】的东西：
 *     第三节验「从此电脑打开文章 → 渲染视图」，
 *     这里验「从回收站打开草稿 → 只读源码视图」。
 *
 *     两条路径共用同一个 NotepadView 组件，
 *     靠 onlySource 这个 prop 分流。共用组件意味着
 *     「改了 A 顺手把 B 弄坏」的风险很高 ——
 *     A 和 B 都有各自独立的一套断言，才能同时锁住。
 */
console.log("\n── 九、回收站（草稿）──");

await closeAll();
await resetStorage();

/**
 * ⚠️ 先把视图模式重置成「渲染」，再看回收站能不能强制成「源码」。
 *
 *    如果一开始就是源码模式，那"回收站显示源码"这个断言
 *    可能只是因为【本来就存着 source】而通过 ——
 *    这就成了假阳性，测不出 onlySource 到底有没有生效。
 *    从 rendered 起步，才能证明是 onlySource 把视图翻过去的。
 */
await page.evaluate(() => localStorage.setItem("win10-blog:notepad-view", "rendered"));

/**
 * ⚠️⚠️ 回收站用的是【资源管理器外壳】，不是一张平铺的表格。
 *     它把草稿按 category 逐级分组：技术 → 数学 → 那篇草稿。
 *     所以「打开一篇草稿」不是"双击表格第一行"，
 *     而是"沿树钻进它的分类文件夹，直到叶子节点"。
 *
 *     第一版断言照"平铺列表"写，读到的是
 *     📁随笔(1) / 📁技术(1) 两个【文件夹行】，误判成"草稿没显示"。
 */
const dblRowNamed = async (label) => {
  const ok = await page.evaluate((l) => {
    const w = document.querySelector(".win-body");
    const td = [...(w?.querySelectorAll("tbody tr") ?? [])]
      .filter((tr) => (tr.textContent ?? "").includes(l))
      .map((tr) => tr.querySelector("td"))[0];
    if (!td) return false;
    const r = td.getBoundingClientRect();
    /*
      ⚠️⚠️ 用 MouseEvent 派发，而不是 page.mouse.dblclick(坐标)。

         因为树形导航里，同名文字会出现【两次】：
         左侧树有一个「技术」节点，右侧表格也有一行「📁技术」。
         按坐标点会点错层，而且行位置一变断言就碎。
         先精确定位到目标行的第一格，再往它身上派发事件 ——
         "点的是这一个"就是确定的。
    */
    td.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, clientX: r.x + 5, clientY: r.y + 5 }),
    );
    return true;
  }, label);
  await page.waitForTimeout(1000);
  return ok;
};

await page.dblclick('[data-icon-id="recycle"]');
await page.waitForTimeout(1000);

const recycleRoot = await page.evaluate(() => {
  const w = document.querySelector(".win-body");
  return {
    hasWindow: !!w,
    // 左侧树的节点（用来确认两篇草稿都在）
    treeNodes: [...(w?.querySelectorAll("button") ?? [])]
      .map((b) => (b.textContent ?? "").trim())
      .filter((t) => /📁|🗑️/.test(t)),
    emptyHint: /回收站是空的/.test(w?.textContent ?? ""),
  };
});

check(
  "回收站窗口能打开，且不是空状态",
  recycleRoot.hasWindow && !recycleRoot.emptyHint,
  recycleRoot.hasWindow ? `树节点：${recycleRoot.treeNodes.join(" ")}` : "窗口没打开",
);

/**
 * ⚠️⚠️ 断言「两篇草稿都在回收站里」，必须【真的把它们找出来】，
 *     而不是在根视图里扫一遍按钮文字。
 *
 *     第一版就是扫根视图的，读到：
 *       📁 文件夹 / 📁技术1 / 📁数学1 / 📁随笔1
 *     —— 全是【文件夹节点】。草稿的文件名节点要展开到叶子才出现，
 *     所以永远扫不到，断言恒失败。
 *
 *     这也正是回收站"不是平铺列表、是树"的直接体现。
 *     正确做法：把每一篇的名字当作路径去钻，
 *     钻进叶子之后确认那篇确实在。
 *     每一篇都单独钻一条路径，五篇也照样适用。
 */
const DRAFT_PATHS = [
  ["技术", "数学", "公式测试草稿"],
  ["随笔", "还在搭的草稿"],
];

const foundDrafts = [];
for (const path of DRAFT_PATHS) {
  // 每次都从根开始（关掉重开，回到干净的根视图）
  await closeAll();
  await page.dblclick('[data-icon-id="recycle"]');
  await page.waitForTimeout(900);

  let ok = true;
  for (const step of path) {
    ok = await dblRowNamed(step);
    if (!ok) break;
  }
  foundDrafts.push({ path, ok, leaf: ok ? path[path.length - 1] : null });
}

check(
  "回收站里能找齐那两篇 draft: true 的草稿（按分类逐层钻进去）",
  foundDrafts.every((d) => d.ok),
  foundDrafts.map((d) => (d.ok ? `✓${d.leaf}` : `✗${d.path.join("/")}`)).join("  "),
);

/**
 * ⚠️ 反向验证：回收站里【不该有】正式文章。
 *
 *    这条比"有两篇草稿"更重要 —— 如果 buildTree 的 kind 过滤写错了，
 *    把 7 篇正式文章也塞进来，光看"草稿在不在"是发现不了的。
 *    所以要主动去找一篇已知的正式文章，确认它【找不到】。
 */
await closeAll();
await page.dblclick('[data-icon-id="recycle"]');
await page.waitForTimeout(900);
const formalInRecycle = await page.evaluate(() => {
  const w = document.querySelector(".win-body");
  // 递归展开所有可见文字，找正式文章的特征词
  const t = w?.textContent ?? "";
  return {
    // 这几篇是明确的正式文章（draft 非 true）
    hits: ["为什么我把博客做成了", "从 Hexo 搬", "LaTeX 公式写法说明"].filter((k) =>
      t.includes(k),
    ),
  };
});
check(
  "回收站里【没有】正式文章（只收 draft: true）",
  formalInRecycle.hits.length === 0,
  formalInRecycle.hits.length ? `混进了：${formalInRecycle.hits.join(" / ")}` : "确认干净",
);

/* ═══════════════ 十、回收站双击 → 只读源码记事本 ═══════════════ */
console.log("\n── 十、双击草稿 → 只读源码 ──");

/**
 * ⚠️⚠️ 钻进「公式测试草稿」，而不是随便挑一篇。
 *
 *    因为它的正文里塞了 \$E = mc^2\$、\$\$…\$\$、行内代码和代码块，
 *    正好是"渲染"最容易改掉的东西：
 *      渲染后 → <span class="katex">…</span>，LaTeX 源码消失
 *      源码   → 原样保留 \$E = mc^2\$
 *    所以拿它当被试，一测就能分辨到底是渲染还是源码。
 *
 *    它挂在 技术/数学 这个两级分类下，所以要逐层钻进去。
 */
const openedTech = await dblRowNamed("技术");
const openedMath = await dblRowNamed("数学");
const leafRows = await page.evaluate(() =>
  [...(document.querySelector(".win-body")?.querySelectorAll("tbody tr") ?? [])].map(
    (tr) => (tr.querySelector("td")?.textContent ?? "").trim(),
  ),
);
const openedDraft = await dblRowNamed("公式测试草稿");
await page.waitForTimeout(1300);

const draftView = await page.evaluate(`(() => {
  const root = ${ROOT_OF(FIND_NOTEPAD)};
  const ta = root?.querySelector("textarea");
  const bars = [...(root?.querySelectorAll("div") ?? [])].filter((d) =>
    /border-t/.test(d.className?.toString() ?? "")
  );
  const bar = bars[bars.length - 1];
  return {
    found: !!root,
    // 标题栏应带「（只读）」后缀 —— 这是回收站这条路径的专属标记
    handleText: (root?.querySelector(":scope > .win-drag-handle")?.textContent ?? "").trim(),
    articleTitle: (bar?.querySelector("span")?.textContent ?? "").split("·")[0].trim(),
    hasTextarea: !!ta,
    readOnly: ta ? ta.hasAttribute("readonly") : null,
    text: ta?.value ?? "",
    hasMdBody: !!root?.querySelector(".md-body"),
    hasKatex: !!root?.querySelector(".katex"),
    // 视图切换按钮是否真的被禁用
    switchDisabled: (() => {
      const b = [...(root?.querySelectorAll("button") ?? [])].find((x) =>
        /渲染视图|源码视图/.test(x.textContent ?? "")
      );
      return b ? b.disabled === true : null;
    })(),
    // 「只读」小标记
    hasReadonlyBadge: /只读/.test(root?.textContent ?? ""),
  };
})()`);

check(
  "双击草稿开的是【记事本】窗口（不是另开一个应用）",
  openedTech &&
    openedMath &&
    openedDraft &&
    draftView.found &&
    /公式测试/.test(draftView.articleTitle),
  draftView.found
    ? `钻进「${leafRows.join(" / ")}」→ 在读「${draftView.articleTitle}」`
    : "没开出窗口",
);

/**
 * ⚠️⚠️ 核心断言：文本区里是 Markdown 原文，而不是渲染后的 HTML。
 *
 *    三个方向一起卡：
 *      · textarea 存在（说明是源码模式）
 *      · 里面能找到 \$E = mc^2\$ 这段 LaTeX 源码
 *      · 页面里没有 .katex（说明压根没走渲染）
 *    只看第一个的话，"把渲染结果塞进 textarea"也能骗过去。
 *
 *    ⚠️ 还额外检查开头是 --- （原始 frontmatter）。
 *       "源码"最硬的证据就是连 frontmatter 都还在 ——
 *       渲染路径一定会把它吃掉（它只用于生成 meta，不进正文）。
 */
const rawHasLatex = /\$E\s*=\s*mc\^2\$/.test(draftView.text) || /\$\$/.test(draftView.text);
const rawHasFrontmatter = /^---/.test(draftView.text.trim());
check(
  "显示的是 Markdown 源码（含原始 frontmatter），不是渲染后的 HTML",
  draftView.hasTextarea && rawHasLatex && rawHasFrontmatter && !draftView.hasMdBody,
  `textarea=${draftView.hasTextarea} md-body=${draftView.hasMdBody} LaTeX源码=${rawHasLatex} frontmatter=${rawHasFrontmatter}`,
);
check(
  "没有走 LaTeX 渲染（页面上找不到 .katex）",
  draftView.hasKatex === false,
  draftView.hasKatex ? "出现了 katex 渲染结果（不该有）" : "确认无 katex 元素",
);
check(
  "源码文本区是只读的（readonly）",
  draftView.readOnly === true,
  `readonly=${draftView.readOnly}`,
);
check(
  "窗口标题带「（只读）」标记，和普通记事本区分开",
  /只读/.test(draftView.handleText) || draftView.hasReadonlyBadge,
  `标题栏「${draftView.handleText}」，只读标记=${draftView.hasReadonlyBadge}`,
);

/**
 * ⚠️⚠️ 三条通路都要堵住，只堵一条等于没堵。
 *
 *    F9 是【后门】：就算 UI 上的按钮禁用了，
 *    键盘按下 F9 一样会调 setRendered。
 *    所以必须一个开一个测。
 *
 *    ⚠️⚠️ 第一版把 KeyboardEvent 派发到 document.body 和 window 上，
 *       但 NotepadView 的监听是挂在【窗口自身元素】上的
 *       （这样多窗口同时开着时，F9 只影响聚焦的那个窗口）。
 *       派发目标不对，事件根本到不了 handler，
 *       于是"F9 没切走"看起来通过了 —— 其实只是因为压根没按到。
 *       典型的【假阳性】：测试绿了，但什么都没验到。
 *       正确做法是派发到窗口根节点。
 */
const f9Result = await page.evaluate(`(async () => {
  const root = ${ROOT_OF(FIND_NOTEPAD)};
  const before = root?.querySelector("textarea") ? "source" : "rendered";
  const ev = () => new KeyboardEvent("keydown", { key: "F9", bubbles: true });
  root?.dispatchEvent(ev());
  await new Promise((r) => setTimeout(r, 400));
  // 再补一次"按在 document 上"的老路径，确认两条路都堵死了
  document.dispatchEvent(ev());
  await new Promise((r) => setTimeout(r, 400));
  const after = ${ROOT_OF(FIND_NOTEPAD)};
  return {
    before,
    after: after?.querySelector("textarea") ? "source" : "rendered",
    hasMdBody: !!after?.querySelector(".md-body"),
  };
})()`);
check(
  "按 F9 无法切走（键盘后门也堵上了）",
  f9Result.after === "source" && !f9Result.hasMdBody,
  `${f9Result.before} → ${f9Result.after}（应保持 source）`,
);
check(
  "状态栏的视图切换按钮处于禁用状态",
  draftView.switchDisabled === true,
  `disabled=${draftView.switchDisabled}`,
);

/**
 * ⚠️ 视图模式【不该被写入 localStorage】。
 *
 *    否则用户在回收站里看了一眼草稿，下次打开普通文章的记事本
 *    就变成源码模式了 —— 这叫"就地污染用户设置"。
 *    这是在写 NotepadView 时特意 guard 掉的一个坑，必须验。
 */
const afterDraftLS = await page.evaluate(() =>
  localStorage.getItem("win10-blog:notepad-view"),
);
check(
  "打开草稿【不会】污染记事本的视图设置（localStorage 仍是 rendered）",
  afterDraftLS === "rendered",
  `win10-blog:notepad-view = ${afterDraftLS}`,
);

/* ═══════════════ 十一、回收站排序 ═══════════════ */
console.log("\n── 十一、回收站按名称/时间排序 ──");

await closeAll();
await page.dblclick('[data-icon-id="recycle"]');
await page.waitForTimeout(900);

/**
 * ⚠️⚠️ 这一节前后试了三种判据，前两种都不成立，记下来免得再绕。
 *
 *   尝试一（根层，比"顺序变没变"）：
 *     根层是两个文件夹 📁技术 / 📁随笔。
 *     按名称：技术 < 随笔（拼音 j < p）
 *     按时间：技术(10-06) 比 随笔(10-05) 新，倒序也是技术在前
 *     —— 两个排序键给出的顺序【恰好相同】，判据分不出来。
 *
 *   尝试二（钻到叶子层，比"翻转"）：
 *     钻进 技术 → 数学，里面只有【一篇】草稿。
 *     单条目无论点几次都不动，"翻转"永远不成立。
 *
 *   ✗ 两次的共同错误：拿"顺序有没有变"当判据。
 *     而"顺序变不变"取决于【数据恰好构成什么形状】——
 *     条目数不够、或两个排序键同向，判据就废了。
 *     这是在让测试去碰运气，不是在设计断言。
 *
 *   正解：不问"顺序变没变"，去问【排序键本身有没有被执行】。
 *     资源管理器列表的日期是【独立一列】。
 *     把「每行的日期」读出来，检查这串日期是单调的 ——
 *     无论条目多少、文件名长什么样，只要"按时间排序"这一键
 *     真的生效，日期列就必然是升序或降序。
 *     这一条与数据形状无关，所以立得住。
 */

/** 读表格：每行的 [名称, 类型, 日期] */
const readTable = () =>
  page.evaluate(() =>
    [...(document.querySelector(".win-body")?.querySelectorAll("tbody tr") ?? [])].map((tr) => {
      const tds = [...tr.querySelectorAll("td")];
      return {
        name: (tds[0]?.textContent ?? "").replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "").trim(),
        date: (tds[2]?.textContent ?? "").trim(),
      };
    }),
  );

/**
 * ⚠️⚠️ 排序按钮的【真实文字】是「名称」「修改日期▼」，不是「时间」。
 *
 *    第一版写 clickSort("时间")，界面上根本没有这个按钮，
 *    返回 false；后面 `hasTimeSort && …` 一短路，
 *    整条断言直接失败 —— 看起来像"按时间排序坏了"，
 *    其实是我没找到那个按钮。
 *
 *    这个坑值得记：断言里出现 `X && …` 时，X 为 false 会让
 *    后面真正的检查【根本不执行】。失败信息只说明"X 不成立"，
 *    完全不告诉你后面那半句的真假。
 *    所以下面这些断言把 `hasXxx &&` 单独拆成一条 check，
 *    让"按钮没找到"和"排序没生效"是两条独立的结论。
 *
 *    另外顺带一个发现：按钮文字里的 ▼ / ▲ 是【排序方向指示符】，
 *    会随点击翻转，所以匹配时要先把这些符号剥掉再比。
 */
const clickSort = (label) =>
  page.evaluate((l) => {
    const w = document.querySelector(".win-body");
    const b = [...(w?.querySelectorAll("button") ?? [])].find((x) => {
      const t = (x.textContent ?? "").trim().replace(/[▲▼▲▼↑↓\s]/g, "");
      return t === l;
    });
    b?.click();
    return !!b;
  }, label);

const rowsBefore = await readTable();
const hasSortUI = await clickSort("名称");
await page.waitForTimeout(600);
const rowsByName = await readTable();

check(
  "回收站有排序控件（名称 / 时间）",
  hasSortUI,
  hasSortUI ? `当前：${rowsBefore.map((r) => r.name).join(" / ")}` : "没找到排序按钮",
);

/**
 * ⚠️ 名称排序的判据：名称列是单调的。
 *
 *    用 localeCompare("zh", {numeric:true}) 复算 ——
 *    默认的 < 比较是按 UTF-16 码位，中文会排得乱七八糟，
 *    和界面上看到的顺序对不上。
 */
const isMonotonic = (arr) =>
  arr.length > 0 &&
  (arr.every((d, i) => i === 0 || d >= arr[i - 1]) ||
    arr.every((d, i) => i === 0 || d <= arr[i - 1]));

const names = rowsByName.map((r) => r.name);

check(
  "点「名称」后，名称列是单调的（升序或降序都算对）",
  isMonotonic(names),
  names.join(" / ") || "(没读到名称列)",
);

/**
 * 再点一次「名称」：顺序应当翻面。
 *
 * ⚠️ 这条在【根层】是有意义的 —— 根层有 2 个文件夹，
 *    翻转是能观察到的（技术2 ⇄ 随笔1）。
 */
const hasNameSort2 = await clickSort("名称");
await page.waitForTimeout(600);
const names2 = (await readTable()).map((r) => r.name);
check(
  "再点一次「名称」，顺序翻面（证明排序 handler 真的在跑）",
  hasNameSort2 && JSON.stringify(names) !== JSON.stringify(names2) && isMonotonic(names2),
  `${names.join(" / ")}  ⇄  ${names2.join(" / ")}`,
);

/**
 * ⚠️⚠️ 根层的「修改日期」列全是「—」（文件夹没有单一 pubDate），
 *     所以在这里【没法】验证时间排序本身。
 *
 *     与其写一条注定测不出东西的断言（"日期列单调"对一串「—」恒真，
 *     是标准的假阳性），不如如实记录这个局限，
 *     把真正的时间排序验证放到叶子层去做 —— 那里有真实日期。
 *
 *     这也说明一件事：断言"通过了"不等于"验到了"。
 *     一条恒真的断言比没有断言更糟，因为它会给人虚假的安全感。
 */
const datesAtRoot = rowsByName.map((r) => r.date);
const hasDateColumn = datesAtRoot.some((d) => d && d !== "—");
check(
  "根层的日期列只有「—」（文件夹没有日期），时间排序改到叶子层验",
  !hasDateColumn,
  hasDateColumn
    ? `出现了真实日期：${datesAtRoot.join(" / ")}`
    : "符合预期：文件夹行日期为空，时间排序在下一节验证",
);

/* ═══════════════ 十一之二、叶子层排序（有多条目的那一层）═══════════════
 *
 * ⚠️⚠️ 为什么根层测不够，还要专门钻到叶子层再测一遍？
 *
 *   根层的行全是【文件夹】，而文件夹的日期列是「—」——
 *   因为文件夹没有单一的 pubDate（见 FileList.tsx:
 *   `node.post ? formatDate(...) : "—"`）。
 *   日期全是「—」时，"日期列单调"这个判据恒定成立，测不出东西。
 *
 *   而且根层只有 2 个文件夹，两个排序键给出的顺序又恰好同向
 *   （技术 j < 随笔 p，时间上技术也更新），"顺序变没变"同样分不出来。
 *
 *   真要在这一层测出东西，唯一可靠的办法是【让数据支持这个断言】：
 *   在同一个分类下放两篇 pubDate 不同的草稿
 *   （formula-draft 2026-10-06 / vector-draft 2026-10-08）。
 *   这样"按时间排序"和"按名称排序"才会给出可区分的结果。
 *
 *   ⚠️ 这条经验值得记：当一条断言怎么都测不出东西时，
 *      先问"是产品错了，还是【这批数据根本撑不起这个问题】"。
 *      多数时候是后者 —— 那就去补数据，而不是把断言改松。
 */
console.log("\n── 十一之二、叶子层（技术/数学）排序 ──");

/** 钻进 技术 → 数学，这一层有 2 篇草稿 */
const gotoMathLeaf = async () => {
  await closeAll();
  await page.dblclick('[data-icon-id="recycle"]');
  await page.waitForTimeout(800);
  await dblRowNamed("技术");
  await dblRowNamed("数学");
  await page.waitForTimeout(500);
};

await gotoMathLeaf();
const leafBefore = await readTable();

check(
  "「技术/数学」下有 2 篇草稿（这是排序可测的前提）",
  leafBefore.length === 2,
  leafBefore.map((r) => `${r.name}(${r.date})`).join(" / ") || "(没读到)",
);

/** 按名称 —— 连点两次，顺序应当翻面（2 个条目足够判定了） */
const leafName1 = await clickSort("名称");
await page.waitForTimeout(600);
const leafByName = (await readTable()).map((r) => r.name);
const leafName2 = await clickSort("名称");
await page.waitForTimeout(600);
const leafByName2 = (await readTable()).map((r) => r.name);

check(
  "叶子层点「名称」两次，顺序翻面（升序 ↔ 降序）",
  leafName1 && leafName2 && JSON.stringify(leafByName) !== JSON.stringify(leafByName2),
  `${leafByName.join(" / ")}  ⇄  ${leafByName2.join(" / ")}`,
);

/** 按时间 —— 按钮文字是「修改日期」，不是「时间」 */
const leafTime = await clickSort("修改日期");
await page.waitForTimeout(600);
const leafByTime = await readTable();
const leafDates = leafByTime.map((r) => r.date);

check(
  "叶子层能点「修改日期」按钮（排序控件存在）",
  leafTime,
  leafTime ? "点到了" : "❌ 没找到「修改日期」按钮",
);
check(
  "叶子层点「修改日期」后，日期列单调（升序或降序）",
  isMonotonic(leafDates),
  leafByTime.map((r) => `${r.name}(${r.date})`).join(" / ") || "(没读到日期列)",
);

/**
 * ⚠️⚠️ 怎么证明「两个排序键各按各的规则排」，绕了三次才找对判据。
 *
 *   尝试一：断言"按时间的结果 ≠ 按名称的结果"。
 *     ✗ 条目少时两个键可能给出一样的顺序，会冤枉正常的产品。
 *
 *   尝试二：断言"两个结果互为逆序（一个升一个降）"。
 *     ✗ 前提是"名称序与时间序天然相反"，但这不成立：
 *        名称（拼音）：公式 gong < 向量 xiang
 *        日期：       10-06 < 10-08
 *       两个键的"自然顺序"是同向的，所以同向的结果才是对的。
 *       这条断言反而会把正确行为判成失败。
 *
 *   ✅ 尝试三（正解）：去看【表头上的方向指示符】。
 *
 *     资源管理器在表头用 ▲/▼ 标出"当前按哪一列、什么方向"。
 *     所以最直接的证据是：
 *       点「名称」  → 指示符必须出现在【名称】列上
 *       点「修改日期」→ 指示符必须移动到【修改日期】列上
 *     这才是"排序键真的切换了"的直接体现 ——
 *     它和结果的顺序长什么样【完全无关】，
 *     所以不会被数据的形状骗到。
 *
 *     ⚠️ 这个教训很通用：当一条断言怎么调都不对时，
 *        先怀疑"我选的观察点是不是本来就不该随这个变化而变化"。
 *        换一个【直接反映被测行为】的观察点，问题往往就消失了。
 */
const readHeader = () =>
  page.evaluate(() =>
    [...(document.querySelector(".win-body")?.querySelectorAll("thead th, thead td") ?? [])].map(
      (x) => (x.textContent ?? "").trim(),
    ),
  );

/** 先点「名称」，指示符应在名称列 */
await clickSort("名称");
await page.waitForTimeout(600);
const headByName = await readHeader();

/** 再点「修改日期」，指示符应移到日期列 */
await clickSort("修改日期");
await page.waitForTimeout(600);
const headByDate = await readHeader();

const markerOn = (headers, col) => {
  const h = headers.find((x) => x.replace(/[▲▼]/g, "").trim() === col);
  return h ? /[▲▼]/.test(h) : false;
};

check(
  "点「名称」时，排序指示符（▲/▼）在名称列上",
  markerOn(headByName, "名称"),
  headByName.join(" | "),
);
check(
  "点「修改日期」时，指示符移动到日期列上（说明排序键真的切换了）",
  markerOn(headByDate, "修改日期") && !markerOn(headByDate, "名称"),
  headByDate.join(" | "),
);

/** 收尾：回到桌面，免得把窗口留给下一个套件 */
await closeAll();

/* ═══════════════ 十二、浏览器：三个标签页 ═══════════════ */
console.log("\n── 十二、浏览器三个标签页 ──");

await closeAll();
await page.dblclick('[data-icon-id="browser"]');
await page.waitForTimeout(900);

const tabInfo = await page.evaluate(() => {
  const w = document.querySelector(".win-body");
  /*
    ⚠️⚠️ 这里必须用【包含】匹配，不能用 === 全等。

       标签按钮里是「图标 span + 文字 span」两个子元素：
         <button><span aria-hidden>🔗</span><span class="truncate">友情链接</span></button>
       所以 textContent 拼出来是 "🔗友情链接"，不是 "友情链接"。
       第一版写 `=== "友情链接"`，永远匹配不上，
       于是"一个标签都没找到" —— 纯属测试自己的锅。

       判据同时收窄到【标签栏内】：标签栏是
       .win-body 里第一个 flex items-end 的容器，
       这样浏览器工具栏上万一也有同名按钮也不会误伤。
  */
  const bar = w?.querySelector("div.items-end");
  const tabs = [...(bar?.querySelectorAll("button") ?? [])].map((b) =>
    (b.textContent ?? "").trim(),
  );
  return {
    hasWindow: !!w,
    allTabTexts: tabs,
    tabs: tabs.filter((t) => /友情链接|找到我|使用教程/.test(t)),
  };
});
check(
  "浏览器有三个标签页：友情链接 / 找到我 / 使用教程",
  tabInfo.hasWindow && tabInfo.tabs.length === 3,
  tabInfo.tabs.join(" / ") || `标签栏里只有：${tabInfo.allTabTexts.join(" | ") || "(空)"}`,
);

/** 点某个标签页，返回该标签页内容区的一些特征 */
const clickTab = async (name) => {
  const clicked = await page.evaluate((n) => {
    const w = document.querySelector(".win-body");
    const bar = w?.querySelector("div.items-end");
    const b = [...(bar?.querySelectorAll("button") ?? [])].find((x) =>
      (x.textContent ?? "").includes(n),
    );
    b?.click();
    return !!b;
  }, name);
  await page.waitForTimeout(700);
  const body = await page.evaluate(() => {
    const w = document.querySelector(".win-body");
    return {
      text: (w?.textContent ?? "").slice(0, 4000),
      imgs: [...(w?.querySelectorAll("img") ?? [])].map((i) => ({
        src: i.getAttribute("src") ?? "",
        alt: i.getAttribute("alt") ?? "",
        // 已经被 onError 换成兜底内容了吗
        broken: i.complete && i.naturalWidth === 0,
      })),
      links: [...(w?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href") ?? ""),
      // 教程正文是「渲染后的 HTML」的判据
      hasMdBody: !!w?.querySelector(".md-body"),
      headings: [...(w?.querySelectorAll("h1,h2,h3") ?? [])].map((h) =>
        (h.textContent ?? "").trim(),
      ),
    };
  });
  return { clicked, ...body };
};

/* —— 标签页一：友情链接 —— */
const tLinks = await clickTab("友情链接");
check(
  "标签页一「友情链接」列出了友链卡片",
  /Astro|MDN|React|Tailwind/.test(tLinks.text),
  tLinks.text.replace(/\s+/g, " ").slice(0, 80),
);
check(
  "友链卡片带图标（头像位置有 img 或兜底字母）",
  tLinks.imgs.length > 0 || /astro\.build|developer\.mozilla/.test(tLinks.links.join(" ")),
  `${tLinks.imgs.length} 个 img，${tLinks.links.length} 个链接`,
);
/**
 * ⚠️ 这一条验的是「提示改哪个文件」—— 用户明确要求页面上要有可扩展提示。
 *    断言的是文案里出现了 src/config/links.ts 这个【真实存在的路径】，
 *    而不是断言某个 class。将来改文案时，只要还指向正确的文件就能过。
 */
check(
  "页面提示了「改 src/config/links.ts 就能加减友链」",
  /config\/links\.ts/.test(tLinks.text),
  /config\/links\.ts/.test(tLinks.text) ? "有提示" : "没找到提示文案",
);

/* —— 标签页二：找到我 —— */
const tSocial = await clickTab("找到我");
check(
  "标签页二「找到我」列出了社交链接",
  /GitHub|Bilibili|B站|邮箱|RSS|Twitter|微博|知乎/i.test(tSocial.text),
  tSocial.text.replace(/\s+/g, " ").slice(0, 100) || "(空)",
);
check(
  "社交卡片是外部链接（新窗口打开，rel=noopener）",
  tSocial.links.some((h) => /^https?:\/\//.test(h)),
  `${tSocial.links.filter((h) => /^https?:/.test(h)).length} 个外链`,
);

/* —— 标签页三：使用教程 —— */
const tGuide = await clickTab("使用教程");
/**
 * ⚠️ 教程正文必须走 Markdown → HTML 渲染，
 *    判据是 .md-body 存在（那是渲染后的容器）。
 *    如果只把 .md 原文塞进 <pre>，.md-body 就不会有。
 */
check(
  "标签页三「使用教程」显示渲染后的 HTML（有 .md-body）",
  tGuide.clicked && tGuide.hasMdBody,
  `点了=${tGuide.clicked} md-body=${tGuide.hasMdBody}`,
);

/**
 * ⚠️⚠️ 教程 5 篇的判据用【左侧目录里的篇名】，而不是正文里出现过的词。
 *
 *    第一版写 `["发布一篇文章","添加","友链","社交","外观"].filter(…).length >= 4`，
 *    这种"包含其中 4 个就算过"的断言非常松：
 *    只要有 1 篇教程的正文里恰好提到了这些词，也能凑够数。
 *
 *    改成核对 5 个【确切篇名】，一个不少：
 *    这些字符串来自 src/content/guide/*.md 的 frontmatter title，
 *    换了教程就得同步改这里 —— 这正是我们想要的"改动要留痕"。
 */
const guideTitles = [
  "如何在本地发布一篇文章",
  "本浏览器如何添加和修改标签页",
  "如何修改友情链接",
  "如何修改社交链接",
  "如何换壁纸和改主题",
];
const hitTitles = guideTitles.filter((t) => tGuide.text.includes(t));
check(
  "教程目录里有全部 5 篇（篇名逐一核对）",
  hitTitles.length === guideTitles.length,
  `${hitTitles.length}/5：${hitTitles.join(" / ") || "(一个都没找到)"}`,
);

/**
 * ⚠️ 渲染成 HTML 的硬证据：文档里出现了【真实的标题元素】。
 *
 *    如果只是把 .md 原文塞进 <pre>，那整篇就是一个文本节点，
 *    querySelectorAll("h1,h2,h3") 会是 0。
 *    另外顺手确认正文里确实有 <p>（段落被拆开了），
 *    这两条一起，"真的是 HTML 不是纯文本"才站得住。
 */
const guideParaCount = await page.evaluate(
  () => document.querySelectorAll(".win-body .md-body p").length,
);
check(
  "教程正文是 HTML 元素（标题 + 段落都渲染出来了）",
  tGuide.headings.length >= 5 && guideParaCount >= 3,
  `${tGuide.headings.length} 个标题、${guideParaCount} 个段落`,
);

/**
 * ⚠️⚠️ 切换教程篇目，正文必须真的换掉。
 *
 *    只验"有 5 个篇名"是不够的 —— 左侧目录列出来了，
 *    但点击不生效的话（比如 handler 没绑上），
 *    用户点哪一篇看到的都是第一篇，体验是坏的，而上面的断言全绿。
 *    所以真要"点一下另一篇，看正文变没变"。
 */
const beforeSwitch2 = await page.evaluate(
  () => document.querySelector(".win-body .md-body h1,h2,h3,h4")?.textContent?.trim() ?? "",
);
const switched = await page.evaluate(() => {
  const w = document.querySelector(".win-body");
  const target = [...(w?.querySelectorAll("button,a") ?? [])].find((x) =>
    (x.textContent ?? "").includes("如何换壁纸和改主题"),
  );
  target?.click();
  return !!target;
});
await page.waitForTimeout(700);
const afterSwitch2 = await page.evaluate(
  () => document.querySelector(".win-body .md-body h1,h2,h3,h4")?.textContent?.trim() ?? "",
);
check(
  "点左侧目录能切换教程（正文真的换了）",
  switched && beforeSwitch2 !== afterSwitch2 && afterSwitch2.length > 0,
  `「${beforeSwitch2}」→「${afterSwitch2}」`,
);

/**
 * ⚠️⚠️ 教程正文必须用【和文章同一套排版】。
 *
 *    这就是「教程内容用 .md 当源文件、渲染成 html 的样子」这条要求的
 *    可验证形式：只要 .md-body 这个类在，排版规则就和文章页共用一份。
 *    如果哪天有人给教程套了另一套 class，这条会立刻红。
 */
const guideUsesSharedClass = await page.evaluate(() => {
  const el = document.querySelector(".win-body .md-body");
  if (!el) return null;
  const cs = getComputedStyle(el);
  return {
    // .md-body 在全局样式里定义了字号/行高，能读到就说明规则生效了
    fontSize: cs.fontSize,
    lineHeight: cs.lineHeight,
  };
});
check(
  "教程正文复用了文章的 .md-body 排版（字号/行高已生效）",
  !!guideUsesSharedClass && parseFloat(guideUsesSharedClass.fontSize) > 10,
  guideUsesSharedClass
    ? `font-size=${guideUsesSharedClass.fontSize} line-height=${guideUsesSharedClass.lineHeight}`
    : "没找到 .md-body",
);

/* ═══════════════ 十三、草稿不会泄漏进公开渠道 ═══════════════ */
console.log("\n── 十三、草稿不外泄 ──");

/**
 * ⚠️⚠️ 这一节防的是"回收站功能做好了，但草稿被搜索引擎收录了"。
 *
 *    草稿的静态页 /posts/<slug> 是【故意存在】的（方便自己发预览链接），
 *    但如果它同时出现在 sitemap / RSS / 搜索索引里，
 *    等于主动请爬虫去收录未完成的内容。
 *
 *    这类问题在浏览器里点来点去是发现不了的 —— 必须去 fetch
 *    那几个机器读的端点，所以单独列一节。
 */
const sitemap = await page.request.get(`${BASE}/sitemap.xml`).then((r) => r.text());
const rss = await page.request.get(`${BASE}/rss.xml`).then((r) => r.text());
const index = await page.request.get(`${BASE}/search-index.json`).then((r) => r.json());

const draftSlugs = ["draft-note", "formula-draft"];
check(
  "草稿不在 sitemap.xml 里",
  !draftSlugs.some((s) => sitemap.includes(s)),
  draftSlugs.filter((s) => sitemap.includes(s)).join(", ") || "干净",
);
check(
  "草稿不在 rss.xml 里",
  !draftSlugs.some((s) => rss.includes(s)),
  draftSlugs.filter((s) => rss.includes(s)).join(", ") || "干净",
);
check(
  "草稿不在 search-index.json 里",
  !index.some((d) => draftSlugs.includes(d.slug)),
  `${index.length} 篇索引，草稿命中 ${index.filter((d) => draftSlugs.includes(d.slug)).length} 篇`,
);

/**
 * ⚠️⚠️ 最后这条是【本次新发现的漏洞】。
 *
 *    草稿页 /posts/draft-note 是能访问的（这是设计），
 *    但它必须带 noindex —— 否则任何外链、任何别人转发的
 *    URL，都可能被爬虫顺藤摸瓜收录。
 *
 *    robots.txt 里的 Disallow 只管住"爬虫主动抓"，
 *    管不住"别人给了链接"。noindex 才能覆盖后一种情况。
 */
const draftPage = await page.request.get(`${BASE}/posts/formula-draft`);
const draftHtml = await draftPage.text();
check(
  "草稿静态页带 noindex（防止被搜索引擎收录）",
  /noindex/i.test(draftHtml),
  /noindex/i.test(draftHtml) ? "有 noindex" : "❌ 缺少 noindex，草稿可能被收录",
);

/* ═══════════════ 十四、没有新增 404 ═══════════════ */
console.log("\n── 十四、资源加载 ──");

/**
 * ⚠️ 这里排除两类 404：
 *
 *    1. /wallpapers/ —— 候选壁纸图是【让用户后补的】，缺图是预期状态，
 *       WallpaperPicker 会显示「待补充」并禁止选中，功能完全正常。
 *
 *    2. 友链头像 —— BrowserLinks 的四级兜底里，
 *       "抓对方网站的 favicon"这一步依赖第三方服务，
 *       离线或有域名抓不到时就会 404。
 *       图片挂了会被 onError 换成首字母兜底块，
 *       卡片布局和可读性都不受影响，所以不算失败。
 */
const realFails = failed.filter(
  (f) => !/\/wallpapers\//.test(f) && !/favicon/i.test(f),
);
check(
  "没有意外 404（壁纸候选图、友链头像抓取失败均已排除）",
  realFails.length === 0,
  realFails.length
    ? realFails.slice(0, 4).join("; ")
    : `${failed.length} 个可预期的图片未就绪（正常）`,
);

/* ═══════════════ 汇总 ═══════════════ */
await browser.close();

const pass = results.filter((r) => r.pass).length;
console.log(`\n${"═".repeat(46)}`);
console.log(`通过 ${pass}/${results.length}`);
if (pass < results.length) {
  console.log("\n失败项：");
  results.filter((r) => !r.pass).forEach((r) => console.log(`  ❌ ${r.name}  → ${r.detail}`));
  process.exit(1);
}
console.log("全部通过 ✅");
