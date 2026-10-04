/**
 * 一键验收：把五个浏览器验收脚本全部跑一遍，输出汇总。
 *
 * 跑法：npm run verify
 *
 * ⚠️ 前置条件（这个脚本替你管了，但你还是要知道它干了什么）：
 *    1. 必须先 `npm run build`，因为验收跑的是【构建产物】而不是源码。
 *       源码改完不 build，验收就是在验旧代码 —— 会得到"改了没用"的假象。
 *    2. 需要一个 preview 服务在 4400 端口。
 *
 * ── 为什么要单独写这个脚本，而不是在 package.json 里用 && 串起来 ──
 *    因为 Astro 的 preview 命令【同一目录只允许存在一个实例】。
 *    所以必须先手动起服务、跑完、再停掉 —— 这三步没法用 && 表达。
 *    之前 verify-desktop.mjs 单独用 4401 端口，就是想在"服务已经占着 4400"
 *    的情况下再起一个；结果 Astro 直接拒绝启动（连 --force 也只是
 *    把 4400 那个替换掉，并不会监听 4401），于是脚本连不上服务，
 *    报 ERR_CONNECTION_REFUSED —— 看起来像代码坏了，其实只是服务没起来。
 *    现在统一成一个端口，由本脚本负责起停。
 */
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 4400;
const BASE = `http://localhost:${PORT}`;

/**
 * 五个套件：文件名 + 人话名字。
 *
 * ⚠️ 顺序有讲究：从"最基础、坏了后面全崩"排到"最上层、依赖前面都对"。
 *    某个套件失败时，先修它上面的 —— 不然会在下游套件里
 *    看到一堆由同一个根因引起的失败，误以为到处都坏了。
 */
const SUITES = [
  { file: "verify.mjs", name: "基础桌面 / 窗口 / 路由" },
  { file: "verify-theme.mjs", name: "毛玻璃 / 动画 / 暗色模式" },
  { file: "verify-tiles.mjs", name: "开始菜单 / 磁贴" },
  { file: "verify-desktop.mjs", name: "壁纸 / 图标 / 三个新窗口" },
  { file: "verify-apps.mjs", name: "记事本 / 控制面板（第七阶段）" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 轮询等 HTTP 通，最多等 timeout 毫秒。
 *
 * ⚠️ 这里有个非常隐蔽的坑，写下来免得以后又踩：
 *    Astro 的 preview 服务【只监听 IPv6 的 [::1]】（看 `ss -tlnp` 的
 *    输出就能确认：LISTEN [::1]:4400，没有 0.0.0.0/127.0.0.1 那一条）。
 *    而 Node 的 fetch 解析 "localhost" 时会优先拿到 IPv4 的 127.0.0.1。
 *    两边一凑：fetch('http://localhost:4400') → 连 127.0.0.1 → 没人监听
 *    → 直接 "fetch failed"。
 *
 *    对比一下就好懂了：
 *      curl http://localhost:4400   → 200   （curl 会回退试 ::1）
 *      fetch('http://localhost:4400') → 失败（Node 不回退）
 *    所以这里【不能】拿 localhost 去探活，得直接试 [::1]。
 *    浏览器（包括 Playwright 里的 Chromium）自带双栈回退，所以
 *    验收脚本里写 localhost 是没问题的 —— 只有 Node 的 fetch 有这毛病。
 */
async function waitUp(timeout = 25000) {
  // ::1 是 IPv6 回环；万一以后换了环境只监听 IPv4，127.0.0.1 这条能兜住
  const probes = [`http://[::1]:${PORT}`, `http://127.0.0.1:${PORT}`];
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    for (const url of probes) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
        if (r.ok) return url;
      } catch {
        /* 还没起来，继续等 */
      }
    }
    await sleep(400);
  }
  return null;
}

/* ── 0. 先确认 dist 存在 ── */
const hasDist = spawnSync("node", ["-e", "process.exit(require('fs').existsSync('dist')?0:1)"], {
  cwd: here,
}).status === 0;

if (!hasDist) {
  console.error("❌ 没有找到 dist 目录。先跑一次 `npm run build`。");
  process.exit(1);
}

/* ── 1. 起 preview 服务 ── */
console.log(`▶ 启动预览服务 ${BASE} …`);
const server = spawn("npx", ["astro", "preview", "--port", String(PORT)], {
  cwd: here,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", () => {});
server.stderr.on("data", (d) => {
  const s = d.toString();
  // "already running" 这一条会误导人，直接改成人话
  if (s.includes("Another astro preview server")) {
    console.error(
      `\n⚠️ 已经有 preview 服务在跑了（多半是你自己开的）。\n` +
        `   请先 Ctrl+C 关掉它，或者跑 \`npx astro preview stop\`，再执行 npm run verify。\n`
    );
  }
});

const up = await waitUp();
if (!up) {
  server.kill("SIGTERM");
  console.error(`❌ 服务起不来（${BASE} 连不上）。请确认 ${PORT} 端口没被占用。`);
  process.exit(1);
}
console.log(`   服务已就绪（探活地址 ${up}）\n`);

/* ── 2. 逐个跑套件 ── */
const summary = [];
let failed = 0;

for (const s of SUITES) {
  const label = `${s.file}  （${s.name}）`;
  console.log("═".repeat(60));
  console.log(`▶ ${label}`);
  console.log("═".repeat(60));

  const r = spawnSync("node", [join(here, s.file)], { cwd: here, stdio: "inherit" });
  const ok = r.status === 0;
  if (!ok) failed++;
  summary.push({ ...s, ok });
  console.log("");
}

/* ── 3. 收尾 ── */
server.kill("SIGTERM");
await sleep(300);
server.kill("SIGKILL");

console.log("═".repeat(60));
console.log("  验收汇总");
console.log("═".repeat(60));
for (const s of summary) {
  console.log(`  ${s.ok ? "✅" : "❌"}  ${s.file.padEnd(20)} ${s.name}`);
}
console.log("═".repeat(60));
console.log(failed === 0 ? "  全部通过 ✅" : `  ${failed} 个套件失败 ❌`);
console.log("═".repeat(60));

process.exit(failed === 0 ? 0 : 1);
