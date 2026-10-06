---
title: 本浏览器如何添加和修改标签页
description: 标签页登记表在哪、怎么加一个新的、内容怎么写。
---

# 本浏览器如何添加和修改标签页

「浏览器」窗口里那一排标签页（友情链接 / 找到我 / 使用教程）不是写死的，它们来自**一张登记表**。

## 登记表在哪

```text
src/config/browser-tabs.ts
```

打开它，你会看到大概长这样：

```ts
export const BROWSER_TABS: BrowserTab[] = [
  {
    id: "links",
    tab: "友情链接",
    icon: "🔗",
    url: "https://blog.example.com/links",
    desc: "这个博客一路上参考过的地方。",
  },
  // ...
];
```

每个字段的意思：

| 字段 | 说明 |
| --- | --- |
| `id` | 唯一标识。**内容组件用它来判断该渲染哪一页**，所以别重复 |
| `tab` | 标签栏上显示的名字 |
| `icon` | 标签左边那个小图标（emoji） |
| `url` | 地址栏里显示的字符串。**它只是给眼睛看的**，回车才会真的跳转 |
| `desc` | 页面顶部那句说明 |

## 改名字 / 改图标

直接改对应的字段就行。比如把「友情链接」改成「朋友们」：

```ts
{ id: "links", tab: "朋友们", icon: "🧑‍🤝‍🧑", ... }
```

> ⚠️ **只改 `tab`，别改 `id`。** `id` 是给代码认的，改了就得同步改内容组件。

## 加一个新标签页

分两步。

### 第一步：在登记表里加一条

```ts
{
  id: "changelog",
  tab: "更新日志",
  icon: "📜",
  url: "https://blog.example.com/changelog",
  desc: "这个主题每个阶段做了什么。",
},
```

### 第二步：给它写内容

内容组件放在：

```text
src/components/window/views/browser/
```

里面已经有三个可以照抄的例子：

```text
browser/
├── BrowserLinks.tsx     友情链接
├── BrowserSocial.tsx    找到我
└── BrowserGuide.tsx     使用教程
```

新建一个 `BrowserChangelog.tsx`，然后**在 `BrowserView.tsx` 里注册一下**（就是那个按 `id` 分支渲染的地方）。

> 💡 内容如果用 Markdown 写会更省事 —— 参考「使用教程」那个标签页：
> 它在 `src/content/guide/` 下放 `.md` 文件，由 `src/lib/guide.ts` 读出来，
> 再交给 `renderMarkdown()` 渲染。**改文字不用碰任何 `.tsx`**。

## 删掉一个标签页

从 `BROWSER_TABS` 里删掉那条记录即可。内容组件留着不影响（没人引用它），但**清理掉更干净**。

## 注意事项

**标签页数量别太多。** 窗口宽度有限，超过 4-5 个标签，名字就会被挤成「友情链…」这种。真需要更多，考虑做标签溢出滚动。

**`url` 字段不参与逻辑。** 它只影响地址栏显示的文字，写什么都不会真的去访问。改了它不会改变实际内容 —— 实际内容由 `id` 决定。

**新标签页不需要新建静态路由。** 浏览器窗口里的内容是纯客户端渲染的，不进 sitemap、不被搜索引擎收录 —— 这是有意的，它们属于功能界面，不是站点内容。
