import { useState } from "react";
import {
  visibleSocials,
  socialIconSrc,
  isExternal,
  type SocialLink,
} from "../../../../config/site";
import { useT } from "../../../../i18n";

/**
 * 浏览器 → 「找到我」标签页
 * ================================================================
 *
 * 社交链接卡片。数据来自 src/config/site.ts 的 SOCIALS。
 *
 * ⚠️ 这里用的是和静态「关于」页、窗口版「关于」视图【完全相同】的
 *    .social-card / .social-icon / .social-name 三个 CSS 类。
 *
 *    为什么复用同一套类而不是给浏览器单写一套：
 *      社交链接要在【三个地方】渲染，而它们分属两套模板系统
 *      （静态页是 Astro 构建期，这个窗口是 React 运行时），
 *      没法共用一个组件文件。
 *      所以约定：样式真相放 global.css，三处都引同一组类名 ——
 *      加一个平台时不用改三遍样式，三处也不会长得不一样。
 */

/**
 * 一张图标。
 *
 * 有图就渲染 <img>，没有（或加载失败）就退回首字母。
 *
 * ⚠️ 和友链那边一样，必须处理 onError ——
 *    本地文件写错名字、远程图挂了，<img> 都是静默失败。
 */
function SocialIcon({ s }: { s: SocialLink }) {
  const src = socialIconSrc(s);
  const [broken, setBroken] = useState(false);

  if (!src || broken) {
    return (
      <span className="social-icon social-icon-fallback" aria-hidden="true">
        {s.name.slice(0, 1)}
      </span>
    );
  }

  return (
    <span className="social-icon">
      <img
        src={src}
        alt=""
        width={24}
        height={24}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
      />
    </span>
  );
}

export default function BrowserSocial() {
  const { t } = useT();
  const socials = visibleSocials();

  if (socials.length === 0) {
    return (
      <div className="grid h-full place-items-center text-[12px] text-[var(--fg-faint)]">
        {t("bv.noSocials")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="social-grid grid grid-cols-1 gap-2 sm:grid-cols-2">
        {socials.map((s) => {
          /*
            ⚠️ 只有站外地址才新开标签页。

               /rss.xml、/sitemap.xml 这种站内路径，新开一个标签
               会把用户从桌面上拽走，回来还得重新找窗口。
               mailto: 同理 —— 它是唤起邮件客户端，不是一次导航。
          */
          const ext = isExternal(s.href);

          return (
            <li key={s.name}>
              <a
                href={s.href}
                target={ext ? "_blank" : undefined}
                rel={ext ? "noopener noreferrer" : undefined}
                className="social-card no-drag"
                title={`${s.name}${s.note ? " · " + s.note : ""}`}
              >
                <SocialIcon s={s} />
                <span className="social-name">{s.name}</span>
                {s.note && <span className="social-note">{s.note} ↗</span>}
              </a>
            </li>
          );
        })}
      </ul>

      <p className="link-hint">{t("bv.socialHint")}</p>
    </div>
  );
}
