import { useEffect } from "react";
import { useI18nStore, dictOf, hydrateI18n } from "./store";
import type { Dict } from "./types";

/**
 * i18n 的统一出口
 * ================================================================
 *
 * 组件里只需要认识两个东西：
 *   useT()   → 拿一个 t 函数（会订阅语言变化，语言一变组件自动重渲染）
 *   t()      → 非组件场景的即时翻译（不订阅，读的是当前值）
 *
 * ⚠️ 关于占位符：
 *   t("ex.itemCount", { n: 3 })  →  "3 个项目"
 *   词典里写的是 "{n} 个项目"。
 *   替换用的是简单的花括号替换，不是模板引擎 ——
 *   够用，而且不会有"用户数据被当代码执行"的风险。
 */

/** 占位符的值：数字或字符串 */
type Vars = Record<string, string | number>;

/**
 * 把 {key} 替换成对应的值。
 *
 * ⚠️ 用 replace 的回调形式而不是拼接 ——
 *    `str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""))`
 *    这样写的好处是【一次扫描】搞定所有占位符，
 *    而且不会因为值里含有 "$" 之类的字符被当成替换模式（$& 那种坑）。
 *
 * ⚠️ 找不到的占位符替换成空串，而不是保留 "{n}"。
 *    保留的话界面上会出现刺眼的 "{n}" —— 用户会当它是个 bug。
 *    换成空串至少读起来是一句完整（虽然信息缺失）的话。
 *    不过正常情况下不该发生：词典和调用点是配套改的。
 */
function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] === undefined ? "" : String(vars[key]),
  );
}

/**
 * 即时翻译（不订阅语言）。
 *
 * ⚠️⚠️ 不要在【模块顶层】调用它。
 *
 *    反面例子：
 *        const TITLE = t("app.thisPC");   // ❌ 模块加载时就执行了
 *
 *    这行会在模块第一次被 import 时跑一次，把当时的中文固化进常量。
 *    之后用户切到英文，这个常量还是中文 —— 而且你再也不会重算它。
 *
 *    正确做法：
 *      · 组件里       → 用 useT()，在渲染函数体内调用
 *      · 事件/effect  → 直接调 t()，那时的值是对的
 *      · 需要常量表   → 存 key（"app.thisPC"），用的时候再 t()
 */
export function t(key: keyof Dict, vars?: Vars): string {
  const lang = useI18nStore.getState().lang;
  return interpolate(dictOf(lang)[key], vars);
}

/**
 * 组件里用的翻译 hook。
 *
 * ⚠️ 它订阅的是 lang【这一个字段】。
 *    zustand 的选择器（第二个参数）决定了"只有这个值变了才重渲染"。
 *    如果写成 useI18nStore() 订阅整个 store，
 *    那么 regional 变化也会让所有用了 t 的组件重渲染一遍 ——
 *    没必要，而且用户量大的页面会有感知。
 *
 * 返回值：
 *   { t, lang, regional }
 *     t          翻译函数（已绑定当前语言）
 *     lang       当前语言（需要自己判断语言时用，比如隐藏某些块）
 *     regional   地区格式开关（格式化日期数字时要用）
 *
 * ⚠️ 这里同时把 hydrateI18n 的副作用挂上了。
 *    任何一个用了 useT 的组件挂载时，都会把 localStorage 里的
 *    真实语言同步进 store。多个组件同时挂载也只会跑几次 setState，
 *    值相同，zustand 会自动跳过 —— 没有性能问题。
 *
 *    为什么放在 hook 里而不是某个"入口组件"里：
 *      因为桌面有两个岛屿（WindowManager 和 Taskbar），
 *      没有共同的父组件可以挂这个初始化逻辑。
 *      谁先挂载谁负责初始化，是最省心的做法。
 */
export function useT() {
  const lang = useI18nStore((s) => s.lang);
  const regional = useI18nStore((s) => s.regional);

  useEffect(() => {
    hydrateI18n();
  }, []);

  return {
    lang,
    regional,
    t: (key: keyof Dict, vars?: Vars) => interpolate(dictOf(lang)[key], vars),
  };
}

