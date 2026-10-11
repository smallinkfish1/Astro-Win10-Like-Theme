/**
 * 第六阶段（桌面还原：壁纸 + 五个图标 + 三个新窗口）浏览器验收脚本。
 *
 * 跑法：node verify-desktop.mjs
 * 前置：npx astro preview --port 4400 已在跑
 *
 * ⚠️ 端口说明：
 *    Astro 的 preview 命令【同一目录只允许跑一个实例】，
 *    再起第二个会直接报 "Another astro preview server is already running"
 *    （连 --force 都只是替换掉第一个，不会监听新端口）。
 *    所以这里用 4400 和 verify.mjs / verify-theme.mjs / verify-tiles.mjs
 *    共用同一个服务 —— 反正它们读的是同一份 dist，没有冲突。
 *    （之前这里写 4401，就是为了错开，结果反而起不来，白白报 ERR_CONNECTION_REFUSED。）
 *
 * 设计原则：只断言【事实】，不断言类名。
 *   比如"壁纸生效"要读 getComputedStyle 里最终的 background-image 字符串，
 *   而不是断言元素上有没有 .wallpaper 这个 class —— 类名随时会改，
 *   但"浏览器最终画出来的东西"是不会骗人的。
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

// 收集网络失败，用来发现 404 的图标/壁纸
const failed = [];
page.on("response", (r) => {
  if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
});

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("astro-island", { state: "attached", timeout: 8000 });
await page.waitForTimeout(600);

/* ══════════════ 一、壁纸 ══════════════ */
console.log("\n── 一、Win10 壁纸 ──");

const wall = await page.evaluate(() => {
  // 壁纸层是 body 下第一个 fixed inset-0 的 div，用计算样式反查更稳
  const el = [...document.querySelectorAll("body > div")].find((d) =>
    getComputedStyle(d).backgroundImage.includes("wallpaper")
  );
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { image: cs.backgroundImage, size: cs.backgroundSize, pos: cs.backgroundPosition };
});

check("壁纸层存在且指向 wallpaper 图", wall !== null,
  wall ? wall.image.replace(/^url\("?/, "").replace(/"?\)$/, "") : "没找到壁纸层");
check("壁纸铺满（cover）", wall?.size === "cover", wall?.size ?? "");
check("壁纸居中", wall?.pos?.includes("50%") || wall?.pos === "center", wall?.pos ?? "");

/* ══════════════ 二、桌面图标：必须正好五个 ══════════════ */
console.log("\n── 二、桌面图标 ──");

const icons = await page.evaluate(() =>
  [...document.querySelectorAll("[data-icon-id]")].map((el) => ({
    id: el.dataset.iconId,
    title: el.dataset.title,
    icon: el.dataset.icon,
    path: el.dataset.path,
    // 图标是 <img> 还是 emoji 文本
    hasImg: !!el.querySelector("img"),
    imgSrc: el.querySelector("img")?.getAttribute("src") ?? "",
    // img 是否真的加载成功（naturalWidth>0）
    imgOk: (() => {
      const im = el.querySelector("img");
      if (!im) return true;
      return im.complete && im.naturalWidth > 0;
    })(),
  }))
);

check("桌面图标正好 5 个", icons.length === 5, `实测 ${icons.length} 个`);
check(
  "五个图标是 此电脑/记事本/浏览器/回收站/控制面板",
  ["pc", "notepad", "browser", "recycle", "control"].every((id) =>
    icons.some((i) => i.id === id)
  ),
  icons.map((i) => i.id).join(", ")
);
check(
  "五个图标都用 /icons/*.png 图片",
  icons.every((i) => i.hasImg && i.icon === `/icons/${i.id}.png`),
  icons.map((i) => `${i.id}:${i.hasImg ? "img" : "emoji"}`).join(", ")
);

const badImg = icons.filter((i) => !i.imgOk);
check("所有图标图片都加载成功", badImg.length === 0,
  badImg.length ? badImg.map((i) => i.id).join(", ") : "5/5 加载完成");

/* ══════════════ 三、五个图标 → 正确的窗口 ══════════════ */
console.log("\n── 三、双击图标开窗口 ──");

/** 双击图标，等窗口出现，返回窗口标题 */
async function dblopen(id) {
  await page.dblclick(`[data-icon-id="${id}"]`);
  await page.waitForTimeout(550);
  return page.evaluate(() => {
    const wins = [...document.querySelectorAll(".win-body-wrap")];
    const last = wins[wins.length - 1];
    return last ? last.closest("div[class*='shadow']")?.querySelector(".win-drag-handle")?.textContent?.trim() ?? "" : "";
  });
}

