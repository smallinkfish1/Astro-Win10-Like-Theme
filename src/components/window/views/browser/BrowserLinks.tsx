import { useState } from "react";
import {
  visibleFriendLinks,
  friendAvatarSrc,
  type FriendLink,
} from "../../../../config/links";
import { useT } from "../../../../i18n";

/**
 * 浏览器 → 「友情链接」标签页
 * ================================================================
 *
 * 卡片式布局：头像 + 博客名 + 一句话介绍（两行版）。
 *
 * ── 数据从哪来 ──
 *
 *   src/config/links.ts。改友链只改那个文件，不用碰这里。
 *
 * ── 头像怎么来（这里最容易出问题） ──
 *
 *   friendAvatarSrc() 内部做了四级兜底，
 *   但这个组件还必须处理【第五种情况：图挂了】。
 *
 *   这两种失败是不同层面的：
 *     · 前四级兜底解决的是「配置里没填图」→ 返回 null → 我们直接用 emoji
 *     · 这里解决的是「填了图，但那个地址 404 了」→ <img> 会静默失败
 *
 *   ⚠️ <img> 加载失败是【没有任何视觉反馈】的 ——
 *      页面上就是一块空白，用户分不出是「没配」还是「配错了」。
 *      所以必须监听 onError，失败就退回 emoji / 首字母。
 */

/** 一个头像。图挂了会自动退回 emoji / 首字母 */
function FriendAvatar({ link }: { link: FriendLink }) {
  const src = friendAvatarSrc(link);
  const [broken, setBroken] = useState(false);

  /** 没有图源，或者图加载失败 → 走文字兜底 */
  if (!src || broken) {
    return (
      <span className="link-avatar link-avatar-fallback" aria-hidden="true">
        {link.emoji ?? link.name.slice(0, 1)}
      </span>
    );
  }

  return (
    <span className="link-avatar">
      <img
        src={src}
        alt=""
        width={32}
        height={32}
        loading="lazy"
        decoding="async"
        /*
          ⚠️ onError 里把 broken 置 true，下一轮渲染就走上面的文字分支。
             这是个状态，不是一次性的 —— 所以哪怕地址后来修好了，
             也得刷新页面才会重试（浏览器也不会主动重试失败的图）。
        */
        onError={() => setBroken(true)}
      />
    </span>
  );
}

export default function BrowserLinks() {
  const { t } = useT();
  const links = visibleFriendLinks();

  if (links.length === 0) {
    return (
      <div className="grid h-full place-items-center text-[12px] text-[var(--fg-faint)]">
        {t("bv.noFriendLinks")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {links.map((l) => (
          <a
            key={l.url}
            href={l.url}
            target="_blank"
            /*
              ⚠️ rel="noopener noreferrer" 不能省。
                 少了 noopener，被打开的页面能通过 window.opener
                 拿到我们这个页面的引用，然后改它的地址 —— 钓鱼常用手法。
            */
            rel="noopener noreferrer"
            className="link-card no-drag"
            title={l.desc}
          >
            <FriendAvatar link={l} />

            <span className="link-meta">
              <span className="link-name">
                {l.name}
                <span className="link-arrow" aria-hidden="true">
                  ↗
                </span>
              </span>
              {l.desc && <span className="link-desc">{l.desc}</span>}
            </span>
          </a>
        ))}
      </div>

      {/*
        自解释提示：让人知道这些数据在哪改。
        教程 03 那篇讲的就是这件事 —— 与其让人去翻文档，不如直接写在页面上。
      */}
      <p className="link-hint">{t("bv.friendHint")}</p>
    </div>
  );
}
