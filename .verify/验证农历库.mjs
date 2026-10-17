/**
 * 农历库验证脚本 —— lunar-typescript
 *
 * 用法：
 *   1. 在项目根目录执行  npm install lunar-typescript
 *   2. 把本文件放到项目根目录，执行  node 验证农历库.mjs
 *   3. 看到「全部通过」就说明这个库能用，可以开始做日历面板了
 *
 * 这个脚本验 6 件事：
 *   ① 农历日期换算对不对
 *   ② 二十四节气准不准（2026 全年逐一核对）
 *   ③ 传统节日能不能拿到
 *   ④ 42 格月历能否正确跨月 —— 这里有本库最大的一个坑
 *   ⑤ 性能够不够（日历每次重算 42 天）
 *   ⑥ 能不能懒加载（库有 105 KB，不该进首屏）
 */

import { Solar } from "lunar-typescript";

/* ─────────────────────────── 小工具 ─────────────────────────── */

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const ok = String(actual) === String(expected);
  if (ok) {
    pass++;
    console.log(`  ✅ ${label}：${actual}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}：得到「${actual}」，期望「${expected}」`);
  }
}

function checkTrue(label, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✅ ${label}${detail ? "：" + detail : ""}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}${detail ? "：" + detail : ""}`);
  }
}

const title = (s) => console.log(`\n${"─".repeat(52)}\n${s}\n${"─".repeat(52)}`);

/* ───────────────────── ① 农历日期换算 ───────────────────── */

title("① 农历日期换算");

{
  // 2026-10-16 → 农历九月初七（丙午马年）
  const solar = Solar.fromYmd(2026, 10, 16);
  const lunar = solar.getLunar();

  check("公历", solar.toYmd(), "2026-10-16");
  check("农历（完整）", lunar.toString(), "二〇二六年九月初七");
  check("农历日（中文）", lunar.getDayInChinese(), "初七");
  check("农历日（数字）", lunar.getDay(), 7);
  check("农历月（中文）", lunar.getMonthInChinese(), "九");
  check("农历月（数字）", lunar.getMonth(), 9);
  check("生肖", lunar.getYearShengXiao(), "马");

  // 春节
  const spring = Solar.fromYmd(2026, 2, 17).getLunar();
  check("2026 春节", spring.getMonthInChinese() + "月" + spring.getDayInChinese(), "正月初一");
  checkTrue("春节被识别为节日", spring.getFestivals().includes("春节"), spring.getFestivals().join(","));

  // 闰月：2025 年闰六月，getMonth() 返回负数
  const leap = Solar.fromYmd(2025, 7, 25).getLunar();
  check("2025-07-25 是闰月", leap.getMonth(), -6);
  checkTrue("闰月在中文串里带「闰」字", leap.toString().includes("闰"), leap.toString());
}

/* ─────────────────────── ② 二十四节气 ─────────────────────── */

title("② 二十四节气（2026 全年核对）");

{
  // 网上可查的 2026 年节气日期（用于比对）
  const EXPECTED = {
    小寒: "2026-01-05", 大寒: "2026-01-20",
    立春: "2026-02-04", 雨水: "2026-02-18",
    惊蛰: "2026-03-05", 春分: "2026-03-20",
    清明: "2026-04-05", 谷雨: "2026-04-20",
    立夏: "2026-05-05", 小满: "2026-05-21",
    芒种: "2026-06-05", 夏至: "2026-06-21",
    小暑: "2026-07-07", 大暑: "2026-07-23",
    立秋: "2026-08-07", 处暑: "2026-08-23",
    白露: "2026-09-07", 秋分: "2026-09-23",
    寒露: "2026-10-08", 霜降: "2026-10-23",
    立冬: "2026-11-07", 小雪: "2026-11-22",
    大雪: "2026-12-07", 冬至: "2026-12-22",
  };

  // ⚠️ 逐日扫描是唯一可靠的办法。
  //    不要用 lunar.getJieQiTable() 按名字取 —— 它的键名混了中文和拼音，
  //    同一个「冬至」可能出现两次（"冬至" 指 2025 年那个、"DONG_ZHI" 指 2026 年那个），
  //    按名字取会拿到上一年，静悄悄地错。
  const found = {};
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= 31; d++) {
      let jq = "";
      try {
        jq = Solar.fromYmd(2026, m, d).getLunar().getJieQi();
      } catch {
        continue; // 无效日期（如 2-30）直接跳过
      }
      if (jq) found[jq] = `2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  let allOk = true;
  for (const [name, date] of Object.entries(EXPECTED)) {
    if (found[name] !== date) {
      allOk = false;
      console.log(`  ❌ ${name}：得到 ${found[name] ?? "（未找到）"}，期望 ${date}`);
      fail++;
    }
  }
  if (allOk) {
    pass++;
    console.log(`  ✅ 24 个节气全部与公开日历一致`);
  }
  check("扫描到的节气总数", Object.keys(found).length, 24);
}

/* ───────────────────────── ③ 传统节日 ───────────────────────── */

title("③ 传统节日与公历节日");

{
  const C = [
    [2026, 1, 1, "元旦节", "solar"],
    [2026, 2, 17, "春节", "lunar"],
    [2026, 6, 19, "端午节", "lunar"],
    [2026, 9, 25, "中秋节", "lunar"],
    [2026, 10, 1, "国庆节", "solar"],
  ];
  for (const [y, m, d, name, kind] of C) {
    const s = Solar.fromYmd(y, m, d);
    const list = kind === "solar" ? s.getFestivals() : s.getLunar().getFestivals();
    checkTrue(
      `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")} 是「${name}」`,
      list.includes(name),
      `实际 [${list.join(", ")}]`
    );
  }

  // 普通日子不该有节日，否则日历会满屏标记
  const plain = Solar.fromYmd(2026, 10, 16);
  checkTrue(
    "2026-10-16 无节日（避免误标）",
    plain.getFestivals().length === 0 && plain.getLunar().getFestivals().length === 0
  );
}