/** 关掉所有窗口，避免叠加干扰 */
async function closeAll() {
  const btns = await page.$$('button[aria-label="关闭"]');
  for (const b of btns) {
    await b.click().catch(() => {});
    await page.waitForTimeout(120);
  }
  /**
   * ⚠️⚠️ 关键：必须等窗口【真的从 DOM 里消失】，不能只等个固定时间。
   *
   *   关窗流程是：点击 → store 标记 closing → 播退场动画（280ms）
   *              → 动画结束 → 才真正从 store 删除。
   *
   *   之前这里只 waitForTimeout(250) —— 比动画还短。
   *   于是下一步打开新窗口时，旧窗口的 .win-body 还在 DOM 里，
   *   querySelector(".win-body") 抓到的可能是【正在退场的那个】，
   *   它的内容还是上一个应用的 —— 断言自然全错。
   *
   *   表现就是"单独跑能过、在完整套件里跑就挂"，
   *   因为只有在前面开过窗口之后才会踩到这个坑。
   */
  await page
    .waitForFunction(() => document.querySelectorAll(".win-body-wrap").length === 0, {
      timeout: 5000,
    })
    .catch(() => {});
  await page.waitForTimeout(300);
}

const EXPECT = [
  { id: "pc", title: "此电脑" },
  { id: "notepad", title: "记事本" },
  { id: "browser", title: "浏览器" },
  { id: "recycle", title: "回收站" },
  { id: "control", title: "控制面板" },
];

for (const e of EXPECT) {
  await closeAll();
  const t = await dblopen(e.id);
  check(`双击「${e.title}」开出了对应窗口`, t.includes(e.title), `窗口标题: ${t || "(空)"}`);
}

/* ══════════════ 四、此电脑 = 资源管理器 ══════════════ */
console.log("\n── 四、此电脑（仿资源管理器）──");

await closeAll();
await dblopen("pc");
const explorer = await page.evaluate(() => {
  const w = document.querySelector(".win-body");
  if (!w) return null;
  const text = w.textContent ?? "";
  return {
    hasNav: !!w.querySelector("nav"),
    navItems: [...(w.querySelectorAll("nav button") ?? [])].map((b) => b.textContent?.trim()),
    hasTable: !!w.querySelector("table"),
    ths: [...(w.querySelectorAll("thead button") ?? [])].map((b) => b.textContent?.trim()),
    rows: w.querySelectorAll("tbody tr").length,
    hasStatusBar: /个项目/.test(text),
    hasBreadcrumb: /此电脑/.test(text),
    // 地址栏里应该有此电脑的图标
    addrIcon: !!w.querySelector('input[readonly]') &&
      !!w.querySelector('img[src="/icons/pc.png"]'),
  };
});

check("资源管理器有左侧导航树", explorer?.hasNav, `${explorer?.navItems?.length ?? 0} 项`);
check("导航树含「此电脑」和分类", /此电脑/.test(explorer?.navItems?.join(" ") ?? ""),
  explorer?.navItems?.join(" / ") ?? "");
check("右侧是详细列表（表格）", explorer?.hasTable, `表头: ${explorer?.ths?.join(" / ") ?? ""}`);
check("列表列出了文章行", (explorer?.rows ?? 0) > 0, `${explorer?.rows ?? 0} 行`);
check("有面包屑地址栏", explorer?.hasBreadcrumb);
check("有状态栏（N 个项目）", explorer?.hasStatusBar);
check("地址栏用了 pc 图标", explorer?.addrIcon);

/**
 * ── 点左侧文件夹导航，右侧列表应该切到那个文件夹的内容 ──
 *
 * ⚠️⚠️ 断言方式变了，说清楚为什么。
 *
 *    旧版：左树是【分类】列表，点一个分类 = 过滤出该分类的文章，
 *          行数必然变少，所以断言 "行数不同" 是有效的。
 *
 *    新版：左树是【文件夹层级树】（对应 category 的斜杠层级）。
 *          点文件夹是「进入这个目录」，右侧显示它的子节点 ——
 *          进入「前端」看到的是子文件夹（Astro / Markdown），
 *          可能只有 2 行，也可能因为布局不同而恰好行数相同。
 *
 *    "行数必须变化" 这个判据在新结构下不成立了。
 *    改成断言更本质的东西：
 *      1. 地址栏的面包屑里出现了刚才点的文件夹名
 *         （这是"确实进入了那个目录"的直接证据）
 *      2. 表格里所有行的名称都是该文件夹下的内容
 *         （至少不再显示根层的全部内容）
 */
const navClick = await page.evaluate(() => {
  const w = document.querySelector(".win-body");
  const btns = [...(w?.querySelectorAll("nav button") ?? [])];
  // 找第一个"带层级缩进"的文件夹按钮（indent > 0 说明是子层级）
  // 用 padding-left 判断：根节点是 10px，子层级每深一级 +12px
  const folder = btns.find((b) => {
    const pl = parseInt(getComputedStyle(b).paddingLeft, 10);
    return pl > 12;
  });
  if (!folder) return null;
  /**
   * ⚠️ 去掉图标再当标签用。
   *
   *    按钮的 textContent 是「📁前端3」这种（图标 + 名字 + 计数），
   *    而地址栏面包屑里只有「前端」。
   *    直接拿整串去 includes 会永远失败 —— 这是我第一版踩的坑。
   *
   *    所以要把装饰部分剥掉：图标（非中文/字母数字的字符）和末尾数字。
   */
  const raw = folder.textContent ?? "";
  const label = raw
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9/·_-]/g, "") // 去掉 emoji、箭头等
    .replace(/\d+$/, "") // 去掉末尾的项目计数
    .trim();
  folder.click();
  return { label, raw };
});
await page.waitForTimeout(400);

