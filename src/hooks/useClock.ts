import { useEffect, useState } from "react";

export interface ClockTime {
  /** 24 小时制 HH:MM */
  time: string;
  /** 2026/10/2 这样的日期 */
  date: string;
  /** 星期五 */
  weekday: string;
}

const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

function read(): ClockTime {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    time: `${p(d.getHours())}:${p(d.getMinutes())}`,
    date: `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`,
    weekday: WEEKDAYS[d.getDay()],
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
 */
export function useClock(intervalMs = 1000): ClockTime {
  const [now, setNow] = useState<ClockTime>(read);

  useEffect(() => {
    const id = window.setInterval(() => setNow(read()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