/* ───────────── ④ 42 格月历：跨月是最大的坑 ───────────── */

title("④ 42 格月历与跨月处理");

{
  // ⚠️⚠️ 本库最重要的一个坑：
  //   Solar.fromYmd(2026, 10, 0) 或 (2026, 10, -3) 会直接【抛异常】，
  //   它不会自动帮你跨到 9 月。
  //   而日历的 42 格里必然有上月末和下月初的补位日期，
  //   所以必须先把日期交给 JS 的 Date 归一化，再用 Solar.fromDate()。
  console.log("  先验证这个坑：");

  let threw = false;
  try {
    Solar.fromYmd(2026, 10, -3);
  } catch {
    threw = true;
  }
  checkTrue("Solar.fromYmd 遇到月外日期会抛异常（所以不能直接用）", threw);

  const normalized = Solar.fromDate(new Date(2026, 9, -3)); // 9 是十月（月份从 0 数）
  check("交给 Date 归一化后 →", normalized.toYmd(), "2026-09-27");

  const nextMonth = Solar.fromDate(new Date(2026, 9, 40));
  check("月末越界也能正确跨月 →", nextMonth.toYmd(), "2026-11-09");

  // 完整生成一个月的 42 格
  const buildMonth = (year, month) => {
    const firstWeekday = new Date(year, month - 1, 1).getDay();
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(year, month - 1, i - firstWeekday + 1);
      const s = Solar.fromDate(date);
      const l = s.getLunar();
      cells.push({
        day: date.getDate(),
        inMonth: date.getMonth() === month - 1,
        lunarDay: l.getDay(),
        lunarDayCn: l.getDayInChinese(),
        lunarMonth: l.getMonth(),
        isLunarFirst: l.getDay() === 1,
        jieQi: l.getJieQi() || null,
        festivals: [...s.getFestivals(), ...l.getFestivals()],
      });
    }
    return cells;
  };

  const cells = buildMonth(2026, 10);
  check("42 格数量", cells.length, 42);
  check("非本月格子数（补位）", cells.filter((c) => !c.inMonth).length, 11);
  checkTrue("10 月含寒露", cells.some((c) => c.jieQi === "寒露"));
  checkTrue("10 月含霜降", cells.some((c) => c.jieQi === "霜降"));
  checkTrue(
    "跨月补位也带出了 11 月的节气（立冬）",
    cells.some((c) => !c.inMonth && c.jieQi === "立冬")
  );
  checkTrue(
    "跨月补位带出了农历九月初一（10-10）",
    cells.some((c) => c.day === 10 && c.isLunarFirst)
  );

  // 打印出来看看
  console.log("\n  2026 年 10 月，[ ] 表示非本月：");
  cells.forEach((c, i) => {
    if (i % 7 === 0) process.stdout.write("\n    ");
    const mark = [c.jieQi, ...c.festivals].filter(Boolean).join("/");
    const lab = `${c.isLunarFirst ? c.lunarMonth + "月" : ""}${c.lunarDayCn}`;
    process.stdout.write(
      `${c.inMonth ? c.day : "[" + c.day + "]"}(${lab})${mark ? "★" + mark : ""}  `
    );
  });
  console.log();
}

/* ─────────────────────────── ⑤ 性能 ─────────────────────────── */

title("⑤ 性能（日历每次重算 42 天，必须够快）");

{
  const buildMonth = (year, month) => {
    const firstWeekday = new Date(year, month - 1, 1).getDay();
    for (let i = 0; i < 42; i++) {
      const s = Solar.fromDate(new Date(year, month - 1, i - firstWeekday + 1));
      const l = s.getLunar();
      l.getDayInChinese();
      l.getJieQi();
      s.getFestivals();
      l.getFestivals();
    }
  };

  const t0 = performance.now();
  for (let i = 0; i < 200; i++) buildMonth(2026, 10);
  const per = (performance.now() - t0) / 200;

  console.log(`  单次生成 42 格：${per.toFixed(2)} ms`);
  checkTrue("单次低于 5ms（翻月不会卡）", per < 5, `${per.toFixed(2)} ms`);
}

/* ───────────────────── ⑥ 懒加载可行性 ───────────────────── */

title("⑥ 懒加载可行性");

{
  // 库未压缩 415 KB / gzip 105 KB —— 不该进首屏，
  // 应该在用户第一次点开日历时才加载。
  const t0 = performance.now();
  const mod = await import("lunar-typescript");
  const cost = performance.now() - t0;

  checkTrue("支持动态 import", typeof mod.Solar === "function", `耗时 ${cost.toFixed(0)}ms`);
  console.log("  → 可用 React.lazy 包起来，105 KB 不进首屏");
}

/* ─────────────────────────── 汇总 ─────────────────────────── */

console.log(`\n${"═".repeat(52)}`);
console.log(`  通过 ${pass} 项，失败 ${fail} 项`);
console.log(fail === 0 ? "  ✅ 全部通过，这个库可以放心用" : "  ❌ 有失败项，先别往下做");
console.log("═".repeat(52) + "\n");

process.exit(fail === 0 ? 0 : 1);