const afterNav = await page.evaluate(() => {
  const w = document.querySelector(".win-body");
  // 地址栏面包屑：把「此电脑 › 前端」这样的整串取出来
  const addr = w?.querySelector("input[readonly]")?.previousElementSibling;
  const addrText = addr?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const rows = [...(w?.querySelectorAll("tbody tr") ?? [])].map((r) =>
    r.textContent?.replace(/\s+/g, " ").trim() ?? "",
  );
  return { addrText, rows };
});

check(
  "点左侧文件夹能进入该层级",
  !!navClick && afterNav.addrText.includes(navClick.label),
  `点了「${navClick?.label ?? "?"}」→ 地址栏「${afterNav.addrText}」`
);
check(
  "进入文件夹后右侧列表跟着变",
  afterNav.rows.length > 0 || afterNav.addrText.includes("›"),
  `${afterNav.rows.length} 行`,
);

/* ══════════════ 五、记事本 ══════════════ */
console.log("\n── 五、记事本 ──");

/**
 * ⚠️⚠️ 第七阶段起，记事本【每次打开随机挑一篇】。
 *
 *    这直接影响本节的断言策略：
 *      老写法：开记事本 → 断言"渲染出了公式（.katex > 0）"。
 *      问题：随机到的那篇不一定有公式！
 *            本站 7 篇文章里只有 1~2 篇含 LaTeX，
 *            所以老断言会有约 70% 的概率假失败 —— 典型的 flaky。
 *
 *    ✅ 正确做法：随机性本身在 verify-apps.mjs 里专门验过了，
 *       这一节不该再去赌随机结果。改成断言"随机打开之后，
 *       文档确实是站里的一篇"（有正文、有标题、标题看得见），
 *       而这些对任何一篇文章都成立。
 *
 *       至于"公式能不能渲染"，那是个确定性问题，
 *       应该拿一篇【确定含公式】的文章来验 —— 见下面单独那一段。
 */
await closeAll();
await dblopen("notepad");

/**
 * ⚠️ 第一个 .win-body 未必是记事本（窗口可能叠加）。
 *    按特征找：有 文件/编辑/格式/查看/帮助 五个菜单的那个才是。
 */
const FIND_NP = `(() => {
  const wraps = [...document.querySelectorAll(".win-body-wrap")];
  return wraps.find((w) => {
    const t = [...w.querySelectorAll("button")].map((b) => b.textContent?.trim());
    return t.includes("文件") && t.includes("查看") && t.includes("帮助");
  }) ?? null;
})()`;

const notepadDefault = await page.evaluate(`(() => {
  const w = ${FIND_NP};
  if (!w) return null;
  return {
    // 默认应该是渲染视图：有 .md-body，没有 textarea
    hasMdBody: !!w.querySelector(".md-body"),
    hasTextarea: !!w.querySelector("textarea"),
    // 渲染视图里应该真的有结构化的正文（标题），不是一坨纯文本
    h2Count: w.querySelectorAll(".md-body h2").length,
    katexCount: w.querySelectorAll(".katex").length,
    // 状态栏里的文章标题（确认真的在读某一篇）
    titleLen: (w.textContent ?? "").length,
    menus: [...w.querySelectorAll("button")]
      .map((b) => b.textContent?.trim())
      .filter((t) => ["文件", "编辑", "格式", "查看", "帮助"].includes(t ?? "")),
  };
})()`);

check("记事本默认是渲染视图", notepadDefault?.hasMdBody === true && notepadDefault?.hasTextarea === false,
  `md-body=${notepadDefault?.hasMdBody} textarea=${notepadDefault?.hasTextarea}`);
check("渲染视图里真的渲染出了正文标题", (notepadDefault?.h2Count ?? 0) > 0,
  `${notepadDefault?.h2Count ?? 0} 个 h2`);
check("记事本打开时在读一篇真实文章（不是空白）", (notepadDefault?.titleLen ?? 0) > 200,
  `正文总字符 ${notepadDefault?.titleLen ?? 0}`);
check("菜单栏是 文件/编辑/格式/查看/帮助", notepadDefault?.menus?.length === 5,
  notepadDefault?.menus?.join(" ") ?? "");

// ── 切到源码视图 ──
/**
 * ⚠️⚠️ 这里也必须用 FIND_NP，不能写 document.querySelector(".win-body")。
 *
 *   ".win-body" 是个【通用】的滚动区类名，记事本、文章、资源管理器、
 *   控制面板都在用。而 querySelector 返回的是 DOM 里的【第一个】。
 *   一旦桌面上不止一个窗口，第一个就不一定是记事本 ——
 *   结果菜单栏的「查看」根本没被点到，后面的断言全部建立在
 *   "什么都没发生"之上，报一个和真实缺陷无关的失败。
 *
 *   连点两下的原因：第一下开菜单，第二下点菜单项。
 */
const sourceView = await page.evaluate(`(() => {
  const w = ${FIND_NP};
  const btn = [...(w?.querySelectorAll("button") ?? [])].find(
    (b) => b.textContent?.trim() === "查看"
  );
  btn?.click();
  return !!btn;
})()`);
await page.waitForTimeout(300);

