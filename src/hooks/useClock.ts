import { useEffect, useState } from "react";
import { localeFor, useT } from "../i18n";

export interface ClockTime {
  /** 24 小时制 HH:MM */
  time: string;
  /** 日期。格式跟随「语言 + 地区格式」两个设置，如 2026/10/2 或 10/2/2026 */
  date: string;
  /**
   * 星期几的序号（0 = 星期日）。
   *
   * ⚠️ 这里存的是【序号】而不是"星期五"这样的文字 ——
   *    文字要跟着界面语言变，而下面那个每秒跑的定时器拿不到 t()。
   *    一旦把文字存进 state，用户切语言时它不会重算，
   *    任务栏会一直显示切换前的语言。
   *    存序号、由调用方在渲染时用 WEEKDAY_KEYS 取文字，就没有这个问题。
   */
  weekdayIndex: number;
}

/**
 * 读一次当前时间。
 *
 * ⚠️ 日期格式不再用 `年/月/日` 拼字符串，而是交给 Intl。
 *
 *    原来的写法：`${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
 *    这等于把中文习惯的日期格式写死了 —— 英文用户也会看到 2026/10/2，
 *    而他们习惯的是 10/2/2026。
 *
 *    这里把 locale 作为参数传进来，而不是在函数内部读 store：
 *    保持它是个纯函数，好推理，也便于以后单独测试。
 */
function read(locale: string): ClockTime {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    time: `${p(d.getHours())}:${p(d.getMinutes())}`,
    date: new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).format(d),
    weekdayIndex: d.getDay(),
  };
}

/**
 * 实时时钟。
 *
 * 两个必须做对的地方：
 *  1. 初始值用 read() 而不是空字符串 —— 否则首帧显示空白，会闪一下。
 *  2. 定时器要在卸载时清掉，否则热更新时会累积出好几个定时器叠加跑。
 *
 * 刷新间隔用 1000ms 而不是 60000ms：虽然只显示到分钟，
 * 但秒级轮询能保证跨分钟的那一下几乎是瞬时跳变，
 * 不会出现"时钟比真实时间慢最多 59 秒"的观感问题。
 *
 * ⚠️ locale 变化（用户切语言、或开关「地区格式」）时要重算，
 *    所以它在 useEffect 的依赖里 —— 否则改完设置得等下一分钟才生效。
 */
export function useClock(intervalMs = 1000): ClockTime {
  const { lang, regional } = useT();
  const locale = localeFor(lang, regional);

  const [now, setNow] = useState<ClockTime>(() => read(locale));

  useEffect(() => {
    // 换 locale 后先立刻重算一次，别等下一跳
    setNow(read(locale));
    const id = window.setInterval(() => setNow(read(locale)), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, locale]);

  return now;
}
