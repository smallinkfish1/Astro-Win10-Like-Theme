import { useState } from "react";
import {
  PROFILE,
  resolveAvatar,
  visibleSocials,
  socialIconSrc,
  isExternal,
  type SocialLink,
} from "../../../config/site";
import { useT } from "../../../i18n";

export interface AboutStats {
  postCount: number;
  categoryCount: number;
  tagCount: number;
  wordCount: number;
  latest: string | null;
}

/**
 * 关于页（对应桌面上的"网络"图标）。
 *
 * "网络"映射到"关于"是个不那么直观的对应 —— 原始需求里就是这么定的。
 * 从语义上讲它是"通向外部世界的窗口"（GitHub、RSS、邮箱都在这一块），
 * 所以我把它做成一个"站点信息 + 联系方式"的着陆页。
 *
 * ⚠️ 头像、昵称、简介、社交链接全部来自 src/config/site.ts，
 *    这个文件里【没有】任何硬编码的个人信息。
 *    想改内容请改 site.ts，别改这里 —— 静态「关于」页
 *    （src/pages/about.astro）读的是同一份数据，改一处两处都变。
 */
export default function AboutView({ stats }: { stats: AboutStats }) {
  const { t } = useT();
  const words = stats.wordCount.toLocaleString("en-US");
  const links = visibleSocials();
  const avatarSrc = resolveAvatar();

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto pr-1">
      {/* ── 头像 + 简介 ── */}
      <section className="flex items-start gap-4">
        <Avatar src={avatarSrc} emoji={PROFILE.emoji ?? "👤"} className="h-14 w-14 text-[24px]" />
        <div className="min-w-0">
          <h3 className="mb-1 text-[15px] font-semibold text-[var(--fg)]">{PROFILE.name}</h3>
          {PROFILE.bio.map((line, i) => (
            <p
              key={i}
              className={`text-[12.5px] leading-relaxed text-[var(--fg-dim)] ${
                i === 0 ? "" : "mt-1.5"
              }`}
            >
              {line}
            </p>
          ))}
        </div>
      </section>

      {/* ── 站点统计 ── */}
      <section>
        <h4 className="mb-2 text-[12px] font-semibold text-[#16202c]">{t("about.stats")}</h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { k: "stats.posts" as const, v: stats.postCount, u: "unit.post" as const },
            { k: "stats.categories" as const, v: stats.categoryCount, u: "unit.category" as const },
            { k: "stats.tags" as const, v: stats.tagCount, u: "unit.tag" as const },
            { k: "stats.words" as const, v: words, u: "unit.words" as const },
          ].map((s) => (
            <div
              key={s.k}
              className="rounded border border-[#e8ebef] bg-[#fafbfc] px-3 py-2 text-center"
            >
              <div className="text-[17px] font-semibold tabular-nums text-[#2b579a]">
                {s.v}
              </div>
              <div className="text-[10.5px] text-[#8a94a3]">
                {t(s.u)} {t(s.k)}
              </div>
            </div>
          ))}
        </div>
        {stats.latest && (
          <p className="mt-2 text-[11.5px] text-[#8a94a3]">
            {t("about.recentlyUpdated", { date: stats.latest.slice(0, 10) })}
          </p>
        )}
      </section>

      {/* ── 外链 ── */}
      <section>
        <h4 className="mb-2 text-[12px] font-semibold text-[var(--fg)]">{t("about.findMe")}</h4>
        <div className="social-grid grid grid-cols-2 gap-2">
          {links.map((l) => (
            <SocialCard key={l.name} s={l} />
          ))}
        </div>
      </section>

      {/* ── 技术栈 ── */}
      <section className="border-t border-[var(--surface-border)] pt-4">
        <h4 className="mb-2 text-[12px] font-semibold text-[var(--fg)]">{t("about.stack")}</h4>
        <div className="flex flex-wrap gap-1.5">
          {["Astro", "React", "TypeScript", "Tailwind CSS", "Zustand", "react-rnd", "marked"].map(
            (name) => (
              <span key={name} className="md-chip">
                {name}
              </span>
            )
          )}
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--fg-faint)]">
          {t("about.stackNote")}
        </p>
      </section>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   下面是本视图专用的两个小组件
   ══════════════════════════════════════════════════════════════ */

/**
 * 头像。
 *
 * ⚠️ 有图显示图、没图显示 emoji，但【外面那个圆是一样大的】。
 *    如果把这两种情况交给两个不同的元素去撑尺寸，
 *    换头像类型时整个首屏会往下跳一下 —— 很廉价的感觉。
 *    所以尺寸由 .avatar-box 这个类统一给死，内部只负责填满。
 */
function Avatar({
  src,
  emoji,
  className,
}: {
  src: string | null;
  emoji: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  /**
   * ⚠️ 远程头像加载失败时不能留白，要退回 emoji。
   *    这一步很重要：用户配的是外链图片，
   *    那个图哪天 404 了，页面上就是一个空圆圈，
   *    而代码没改过 —— 光看页面完全猜不出原因。
   *    退回 emoji 至少还是"一个像样的头像"。
   */
  const showImg = src && !broken;
  const { t } = useT();

  return (
    <div className={`avatar-box ${className ?? ""}`}>
      {showImg ? (
        <img
          src={src}
          alt={t("about.avatarAlt", { name: PROFILE.name })}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      ) : (
        <span aria-hidden="true">{emoji}</span>
      )}
    </div>
  );
}

/**
 * 一条社交链接。
 *
 * 样式全部来自 global.css 的 .social-card / .social-icon / .social-name，
 * 这里只负责"什么时候加 target=_blank"。
 *
 * ⚠️ 站内路径（/rss.xml、/sitemap.xml）【不加】target="_blank"。
 *    无脑加的话，点「RSS 订阅」会弹出个新标签页显示一堆 XML，
 *    把用户的标签栏搞乱。判断逻辑收在 isExternal() 里，
 *    三处渲染共用同一个判断 —— 不会出现"网页版新开、窗口版不开"。
 */
function SocialCard({ s }: { s: SocialLink }) {
  const src = socialIconSrc(s);
  const ext = isExternal(s.href);
  const [broken, setBroken] = useState(false);

  return (
    <a
      href={s.href}
      target={ext ? "_blank" : undefined}
      rel={ext ? "noopener noreferrer" : undefined}
      className="social-card no-drag"
      title={`${s.name}${s.note ? " · " + s.note : ""}`}
    >
      {src && !broken ? (
        <span className="social-icon" style={s.bg ? { background: s.bg } : undefined}>
          {/* 图标加载失败就退回首字母 —— 空白比一个字母难查得多 */}
          <img src={src} alt="" width={16} height={16} loading="lazy" onError={() => setBroken(true)} />
        </span>
      ) : (
        <span className="social-icon social-icon-fallback" aria-hidden="true">
          {s.name.slice(0, 1)}
        </span>
      )}

      <span className="social-name">{s.name}</span>
      {s.note && <span className="social-note">{s.note} ↗</span>}
    </a>
  );
}