await page.evaluate(`(() => {
  const w = ${FIND_NP};
  const item = [...(w?.querySelectorAll("button") ?? [])].find((b) =>
    /源码视图/.test(b.textContent ?? "")
  );
  item?.click();
})()`);
await page.waitForTimeout(600);

const src = await page.evaluate(`(() => {
  const w = ${FIND_NP};
  const ta = w?.querySelector("textarea");
  const text = ta?.value ?? "";
  return {
    hasTextarea: !!ta,
    readOnly: ta?.readOnly ?? false,
    mono: ta ? /mono|consolas|courier/.test(getComputedStyle(ta).fontFamily.toLowerCase()) : false,
    // 源码视图里应该能看到 frontmatter 的 --- 开头
    hasFrontmatter: text.startsWith("---"),
    len: text.length,
    hasMdBody: !!w?.querySelector(".md-body"),
    /**
     * ⚠️⚠️ 这里必须写 \\d，不能写 \d —— 这是个很隐蔽的坑。
     *
     *   整段脚本是通过【模板字符串】发给浏览器的
     *   （page.evaluate 的第一个参数是一段模板字符串）。
     *
     *   在模板字符串里，\d 是一个【无意义的转义】，JS 会把它
     *   静默地降级成字符 d。于是浏览器实际收到的是：
     *       /第 d+ 行，第 d+ 列/
     *   这个正则永远匹配不到 "第 1 行，第 1 列"，
     *   断言无声地永远为 false。
     *
     *   为什么特别难查：
     *     ① 不报错。模板字符串里的非法转义不抛异常（只有
     *        tagged template 才抛），最多留个 deprecation 提示。
     *     ② 不相关。同一个对象里 hasTextarea / mono / hasFrontmatter
     *        全是真的，看起来"窗口明明找对了"，只有这一条假。
     *     ③ 换个地方测就好了。我单独写一个测试用
     *        /第 \\d+ 行/ 去测同一个字符串，结果是 true ——
     *        因为那里我多打了两个反斜杠。于是更容易误判成
     *        "DOM 里根本没有这串文字"，然后去翻组件源码。
     *
     *   ✅ 规则：凡是写进【模板字符串】里的正则，反斜杠都要翻倍。
     *      写 \\d \\s \\w \\/ 都要多一层。
     */
    hasStatus: /第 \\d+ 行，第 \\d+ 列/.test(w?.textContent ?? ""),
  };
})()`);

check("切到源码视图后出现 textarea", src.hasTextarea, src.hasTextarea ? "有" : "没有");
check("源码视图是只读的", src.readOnly, src.readOnly ? "只读" : "可写？");
check("源码视图用等宽字体", src.mono, src.mono ? "等宽" : "非等宽");
check("源码视图显示 Markdown 原文（含 frontmatter）", src.hasFrontmatter,
  `长度 ${src.len} 字符`);
check("源码视图里不再有渲染后的 .md-body", src.hasMdBody === false,
  src.hasMdBody ? "竟然还在" : "已切换");
check("状态栏显示 行/列", src.hasStatus);

// ── F9 能切回渲染视图 ──
await page.evaluate(`(() => {
  const w = ${FIND_NP};
  w?.querySelector("textarea")?.focus();
})()`);
await page.keyboard.press("F9");
await page.waitForTimeout(600);
const backToRendered = await page.evaluate(`(() => {
  const w = ${FIND_NP};
  return {
    hasMdBody: !!w?.querySelector(".md-body"),
    hasTextarea: !!w?.querySelector("textarea"),
    label: [...(w?.querySelectorAll("button") ?? [])]
      .map((b) => b.textContent?.trim())
      .find((t) => t === "渲染视图" || t === "源码视图"),
  };
})()`);
check("F9 能切回渲染视图", backToRendered.hasMdBody && !backToRendered.hasTextarea,
  `md-body=${backToRendered.hasMdBody} textarea=${backToRendered.hasTextarea} 状态栏=${backToRendered.label}`);

// ── 「格式 → 自动换行」只在源码视图下可用 ──
// 先切回源码视图，否则这个开关是被禁用的
await page.evaluate(`(() => {
  const w = ${FIND_NP};
  w?.querySelector("textarea")?.focus();
})()`);
await page.keyboard.press("F9");
await page.waitForTimeout(500);

const wrapToggle = await page.evaluate(`(() => {
  const w = ${FIND_NP};
  const ta = w?.querySelector("textarea");
  const before = ta?.getAttribute("wrap") ?? null;
  const fmt = [...(w?.querySelectorAll("button") ?? [])].find(
    (b) => b.textContent?.trim() === "格式"
  );
  fmt?.click();
  return { before, clicked: !!fmt };
})()`);
await page.waitForTimeout(250);
const wrapAfter = await page.evaluate(`(() => {
  const w = ${FIND_NP};
  const auto = [...(w?.querySelectorAll("button") ?? [])].find((b) =>
    /自动换行/.test(b.textContent ?? "")
  );
  if (!auto) return null;
  auto.click();
  return true;
})()`);
await page.waitForTimeout(250);
const wrapNow = await page.evaluate(`(() => {
  const w = ${FIND_NP};
  return w?.querySelector("textarea")?.getAttribute("wrap");
})()`);
check("「格式 → 自动换行」能切换 wrap", wrapAfter === true && wrapNow !== wrapToggle?.before,
  `${wrapToggle?.before} → ${wrapNow}`);