/* ════════════════════════════════════════════════════════════════
   格式化 —— 日期 / 数字
   ════════════════════════════════════════════════════════════════

   ⚠️ 这一块统一走 Intl 而不是手写字符串拼接。

      反面例子（原代码里的写法）：
          `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`

      这种写法把中文/英文格式【写死】了 —— 英文用户也会看到
      2024/5/1 这种非英语习惯的格式。

      Intl.DateTimeFormat 是浏览器内置的国际标准：给它一个语言标签，
      它会自动知道英文用 "May 1, 2024"、中文用 "2024年5月1日"。
      不用自己维护任何格式表。
   ════════════════════════════════════════════════════════════════ */

/**
 * 把语言 + 地区开关换算成一个 Intl 用的 locale 标签。
 *
 * ⚠️⚠️ 这是"地区格式"这个可选功能唯一的落点。
 *
 *    规则很简单：
 *      regional = true   → 用当前语言对应的 locale（en → "en-US"）
 *      regional = false  → 永远用 "zh-CN"
 *
 *    所以切到英文但地区格式关掉时，日期仍然是中文格式 ——
 *    这正是需求要的"语言和地区分开管"。
 */
export function localeFor(lang: string, regional: boolean): string {
  if (!regional) return "zh-CN";
  return lang === "en" ? "en-US" : "zh-CN";
}

/**
 * 格式化日期。
 *
 * @param iso       ISO 日期字符串（frontmatter 里的 pubDate）
 * @param lang      当前语言
 * @param regional  地区格式开关
 * @param short     短格式（归档列表用，省掉年份）
 */
export function fmtDate(
  iso: string,
  lang: string,
  regional: boolean,
  short = false,
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const locale = localeFor(lang, regional);

  /**
   * 两种格式：
   *   长格式（默认）→ { year, month: "long", day }
   *                   中文「2026年10月2日」，英文「October 2, 2026」
   *   短格式（归档列表用）→ { month: "short", day }
   *                   中文「10月2日」，英文「Oct 2」
   *
   * ⚠️ 长格式里 month 用 "long" 而不是 "numeric"：
   *    中文下 "numeric" 会得到「2026/10/2」这种斜杠写法，
   *    不像中文站该有的日期。用 "long" 才是「2026年10月2日」。
   *
   * ⚠️ 短格式也交给 Intl 而不是自己 slice 字符串 ——
   *    以前归档列表是 formatDate(iso).slice(5) 从 "2026-10-02" 里
   *    截出 "10-02"，那是【先产出 ISO 再砍】，语言一变就错了。
   */
  const opts: Intl.DateTimeFormatOptions = short
    ? { month: "short", day: "numeric" }
    : { year: "numeric", month: "long", day: "numeric" };

  return new Intl.DateTimeFormat(locale, opts).format(d);
}

/**
 * 粗粒度的相对时间（"3 天前"）。
 *
 * ⚠️ 不用 Intl.RelativeTimeFormat 的原因：
 *    它能生成"3天前"，但粒度控制（多久算"刚刚"、何时切到"月"）
 *    仍然要自己写。既然逻辑躲不掉，就统一在这里成句，
 *    至少保证中英两种语言的措辞都从词典来，风格一致。
 */
export function fmtRelative(
  iso: string,
  translate: (key: keyof Dict, vars?: Vars) => string,
): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return translate("time.justNow");
  if (mins < 60) return translate("time.minutesAgo", { n: mins });

  const hours = Math.floor(mins / 60);
  if (hours < 24) return translate("time.hoursAgo", { n: hours });

  const days = Math.floor(hours / 24);
  return translate("time.daysAgo", { n: days });
}

/**
 * 千分位数字。
 *
 * ⚠️ 同样跟地区走：英文是 1,234，某些地区是 1.234 或 1 234。
 *    自己拼逗号的话，多语言一上就错了。
 */
export function fmtNumber(n: number, lang: string, regional: boolean): string {
  return new Intl.NumberFormat(localeFor(lang, regional)).format(n);
}
