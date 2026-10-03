/**
 * 第六阶段（桌面还原：壁纸 + 五个图标 + 三个新窗口）浏览器验收脚本。
 *
 * 跑法：node verify-desktop.mjs
 * 前置：npx astro preview --port 4401 已在跑
 *
 * 设计原则：只断言【事实】，不断言类名。
 *   比如"壁纸生效"要读 getComputedStyle 里最终的 background-image 字符串，
 *   而不是断言元素上有没有 .wallpaper 这个 class —— 类名随时会改，
 *   但"浏览器最终画出来的东西"是不会骗人的。
 */
import { chromium } from "playwright";

const BASE = "http://localhost:4401";
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
  await page.waitForTimeout(250);
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

// 点分类导航，列表应该被过滤
const beforeRows = explorer?.rows ?? 0;
const navFiltered = await page.evaluate(() => {
  const w = document.querySelector(".win-body");
  const btns = [...(w?.querySelectorAll("nav button") ?? [])];
  const cat = btns.find((b) => !/此电脑/.test(b.textContent ?? "") && b.textContent?.match(/\d+/));
  if (!cat) return null;
  cat.click();
  return true;
});
await page.waitForTimeout(300);
const afterRows = await page.evaluate(
  () => document.querySelectorAll(".win-body tbody tr").length
);
check("点分类能过滤列表", navFiltered && afterRows !== beforeRows,
  `${beforeRows} 行 → ${afterRows} 行`);

/* ══════════════ 五、记事本 ══════════════ */
console.log("\n── 五、记事本 ──");

await closeAll();
await dblopen("notepad");
const notepad = await page.evaluate(() => {
  const w = document.querySelector(".win-body");
  if (!w) return null;
  const ta = w.querySelector("textarea");
  const text = ta?.value ?? "";
  return {
    hasTextarea: !!ta,
    readOnly: ta?.readOnly ?? false,
    mono: (() => {
      if (!ta) return false;
      const f = getComputedStyle(ta).fontFamily.toLowerCase();
      return /mono|consolas|courier/.test(f);
    })(),
    menus: [...(w.querySelectorAll("button") ?? [])]
      .map((b) => b.textContent?.trim())
      .filter((t) => ["文件", "编辑", "格式", "查看", "帮助"].includes(t ?? "")),
    // 正文里应该出现 frontmatter 的痕迹（--- 分隔线）
    hasFrontmatter: text.startsWith("---"),
    len: text.length,
    hasStatus: /第 \d+ 行，第 \d+ 列/.test(w.textContent ?? ""),
  };
});

check("记事本用 textarea 显示原文", notepad?.hasTextarea && notepad?.readOnly,
  notepad?.readOnly ? "只读 textarea" : "可写？");
check("正文是等宽字体", notepad?.mono);
check("菜单栏是 文件/编辑/格式/查看/帮助", notepad?.menus?.length === 5,
  notepad?.menus?.join(" ") ?? "");
check("显示的是 Markdown 原文（含 frontmatter）", notepad?.hasFrontmatter,
  `长度 ${notepad?.len ?? 0} 字符`);
check("状态栏显示 行/列", notepad?.hasStatus);

// 点「格式」菜单 → 自动换行能真的切换
const wrapToggle = await page.evaluate(() => {
  const w = document.querySelector(".win-body");
  const fmt = [...(w?.querySelectorAll("button") ?? [])].find(
    (b) => b.textContent?.trim() === "格式"
  );
  if (!fmt) return null;
  const ta = w.querySelector("textarea");
  const before = ta.getAttribute("wrap");
  fmt.click();
  return { before, clicked: true };
});
await page.waitForTimeout(250);
const wrapAfter = await page.evaluate(() => {
  const w = document.querySelector(".win-body");
  const items = [...(w?.querySelectorAll("button") ?? [])];
  const auto = items.find((b) => /自动换行/.test(b.textContent ?? ""));
  if (!auto) return null;
  auto.click();
  return true;
});
await page.waitForTimeout(250);
const wrapNow = await page.evaluate(
  () => document.querySelector(".win-body textarea")?.getAttribute("wrap")
);
check("「格式 → 自动换行」能切换 wrap", wrapAfter === true && wrapNow !== wrapToggle?.before,
  `${wrapToggle?.before} → ${wrapNow}`);

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
// 控制面板里切暗色
await dblopen("control");
const toggled = await page.evaluate(() => {
  const sw = document.querySelector('[role="switch"][aria-label*="暗色"], [role="switch"]');
  if (!sw) return null;
  sw.click();
  return document.documentElement.classList.contains("theme-dark");
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

check("暗色能切换", darkWall.isDark, toggled ? "class 已加" : "（本来就是暗色）");
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
const iconFails = failed.filter((f) => /icons\/|wallpaper/.test(f));
check("没有图标/壁纸 404", iconFails.length === 0,
  iconFails.length ? iconFails.join("; ") : "全部 200");

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