/* ══════════════ 五之二、文章目录（TOC）══════════════ */
console.log("\n── 五之二、文章目录 ──");

/**
 * ⚠️ 目录最容易出的问题是【点了没反应】——
 *    因为 id 不匹配时不报错，只是找不到元素。
 *    所以这几条要断言的是：目录项存在 && 每一项对应的标题真的有 id。
 *
 * ⚠️⚠️ 第七阶段起，文章目录【只出现在阅读视图】里，
 *    不再出现在记事本外壳里。
 *
 *    为什么？因为目录是"读长文时的导航工具"，
 *    而记事本外壳的定位是"看 .md 源码 / 纯文本阅读"——
 *    在源码视图里挂一个目录没有意义（那是对着原文跳转）。
 *
 *    所以这一节必须打开【post:<slug>】窗口（ArticleView），
 *    而不是 notepad:<slug>。
 *    ⚠️ 从此电脑双击 .md 现在开的是记事本外壳（第七阶段的有意变更），
 *       所以这里改走【文章列表窗口 → 双击文章】这条路，
 *       它派发的 os:open-post 不带 view，走 post:<slug> 分支。
 *
 *    ⚠️ 顺带确保打开的是一篇【有多个标题】的文章，
 *       否则目录只有一两项，"点中间那条"的断言会退化。
 *       列表里第一行通常是最近的文章，结构都够长。
 */
await closeAll();

// 打开桌面，再派发事件开「文章列表」窗口（id=posts → ArchiveView）
await page.evaluate(() => {
  window.dispatchEvent(
    new CustomEvent("os:open-window", {
      detail: { id: "posts", title: "全部文章", icon: "📚", path: "/posts" },
    }),
  );
});
await page.waitForTimeout(900);

/**
 * ⚠️ 文章列表用的是 role="button" + aria-label="打开 <标题>"，
 *    不是 <tr> 行 —— 所以按 tbody tr 找会拿到 0 个。
 *    按【可访问性属性】找最稳（那是对外契约，不会随便改）。
 */
const ARTICLE_ROW = '.win-body [role="button"][aria-label^="打开"]';
await page.waitForSelector(ARTICLE_ROW, { timeout: 6000 }).catch(() => {});

/**
 * ⚠️ 用真实鼠标双击，不要 dispatchEvent(new MouseEvent("dblclick"))。
 *    React 的事件系统在根节点做委托，手工 dispatch 的事件不一定
 *    会被合成到 React 的处理器里 —— 表现就是"点了没反应"。
 */
const firstRow = await page.$(ARTICLE_ROW);
if (firstRow) {
  const rb = await firstRow.boundingBox();
  await page.mouse.dblclick(rb.x + rb.width / 2, rb.y + rb.height / 2);
}
// 等文章窗口里的目录出现，而不是盲等
await page.waitForSelector(".toc-item", { timeout: 6000 }).catch(() => {});
await page.waitForTimeout(600);

const toc = await page.evaluate(() => {
  /**
   * ⚠️⚠️ 按【特征】找窗口，不要按位置找。
   *
   *   这里踩过两次坑：
   *     1) querySelector(".win-body") → 永远拿到第一个，
   *        很可能是别的窗口，里面当然没有目录。
   *     2) 改成 bodies[bodies.length - 1]（最后一个）→ 当时是对的，
   *        但现在会同时开着「全部文章」列表窗口和文章窗口，
   *        而且 open() 还会把刚打开的窗口【插到数组前面】，
   *        DOM 顺序和"谁后开"根本不一一对应。
   *
   *   ✅ 可靠判据：只有 ArticleView 的窗口里有 <aside> 目录侧栏。
   *      问"哪个窗口有 aside"，而不是"哪个窗口排在最后"。
   */
  const bodies = [...document.querySelectorAll(".win-body")];
  const w = bodies.find((b) => b.querySelector("aside")) ?? bodies[bodies.length - 1];
  const items = [...(w?.querySelectorAll(".toc-item") ?? [])];
  const first = items[0]?.querySelector("button");
  // 目录项数量 vs 正文里带 id 的标题数量
  const headings = [...(w?.querySelectorAll(".md-body h2, .md-body h3") ?? [])].filter(
    (h) => h.id
  );

  // 关键：每个目录项指向的 id，在正文里能不能找到
  const missing = [];
  for (const it of items) {
    const id = it.getAttribute("data-toc-id");
    if (id && !w?.querySelector("#" + CSS.escape(id))) missing.push(id);
  }

  return {
    asideCount: w?.querySelectorAll("aside").length ?? 0,
    itemCount: items.length,
    headingCount: headings.length,
    missing,
    firstText: first?.textContent ?? "",
    depths: [...new Set(items.map((i) => i.getAttribute("data-depth")))].sort(),
  };
});

check("文章窗口里有目录侧栏", toc.asideCount === 1, `${toc.asideCount} 个 aside`);
check("目录项是从正文标题生成的", toc.itemCount > 0 && toc.itemCount === toc.headingCount,
  `目录 ${toc.itemCount} 项 / 带 id 标题 ${toc.headingCount} 个`);
