/**
 * 控制面板 bug 修复的针对性验证。
 *
 * 验三件事：
 *   ① 切分类时窗口【不应该】重播开窗动画（uid 不变 → AnimatePresence 不误判）
 *   ② 动画中途点关闭 → 最终必须清理干净，不留僵尸节点
 *   ③ 残留节点如果出现，拖动会弹回（这是症状的判据）
 */
import { chromium } from "playwright";

const BASE = "http://localhost:4400";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(BASE, { waitUntil: "networkidle" });
await p.waitForSelector("astro-island", { state: "attached" });
await p.waitForTimeout(600);

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "OK  " : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`);
};

const snap = () =>
  p.evaluate(`(() => {
    const wraps = [...document.querySelectorAll(".win-body-wrap")];
    return {
      wraps: wraps.length,
      taskbar: document.querySelectorAll(".taskbar-window-list button").length,
      titles: [...document.querySelectorAll(".win-drag-handle")].map(h => h.textContent?.trim()),
    };
  })()`);

/* ── 1. 切分类不重播开窗动画 ── */
await p.dblclick('[data-icon-id="control"]');
await p.waitForTimeout(900);
const opened = await snap();
check("控制面板能打开", opened.wraps === 1, JSON.stringify(opened));

// 切到「关于」，立刻测窗口透明度 —— 如果重播了入场动画，
// 动画起点 opacity 明显小于 1
await p.evaluate(() => {
  [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === "关于")?.click();
});
await p.waitForTimeout(40);
const mid = await p.evaluate(`(() => {
  const h = document.querySelector(".win-drag-handle");
  const root = h?.parentElement;
  return root ? parseFloat(getComputedStyle(root).opacity) : -1;
})()`);
check(
  "切分类不会重播开窗动画（透明度保持 1）",
  mid > 0.98,
  `切换后 40ms 的 opacity = ${mid}`,
);

await p.waitForTimeout(800);
const afterSwitch = await snap();
check("切换后仍然是同一个窗口", afterSwitch.wraps === 1 && afterSwitch.taskbar === 1, JSON.stringify(afterSwitch));

/* ── 2. 动画中途关窗，最终必须清理干净 ── */
// 先切一次分类，再在动画中途点关闭
await p.evaluate(() => {
  [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === "语言")?.click();
});
await p.waitForTimeout(60);
await p.evaluate(() => document.querySelector('button[aria-label="关闭"]')?.click());
await p.waitForTimeout(120);
const midClose = await snap();
await p.waitForTimeout(1200);
const settled = await snap();

check(
  "动画中途关窗后，窗口最终被清理",
  settled.wraps === 0 && settled.taskbar === 0,
  `关闭后 120ms = ${JSON.stringify(midClose)} → 等 1.2s 后 = ${JSON.stringify(settled)}`,
);

/* ── 3. 没有残留节点可以拖动 ── */
const canDrag = await p.evaluate(`(() => !!document.querySelector(".win-drag-handle"))()`);
check("桌面上没有残留的僵尸窗口节点", canDrag === false, canDrag ? "还有 .win-drag-handle" : "干净");

/* ── 4. 反复快速切换 + 关闭，压力测试 ── */
let bad = 0;
for (let i = 0; i < 6; i++) {
  await p.dblclick('[data-icon-id="control"]');
  await p.waitForTimeout(500);
  for (const s of ["语言", "更新日志", "关于", "外观"]) {
    await p.evaluate((n) => {
      [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === n)?.click();
    }, s);
    await p.waitForTimeout(70);
  }
  await p.evaluate(() => document.querySelector('button[aria-label="关闭"]')?.click());
  await p.waitForTimeout(1000);
  const s = await snap();
  if (s.wraps !== 0 || s.taskbar !== 0) {
    bad++;
    console.log(`   第 ${i + 1} 轮残留：${JSON.stringify(s)}`);
  }
}
check("连续 6 轮快速切换+关闭，无残留", bad === 0, bad ? `${bad} 轮残留` : "6/6 干净");

await b.close();

const pass = results.filter((r) => r.pass).length;
console.log(`\n通过 ${pass}/${results.length}`);
if (pass < results.length) process.exit(1);
