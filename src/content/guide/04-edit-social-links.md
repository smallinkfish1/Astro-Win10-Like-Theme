---
title: 如何修改社交链接
description: 换平台、换地址、换图标，以及改站长个人信息。
---

# 如何修改社交链接

社交链接（GitHub、B站、YouTube……）显示在三个地方：

| 位置 | 说明 |
| --- | --- |
| 浏览器窗口 → 「找到我」标签页 | 卡片列表 |
| 窗口版「关于」 | 底部 |
| 静态 `/about` 页面 | 底部 |

**三处读的是同一份数据**，所以改一处全都变。

## 配置在哪

```text
src/config/site.ts
```

里面有两个东西：**站长信息**和**社交链接**。

## 改站长信息

```ts
export const PROFILE: SiteProfile = {
  name: "你好，我是站长",
  bio: [
    "第一段自我介绍。",
    "第二段自我介绍。",
  ],
  emoji: "👤",
};
```

`bio` 是**数组**，每一项是一段。想加段落就往里加一条。

### 换头像

头像支持三种方式，**优先级从高到低**：

```ts
// ① 互联网地址 —— 优先级最高
avatarUrl: "https://avatars.githubusercontent.com/u/9919?s=200&v=4",

// ② 本地文件 —— 放在 public/ 下
avatar: "/avatar.jpg",

// ③ 兜底 emoji
emoji: "👤",
```

> ⚠️ 两个要点：
> 1. **本地路径必须以 `/` 开头**（`avatar: "/avatar.jpg"`）。
>    写成 `"avatar.jpg"` 的话，在 `/posts/xxx/` 这种二级页面下会变成
>    `/posts/xxx/avatar.jpg`，直接 404。
> 2. 远程图片挂了会**自动退回 emoji**。所以看到头像变成 👤，
>    说明那张图加载失败了，去检查 URL。

## 改社交链接

```ts
export const SOCIALS: SocialLink[] = [
  { name: "GitHub", href: "https://github.com", note: "源码", icon: "github" },
  { name: "Bilibili", href: "https://space.bilibili.com/", note: "视频", icon: "bilibili" },
  // ...
];
```

| 字段 | 说明 |
| --- | --- |
| `name` | 显示名称 |
| `href` | 链接地址 |
| `note` | 右侧那句小字（比如「源码」「订阅」） |
| `icon` | **本地图标文件名**（不带 `.svg`），对应 `public/icons/social/<icon>.svg` |
| `iconUrl` | 互联网图标地址，填了优先用它 |
| `bg` | 图标底色，不填走主题色 |
| `hidden` | 设为 `true` 则不显示 |

> ⚠️ **仓库里现有的地址全是占位符**（只写了平台首页，没带你的用户名），
> 邮箱也是示例值。换成你自己的就能用。

### 内链还是外链

`href` 的开头决定了打开方式：

| 写法 | 行为 |
| --- | --- |
| `https://...` | **新标签页**打开（带 `rel="noopener noreferrer"`） |
| `/rss.xml` | 当前标签页（站内路径） |
| `mailto:me@example.com` | 当前标签页（发邮件） |

**这是自动判断的，不用你操心。**

## 加一个新平台

### 如果图标已经有了

直接在 `SOCIALS` 里加一行：

```ts
{ name: "Mastodon", href: "https://mastodon.social/@yourname", note: "长文", icon: "mastodon" },
```

### 如果图标还没有

1. 找一个该平台的 SVG 图标，丢进 `public/icons/social/`，命名成 `mastodon.svg`
2. 上面那行配置就能用了

> 💡 **推荐用本地 SVG，而不是远程图标。**
> 远程图标哪一天源站改了路径，你的页面就悄悄变成一排空白方块 ——
> 而且本地开发时不一定发现。本地文件跟着仓库走，最省心。

### 实在找不到图标

不写 `icon`，它会自动用**首字母**兜底（`M`）。虽然朴素，但至少不是空白。

或者用 emoji：

```ts
{ name: "我的博客", href: "...", note: "自建", iconUrl: undefined }
```

## 隐藏而不删除

```ts
{ name: "Twitter", href: "https://twitter.com/", note: "旧号", icon: "twitter", hidden: true }
```

## 为什么三处能长得一模一样

因为**样式不在组件里**，而在全局 CSS 的 `.social-*` 那几个类里。

三处渲染分属两套模板系统（Astro 静态页 和 React 窗口），没法共用一个组件文件 ——
所以约定是：

```text
数据真相  →  src/config/site.ts
样式真相  →  src/styles/global.css
组件      →  只决定怎么摆
```

**你改配置就够，不需要碰样式。**