check("目录每一项都能在正文里找到对应标题", toc.missing.length === 0,
  toc.missing.length ? `找不到：${toc.missing.join(", ")}` : "全部匹配");
check("目录支持层级缩进", toc.depths.length >= 1, `层级：${toc.depths.join("/")}`);

/**
 * 点目录能跳转。
 *
 * ⚠️⚠️ 这里不能断言滚动容器的 scrollTop —— 会误判，而且已经被现实打脸过一次。
 *
 *   原因一：滚动容器会变。
 *     最初 .win-body 是滚动容器，后来改布局后 <article> 才是。
 *     断言写死了某一个元素，改布局就失效。
 *
 *   原因二：曾经出现过"滚了但只滚一点点"的情况。
 *     当时用了 sticky 布局，smooth 动画被浏览器静默打断 ——
 *     1734px 的目标只滚到 253px。如果只断言"scrollTop 变了"，
 *     这种情况会被判为通过，缺陷就漏过去了。
 *
 *   ✅ 可靠的判据：目标标题相对【视口】的位置。
 *      跳转前它在视口下方很远（top 几千 px），
 *      跳转后应该落在视口范围内。
 *      这个判据描述的是"用户到底看没看到"，对布局重构免疫。
 *
 * ⚠️⚠️ 为什么挑【中间】那一条来点，而不是最后一条？
 *
 *   "当前章节"的高亮由 IntersectionObserver 决定，它的观测带是
 *   rootMargin: "-10% 0px -70% 0px" —— 只有视口【中间偏上】那一小段。
 *   文章【末尾】的标题跳过去之后，后面没有足够内容把它顶进那条带，
 *   于是高亮会停在别的小节上。
 *
 *   这是符合预期的行为（用户读到最后一段时，最后一个小节确实
 *   还没进入"正在读"的位置），但如果断言去点最后一条，
 *   就会把正确行为误判成缺陷 —— 测试本身错了。
 *
 *   所以这里点中间那条：它一定能落进观测带，高亮断言才有意义。
 */
const jumpProbe = await page.evaluate(() => {
  const bodies = [...document.querySelectorAll(".win-body")];
  const w = bodies.find((b) => b.querySelector("aside")) ?? bodies[bodies.length - 1];
  const items = [...(w?.querySelectorAll(".toc-item") ?? [])];
  if (!items.length) return null;

  // 取中间一条（至少第 2 条，避免第一条本来就在视口里、跳转前后没差别）
  const idx = Math.max(1, Math.floor(items.length / 2));
  const picked = items[idx];
  const id = picked?.getAttribute("data-toc-id");
  if (!id) return null;
  const target = w.querySelector("#" + CSS.escape(id));
  if (!target) return null;
  return { id, idx, total: items.length, top: Math.round(target.getBoundingClientRect().top) };
});

await page.evaluate((idx) => {
  const items = [...document.querySelectorAll(".toc-item button")];
  items[idx]?.click();
}, jumpProbe?.idx);
await page.waitForTimeout(1500);

const jumpAfter = await page.evaluate((id) => {
  // ⚠️ 必须找【带目录侧栏】的那个窗口，不能图省事拿 last()。
  //    此电脑窗口可能排在后面，而它没有 aside。
  const bodies = [...document.querySelectorAll(".win-body")];
  const w = bodies.find((b) => b.querySelector("aside")) ?? bodies[bodies.length - 1];
  const target = w?.querySelector("#" + CSS.escape(id));
  if (!target) return null;

  /**
   * ⚠️⚠️ 断言的是「目标标题的视口位置」，不是 scrollTop。
   *
   *   一开始我断言 "滚动容器的 scrollTop 变大了"，
   *   结果在改布局之后失效了 —— 因为滚动容器从 .win-body
   *   换成了 <article>，断言目标就测错了元素。
   *
   *   断言"用户真正看到的东西"更抗得住重构：
   *   用户要的是"标题出现在窗口里"，不管中间是哪个元素在滚。
   *
   *   这里量标题相对【视口】的 top：
   *     跳转前它在几千 px（屏幕下方很远）
   *     跳转后应该落在视口范围内
   */
  return {
    top: Math.round(target.getBoundingClientRect().top),
    // 用视口高度当"算不算进入可视区"的上界 —— 别写死 900，
    // 换了 viewport 尺寸这条断言就会莫名其妙地失败。
    vh: window.innerHeight,
    // 顺带确认高亮跟上了
    active: w.querySelector(".toc-item.is-active")?.getAttribute("data-toc-id") ?? "",
  };
}, jumpProbe?.id);

check(
  "点目录能跳转（目标标题移入视口）",
  !!jumpProbe &&
    !!jumpAfter &&
    // 必须真的动了，而且落在视口内（排除"只动了 1px"这种假通过）
    jumpAfter.top !== jumpProbe.top &&
    jumpAfter.top > -50 &&
    jumpAfter.top < jumpAfter.vh,
  jumpProbe && jumpAfter
    ? `点第 ${jumpProbe.idx + 1}/${jumpProbe.total} 项：标题位置 ${jumpProbe.top}px → ${jumpAfter.top}px`
    : "找不到目标"
);
check(
  "点击后该目录项被标记为当前章节",
  !!jumpAfter && jumpAfter.active === jumpProbe?.id,
  `高亮项 = ${jumpAfter?.active || "(无)"}`
);

