# public/icons/links/

放**友情链接的网站头像 / Logo**。

## 怎么用

把图标文件丢进这个目录：

```text
public/icons/links/
├── mcwiki.svg
├── zhangsan.png
└── my-friend.jpg
```

然后在 `src/config/links.ts` 里**只写文件名**：

```ts
{
  name: "MC 百科",
  url: "https://zh.minecraft.wiki",
  desc: "最全的 Minecraft 中文资料站。",
  avatar: "mcwiki.svg",          // ← 就写文件名，不要写完整路径
}
```

> ⚠️ **千万别写成 `/icons/links/mcwiki.svg`。**
> 路径由 `friendAvatarSrc()` 自动拼。手动写完整路径的话，
> 在 `/posts/xxx/` 这种二级页面下会变成
> `/posts/xxx/icons/links/mcwiki.svg`，直接 404。

## 为什么要有这个目录

因为友链头像有**四级兜底**，这个目录提供的是**最稳的那一级**：

```text
1. avatar      本地文件      ← 就是这个目录里的文件，不依赖网络
2. avatarUrl   互联网地址
3. （自动）     去对方网站抓 favicon
4. emoji       兜底
```

什么都不填也能用（走第 3 级自动抓取），但：

- **对方网站的 favicon 可能很小**（32×32），放大就糊
- **自动抓取依赖第三方服务**，它挂了图标就退化成首字母
- **访客看你的友链时，请求会经过那个第三方服务**

所以**重要的友链建议在这个目录里放一份图标**，一劳永逸。

## 文件格式

支持 `.svg` `.png` `.jpg` `.webp` 等，**配置里要带上扩展名**。

推荐 SVG —— 矢量图放大不糊，而且文件通常只有几 KB。

## 和 public/icons/social/ 的区别

| 目录 | 放什么 | 会增长吗 |
| --- | --- | --- |
| `icons/social/` | **社交平台**的图标（GitHub、B站…） | 基本固定，就那 9 个 |
| `icons/links/` | **朋友的站**的头像（这个目录） | 加一个友链就多一个 |

分开放是为了以后想清理时能分清 —— 否则一堆图标混在一起，
根本分不出哪个是平台、哪个是友链，删错了页面就开始报 404。

## 版权提醒

**放进来之前确认你有权使用那张图。**

自己的站头像、对方主动提供的 logo 一般没问题；
从别人网站上随便抓的图，就不要往仓库里放了（用 `avatarUrl`
直接引用对方的地址，责任更清晰）。
