import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { WEEKDAY_KEYS } from "../../i18n/types";

/**
 * 实时磁贴的动态内容。
 * ================================================================
 *
 * 「实时磁贴」是 Win10 开始菜单最有辨识度的东西 —— 磁贴会自己动：
 * 日历显示今天的日期、天气显示当前温度、邮件显示未读数。
 *
 * ⚠️⚠️ 这里有一个必须处理的问题：SSR 水合不一致。
 *
 *    这些内容依赖「现在的时间」，而时间是会变的。如果直接在渲染时
 *    读 new Date()，就会出现：
 *      · 构建机（比如凌晨 3 点）渲染出 "3"
 *      · 用户浏览器（比如下午 5 点）水合出 "17"
 *      · React 发现两边不一致 → 报 hydration mismatch 警告，
 *        并且会把整块内容丢掉重画
 *
 *    解法是【两阶段渲染】：
 *      第一阶段（SSR + 首次渲染）：输出一个固定占位（"--"），
 *      第二阶段（useEffect 里，已经到浏览器了）：才读真实时间。
 *
 *    useEffect 只在客户端跑，所以永远不会在服务端执行 ——
 *    这就从根上避免了不一致。
 *
 * ⚠️ 时钟为什么用 useEffect + setInterval 而不是初始值直接读？
 *    同上。而且时钟需要每秒更新，本来就得有个定时器。
 *    这里把间隔设成 1000ms，但只在磁贴真正挂载时跑
 *    （开始菜单关掉时组件就卸载了，定时器随之清掉，不会泄漏）。
 */

/* ────────────────────────────────────────────────────────────
   日期磁贴：大号日期数字 + 星期几
   ──────────────────────────────────────────────────────────── */

/**
 * ⚠️ 这里【只存星期几的序号】，不存星期几的文字。
 *
 *    因为文字要跟着界面语言变。如果在 useEffect 里就把
 *    "星期日" 存进 state，那么用户切语言时这个 state 不会重算 ——
 *    日期磁贴会一直显示切换前的语言，直到跨过午夜才纠正。
 *    存序号、渲染时再 t()，就没有这个问题。
 */
function useToday(): { day: number; weekdayIndex: number } | null {
  const [today, setToday] = useState<{ day: number; weekdayIndex: number } | null>(null);

  useEffect(() => {
    const now = new Date();
    setToday({ day: now.getDate(), weekdayIndex: now.getDay() });

    /**
     * ⚠️ 为什么还要挂个定时器，而不只在挂载时读一次？
     *
     *    因为开始菜单可能开着过夜（挂机场景）。跨过午夜后，
     *    如果只读一次，日期磁贴会一直显示昨天。
     *
     *    这里每分钟检查一次「日期是否变了」，变了才更新 state ——
     *    比每秒 setState 省得多，而且不会造成无意义的重渲染。
     */
    let lastDay = now.getDate();
    const timer = window.setInterval(() => {
      const d = new Date().getDate();
      if (d !== lastDay) {
        lastDay = d;
        const n = new Date();
        setToday({ day: n.getDate(), weekdayIndex: n.getDay() });
      }
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  return today;
}

function DateTile() {
  const today = useToday();
  const { t } = useT();

  return (
    <div className="flex w-full flex-col items-start">
      {/* 大号日期数字 */}
      <span
        className="text-[34px] font-light leading-none tabular-nums"
        style={{ textShadow: "0 1px 3px rgba(0,0,0,.35)" }}
      >
        {today ? today.day : "--"}
      </span>
      {today && (
        <span className="mt-1 text-[11px] leading-none opacity-90">
          {t(WEEKDAY_KEYS[today.weekdayIndex])}
        </span>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   时钟磁贴：时:分（秒用小的前缀显示）
   ──────────────────────────────────────────────────────────── */

function useClock(): { hh: string; mm: string; ss: string } | null {
  const [time, setTime] = useState<{ hh: string; mm: string; ss: string } | null>(null);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      setTime({ hh: p(d.getHours()), mm: p(d.getMinutes()), ss: p(d.getSeconds()) });
    };

    tick(); // 立刻先跑一次，避免等到第 1 秒才出现时间
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return time;
}

function ClockTile() {
  const t = useClock();

  return (
    <div className="flex w-full flex-col items-start">
      <span
        className="text-[28px] font-light leading-none tabular-nums"
        style={{ textShadow: "0 1px 3px rgba(0,0,0,.35)" }}
      >
        {t ? `${t.hh}:${t.mm}` : "--:--"}
      </span>
      {t && <span className="mt-1 text-[11px] leading-none tabular-nums opacity-80">{t.ss}</span>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   天气磁贴：占位数据
   ──────────────────────────────────────────────────────────── */

/**
 * ⚠️ 这里没有接真实天气 API，显示的是示例值。
 *
 *    要接真实数据的话，位置就在这个组件里：
 *    在 useEffect 里 fetch 一个天气接口，把结果 setState 进来。
 *    （注意不要在 SSR 阶段 fetch，那样会拖慢构建，而且构建时机
 *     和用户看到页面的时机差很远，数据早就过期了。）
 *
 *    现在保留这个组件而不是删掉，是因为「天气磁贴」是 Win10 的
 *    经典样式，留着能看清磁贴布局在真实内容下的样子。
 */
function WeatherTile() {
  const { t } = useT();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="flex w-full items-end justify-between">
      <div className="flex flex-col items-start">
        <span
          className="text-[26px] font-light leading-none"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,.35)" }}
        >
          {mounted ? "21°" : "--°"}
        </span>
        <span className="mt-1 text-[10px] leading-none opacity-85">
          {mounted ? t("tile.weather.cloudy") : t("tile.weather.placeholder")}
        </span>
      </div>
      <span className="text-[22px] leading-none opacity-90">⛅</span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   对外出口：按类型分发
   ──────────────────────────────────────────────────────────── */

export function LiveTileContent({ type }: { type: "date" | "clock" | "weather" }) {
  if (type === "clock") return <ClockTile />;
  if (type === "weather") return <WeatherTile />;
  return <DateTile />;
}