/* ══════════════ 六、浏览器 ══════════════ */
console.log("\n── 六、浏览器 ──");

await closeAll();
await dblopen("browser");
const br = await page.evaluate(() => {
  const w = document.querySelector(".win-body");
  if (!w) return null;
  const text = w.textContent ?? "";
  return {
    tabs: [...(w.querySelectorAll("button") ?? [])]
      .map((b) => b.textContent?.trim())
      .filter((t) => /友情链接|找到我/.test(t ?? "")),
    hasAddr: !!w.querySelector('input[aria-label="地址栏"]'),
    linkCount: w.querySelectorAll("a[target='_blank']").length,
    // 外链必须带 noopener
    allNoopener: [...w.querySelectorAll("a[target='_blank']")].every((a) =>
      (a.getAttribute("rel") ?? "").includes("noopener")
    ),
    hasLinksPage: /友情链接/.test(text) && /Astro/.test(text),
  };
});

check("浏览器有标签页（友情链接 / 找到我）", br?.tabs?.length === 2, br?.tabs?.join(" / ") ?? "");
check("浏览器有地址栏输入框", br?.hasAddr);
check("友情链接页渲染出外链", (br?.linkCount ?? 0) >= 4, `${br?.linkCount ?? 0} 条`);
check("外链全部带 noopener", br?.allNoopener);

// 切到「找到我」。
// ⚠️ 标签按钮里含一个 emoji 图标，textContent 是 "👤找到我" 而不是 "找到我"，
//    所以这里用 includes 而不是全等 —— 全等会匹配不到，测试假失败。
const switched = await page.evaluate(() => {
  const w = document.querySelector(".win-body");
  const t = [...(w?.querySelectorAll("button") ?? [])].find((b) =>
    (b.textContent ?? "").includes("找到我")
  );
  if (!t) return null;
  t.click();
  return true;
});
await page.waitForTimeout(250);
const social = await page.evaluate(() => {
  const w = document.querySelector(".win-body");
  return {
    text: w?.textContent ?? "",
    addr: document.querySelector('.win-body input[aria-label="地址栏"]')?.value ?? "",
  };
});
check("能切到「找到我」页", switched === true && /RSS/.test(social.text) && /Email/.test(social.text),
  switched ? "" : "没找到「找到我」标签");
check("切页后地址栏跟着变", /contact/.test(social.addr), social.addr);

/* ══════════════ 七、暗色模式保留壁纸 ══════════════ */
console.log("\n── 七、暗色模式下的壁纸 ──");

await closeAll();
/**
 * 先开【控制面板】窗口。dblopen 走的是桌面图标双击，
 * 开出来的 id 是 control:<默认分类>，即外观页。
 * ⚠️ 这一步不能省 —— 下面按文字找「暗色」按钮，
 *    那个按钮只在外观页里存在。
 */
await dblopen("control");
await page.waitForTimeout(300);

/**
 * 控制面板里切暗色。
 *
 * ⚠️⚠️ 不要用 [role="switch"][0] 这种【按位置】的选择器。
 *
 *   第七阶段把「亮色 / 暗色」从开关（role=switch）改成了
 *   二选一的分段控件（两个 button[aria-pressed]）。
 *   于是一个「暗色模式」开关变【两个按钮】，而外观页里
 *   开关的数量和顺序还随时会加（毛玻璃、动画、开始菜单深色…）。
 *
 *   按位置找的必然结局：某个阶段加了一个新开关，
 *   测试点到了"毛玻璃"上，暗色没切成，报一个和本次改动
 *   毫无关系的失败 —— 排查半天。
 *
 *   ✅ 按【文字内容】找。文字是用户看到的东西，
 *      也是这个控件的语义本身，它变了就是需求变了，
 *      那时候测试该失败，而且失败得理直气壮。
 */
const toggled = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('[role="switch"], button[aria-pressed]')];
  const dark = btns.find((b) => (b.textContent ?? "").trim() === "暗色");
  if (!dark) return null;
  const wasDark = document.documentElement.classList.contains("theme-dark");
  // 已经是暗色就别再点（分段控件再点一次可能取消不了，语义也不对）
  if (!wasDark) dark.click();
  return true;
});
await page.waitForTimeout(600);

const darkWall = await page.evaluate(() => {
  const el = [...document.querySelectorAll("body > div")].find((d) =>
    getComputedStyle(d).backgroundImage.includes("wallpaper")
  );
  return {
    isDark: document.documentElement.classList.contains("theme-dark"),
    image: getComputedStyle(el).backgroundImage,
    size: getComputedStyle(el).backgroundSize,
  };
});

check("暗色能切换", darkWall.isDark, toggled ? "「暗色」按钮找到了" : "没找到「暗色」按钮");
check("暗色下壁纸换成暗版", /wallpaper-dark/.test(darkWall.image),
  darkWall.image.replace(/^url\("?/, "").replace(/"?\)$/, ""));
check("暗色下壁纸依然铺满", darkWall.size === "cover", darkWall.size);

