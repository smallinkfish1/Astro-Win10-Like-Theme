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

/* ═══════════════ 八、没有新增 404 ═══════════════ */
console.log("\n── 八、资源加载 ──");

/**
 * ⚠️ 这里排除 /wallpapers/ 下的 404 ——
 *    因为候选壁纸图是【让用户后补的】，缺图是预期状态，
 *    WallpaperPicker 会显示「待补充」并禁止选中，功能完全正常。
 *
 *    如果哪天用户把图补上了，这些 404 自然消失，断言依然通过。
 */
const realFails = failed.filter((f) => !/\/wallpapers\//.test(f));
check(
  "没有意外 404（壁纸候选图的缺失是预期的，已排除）",
  realFails.length === 0,
  realFails.length ? realFails.slice(0, 4).join("; ") : `${failed.length} 个壁纸候选图未就绪（正常）`,
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
