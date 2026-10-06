---
title: 如何修改友情链接
description: 换链接、换图标、加一条新友链。图标可以用别人的、自己的或者自动抓的。
---

# 如何修改友情链接

友情链接显示在「浏览器」窗口的**第一个标签页**里，卡片式布局：**图标 + 博客名 + 一句话介绍**。

## 配置在哪

```text
src/config/links.ts
```

打开会看到：

```ts
export const FRIEND_LINKS: FriendLink[] = [
  {
    name: "Astro 官方文档",
    url: "https://docs.astro.build",
    desc: "本站的框架。内容优先、默认零 JS。",
    emoji: "🚀",
  },
  // ...
];
```

## 字段说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | ✅ | 博客名 |
| `url` | ✅ | 点击跳转的地址 |
| `desc` | | 一句话介绍 |
| `avatar` | | 本地图标文件名 → 放 `public/icons/links/` 下 |
| `avatarUrl` | | 互联网图标地址 |
| `emoji` | | 兜底。上面两个都没有时显示它 |
| `hidden` | | 设为 `true` 就不显示 |

## 图标从哪来（四级兜底）

优先级**从高到低**，填了前面的就不看后面的：

```text
1. avatar      本地文件      最稳，不依赖网络
2. avatarUrl   互联网地址    灵活，想用啥用啥
3. （自动）     从 url 推域名，去抓对方网站的 favicon    ← 什么都不用填
4. emoji       最后兜底
```

**所以最省事的写法是只填三个字段**：

```ts
{
  name: "MC 百科",
  url: "https://zh.minecraft.wiki",
  desc: "最全的 Minecraft 中文资料站。",
}
```

它会自动去抓 `zh.minecraft.wiki` 的网站图标。

> ⚠️ **自动抓取有两个已知情况**：
> 1. 它**依赖一个第三方服务**。对方哪天挂了，图标会退化成首字母（不会空白，但也不好看）。
> 2. 拿到的小图标**尺寸通常很小**（32×32 左右），页面里按小尺寸显示没问题，但也仅此而已。
>
> 所以**重要的友链建议用本地图标**，一劳永逸。

## 用本地图标（推荐）

1. 把图标文件丢进 `public/icons/links/`：

```text
public/icons/links/
├── mcwiki.svg
└── zhangsan.png
```

2. 配置里**只写文件名**：

```ts
{
  name: "MC 百科",
  url: "https://zh.minecraft.wiki",
  desc: "最全的 Minecraft 中文资料站。",
  avatar: "mcwiki.svg",
}
```

> ⚠️ **写文件名就够了，不要写 `/icons/links/mcwiki.svg`。**
> 路径由代码自动拼 —— 手动写完整路径的话，在 `/posts/xxx/` 这种二级页面下
> 会变成 `/posts/xxx/icons/links/...`，直接 404。

支持 `.svg` `.png` `.jpg` 等常见格式，写全扩展名即可。

## 用互联网图标

```ts
{
  name: "某某的博客",
  url: "https://example.com",
  desc: "写了很多前端踩坑记录。",
  avatarUrl: "https://example.com/logo.png",
}
```

> ⚠️ 远程图片**加载失败会静默留白**。所以代码里做了兜底：
> 加载失败会自动退回 emoji 或首字母。但**换不了你配置里写错了地址**这件事 ——
> 看到全是首字母，先检查 URL。

## 加一条新友链

在数组里加一个对象就行，位置随意（数组顺序 = 显示顺序）：

```ts
{
  name: "李四的笔记本",
  url: "https://lisi.example.com",
  desc: "主攻 Rust 和编译器，文章很长但值得读。",
  emoji: "📓",
},
```

## 隐藏而不删除

不想显示但想留着配置：

```ts
{ name: "...", url: "...", desc: "...", hidden: true }
```

## 和「关于」页的关系

友情链接这份数据**同时被两个地方读取**：

- 浏览器窗口的「友情链接」标签页
- （如果配置了的话）「关于」页

所以**改一处，两个地方一起变** —— 不会出现「网页上加了、窗口里没有」这种漂移。