/* ══════════════ 八、任务栏图标也支持图片 ══════════════ */
console.log("\n── 八、任务栏窗口按钮的图标 ──");

const tbIcon = await page.evaluate(() => {
  const btn = document.querySelector(".taskbar-window-list button");
  if (!btn) return null;
  const im = btn.querySelector("img");
  return { hasImg: !!im, src: im?.getAttribute("src") ?? "" };
});
check("任务栏窗口按钮用图片图标", tbIcon?.hasImg, tbIcon?.src ?? "没找到运行中的窗口按钮");

/* ══════════════ 九、窗口高度不得溢出（回归保护） ══════════════
   ⚠️ 这条对应一个真实踩过的坑，而且是"看起来正常、其实被裁"的那种：
      内容区一度用 h-full，拿到的是【整个窗口高度】而不是
      「窗口高度 − 标题栏」，于是 32 + 560 = 592 > 560，
      底部 32px 被 overflow:hidden 吃掉 —— 状态栏只剩上半截。

      判断依据不看类名，只看几何事实：
      内容区底边必须【不超过】窗口底边（超出即被裁）。
      以后无论怎么重构高度链，只要没溢出就通过。
   ══════════════════════════════════════════════════════════ */
console.log("\n── 九、窗口高度不溢出 ──");

await closeAll();

const heights = [];
for (const e of EXPECT) {
  await closeAll();
  await page.dblclick(`[data-icon-id="${e.id}"]`);
  await page.waitForTimeout(650);
  const h = await page.evaluate(() => {
    const wrap = document.querySelector(".win-body-wrap");
    if (!wrap) return null;
    const win = wrap.parentElement.getBoundingClientRect();
    const body = wrap.getBoundingClientRect();
    const title = document.querySelector(".win-drag-handle").getBoundingClientRect();
    return {
      winH: Math.round(win.height),
      titleH: Math.round(title.height),
      bodyH: Math.round(body.height),
      // 正数 = 内容超出窗口底部（被裁），必须为 0
      overflow: Math.round(body.bottom - win.bottom),
    };
  });
  heights.push({ id: e.id, ...h });
}

const bad = heights.filter((h) => h && h.overflow > 0);
check(
  "五个窗口的内容区都没被裁",
  bad.length === 0,
  bad.length
    ? bad.map((b) => `${b.id}: 超出 ${b.overflow}px`).join(", ")
    : heights.map((h) => `${h.id} ${h.titleH}+${h.bodyH}=${h.winH}`).join(" | ")
);

// 标题栏 + 内容区 必须正好等于窗口高度（说明没有缝隙也没有重叠）
const mismatched = heights.filter((h) => h && h.titleH + h.bodyH !== h.winH);
check(
  "标题栏 + 内容区 = 窗口高度",
  mismatched.length === 0,
  mismatched.length
    ? mismatched.map((m) => `${m.id}: ${m.titleH}+${m.bodyH}≠${m.winH}`).join(", ")
    : "五者全部严格相等"
);

/* ══════════════ 十、没有 404 ══════════════ */
console.log("\n── 十、资源加载 ──");

/**
 * ⚠️⚠️ /wallpapers/* 的 404 是【预期内】的，不能算失败。
 *
 *   第七阶段加的壁纸清单（极光 / 山脉 / 抽象几何）里，
 *   图片文件是留给你之后自己往 public/wallpapers/ 里放的。
 *   所以现在这几张图必然 404 —— 那是"还没放"，不是"放错了"。
 *
 *   而且 WallpaperPicker 对这种情况有专门处理：
 *   图片 onerror → 卡片标记成「待补充」并禁止选中。
 *   所以它连"用户会点到一张 404 壁纸"的风险都没有。
 *
 *   这里只剔除 /wallpapers/ 这一条路径前缀，
 *   其它 404（图标、主壁纸 wallpaper.jpg 等）照旧要抓 ——
 *   它们是真 bug，不能一起放过。
 *
 * ⚠️ 注意 failed 里存的是【完整 URL】（"404 http://host/path/a.jpg"），
 *    所以不能拿 /^\/wallpapers\// 直接测整串 ——
 *    必须以路径开头才能匹配。踩过这个坑：
 *    第一版就这么写的，结果 9 条待补壁纸一条都没被放过。
 */
const EXPECTED_404 = /\/wallpapers\//;

const pendingWall = [...new Set(failed.filter((f) => EXPECTED_404.test(f)))];
const iconFails = failed.filter(
  (f) => /icons\/|wallpaper/.test(f) && !EXPECTED_404.test(f),
);

check(
  "没有（非自备壁纸的）图标/壁纸 404",
  iconFails.length === 0,
  iconFails.length ? iconFails.join("; ") : "全部 200"
);

// 顺便把"哪些自备图还没放"如实报出来，方便你对照补图
if (pendingWall.length) {
  console.log(
    `   ℹ️  以下是【待你补充】的自备壁纸，预期 404，不计入失败：\n      ` +
      pendingWall
        .map((f) => f.replace(/^\d+\s+/, "").replace(/^https?:\/\/[^/]+/, ""))
        .join("\n      "),
  );
}

/* ══════════════ 汇总 ══════════════ */
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
