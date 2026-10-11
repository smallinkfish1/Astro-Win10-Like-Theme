/**
 * 「文件管理器」类应用的共享类型与工具。
 * ================================================================
 *
 * 应用一（此电脑）和应用二（回收站）视觉几乎一样：
 * 菜单栏 + 地址栏 + 左侧导航树 + 右侧详细列表。
 * 区别只有两处：
 *
 *   1. 数据源不同    此电脑读文章，回收站读草稿
 *   2. 双击行为不同  此电脑渲染 HTML，回收站显示 .md 源码
 *
 * 所以把「外壳 + 列表 + 排序」抽到这里共用，
 * 两个应用各自只写自己的数据源和双击逻辑。
 */

import type { ClientPost } from "../../../../lib/markdown";

/* ────────────────────────────────────────────────────────────
   文件树节点
   ──────────────────────────────────────────────────────────── */

/**
 * 树上的一个节点：要么是文件夹，要么是一篇文章。
 *
 * ⚠️ 为什么 folder 和 post 合成一个类型，而不是两个类型 + 联合？
 *
 *    因为渲染列表时两者要混在一起排（文件夹排在文章前面），
 *    排序函数、键盘导航、选中逻辑都要能统一处理。
 *    分成两个类型的话，每处都得写 if ("children" in node) 来分支，
 *    很快就乱成一团。
 *
 *    用一个可选的 children 字段区分，配合 kind 字段明确语义 ——
 *    这是文件管理器这类界面的常见做法。
 */
export interface FileNode {
  /**
   * 唯一标识，用路径式字符串："/技术/Hexo/my-post"
   *
   * ⚠️ 用路径而不是 slug，是因为重名文章可能出现在不同文件夹下
   *    （比如两个分类里各有一篇 "index.md"），slug 会撞。
   *    路径天然唯一。
   */
  id: string;

  /** 显示名。文件夹是分类名，文章是标题 */
  name: string;

  /**
   * 显示名对应的词典 key（可选）。
   *
   * ⚠️ 只有「未分类」这种【界面文案】才用得上它 ——
   *    文件夹名绝大多数来自文章的分类字段，那是内容，不该翻译。
   *    所以这里是可选的，渲染端按 nameKey 优先取。
   *    （和 config/tiles.ts 的 labelKey / label 是同一套思路。）
   */
  nameKey?: string;

  kind: "folder" | "post" | "draft";

  /** 子节点，仅 kind === "folder" 有 */
  children?: FileNode[];

  /** 文章/草稿的元数据，仅 kind !== "folder" 有 */
  post?: ClientPost & {
    /**
     * 原始 Markdown 源码。
     *
     * ⚠️ 只有「回收站」和「记事本」需要它（要显示源码），
     *    「此电脑」的数据里这个字段是 undefined ——
     *    因为传源码会让首屏 JSON 大好几倍，而此电脑用不上。
     *    这就是为什么它可选。
     */
    raw?: string;

    /** 字数（已去掉 LaTeX 和代码块），草稿列表要显示它 */
    wordCount?: number;
  };
}

/** 地址栏面包屑的一段 */
export interface Crumb {
  label: string;
  /** 点它跳到哪里。根节点是 "/" */
  path: string;
}

/* ────────────────────────────────────────────────────────────
   分类路径解析
   ──────────────────────────────────────────────────────────── */

/**
 * 把 "技术/Hexo" 这样的分类串拆成层级数组。
 *
 * ⚠️⚠️ 这是本项目「文件夹嵌套」的核心约定，说清楚：
 *
 *    frontmatter 里的 category 是【单值字符串】（不是数组），
 *    用斜杠表达层级：
 *
 *      category: 技术                  → ["技术"]
 *      category: 技术/Hexo             → ["技术", "Hexo"]
 *      category: 技术/Hexo/踩坑        → ["技术", "Hexo", "踩坑"]
 *
 *    ⚠️ 和之前迁移文档的冲突：
 *       那份文档里写着「category 带 / 会报 Missing parameter: tag」，
 *       因为当时斜杠被当成 URL 路径分隔符了。
 *       支持嵌套之后，那条限制在【浏览器端】不再成立 ——
 *       但【分类页路由】必须跟着改（见 pages/category/[category].astro）。
 *       用斜杠的旧规则已经在那边修好了，这里只负责数据层。
 *
 * ── 边界情况怎么处理的 ──
 *
 *    "技术//Hexo"     → ["技术", "Hexo"]      空段被过滤
 *    "/技术/"         → ["技术"]              首尾斜杠忽略
 *    "技术/  Hexo  "  → ["技术", "Hexo"]      每段 trim
 *    ""               → ["未分类"]            空串兜底
 *    未分类           → ["未分类"]
 *
 *  这样写出来的树永远不会出现空名字的文件夹（那种在界面上
 *  表现为一个点不动的空白行，很难查）。
 */
/**
 * 「未分类」这个文件夹名的兜底值。
 *
 * ⚠️ 它和别的文件夹名不一样：别的来自文章的分类字段（内容），
 *    只有它是【界面文案】，所以额外配一个词典 key。
 */
export const UNCATEGORIZED = "未分类";
export const UNCATEGORIZED_KEY = "ex.uncategorized";

export function splitCategory(category: string | undefined | null): string[] {
  const raw = (category ?? "").trim();
  if (!raw) return [UNCATEGORIZED];

  const parts = raw
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);

  return parts.length ? parts : [UNCATEGORIZED];
}

/* ────────────────────────────────────────────────────────────
   从文章列表构建树
   ──────────────────────────────────────────────────────────── */

interface TreeNode {
  name: string;
  /** 见 FileNode.nameKey 的说明 —— 只有「未分类」会带上它 */
  nameKey?: string;
  /** 完整路径，如 "/技术/Hexo" */
  path: string;
  children: Map<string, TreeNode>;
  /** 挂在这个文件夹下的文章（不含子文件夹里的） */
  files: FileNode[];
}

function newTreeNode(name: string, path: string): TreeNode {
  return {
    name,
    // 只有兜底的那个「未分类」需要翻译，其余分类名是文章内容
    nameKey: name === UNCATEGORIZED ? UNCATEGORIZED_KEY : undefined,
    path,
    children: new Map(),
    files: [],
  };
}

/**
 * 把平铺的文章列表变成分类文件夹树。
 *
 * 结构示意（category 分别写了 "技术/Hexo"、"技术"、"随笔"）：
 *
 *   /
 *   ├── 技术/                     ← 文件夹（自身没有文章）
 *   │   ├── Hexo/                 ← 子文件夹
 *   │   │   └── 迁移记录.md
 *   │   └── 性能优化.md           ← 直接挂在「技术」下的文章
 *   └── 随笔/
 *       └── 为什么做这个博客.md
 *
 * ⚠️ 文件夹和文章可以共存 —— 「技术」既有子文件夹「Hexo」，
 *    也有自己的文章。这在真实文件系统里是常态，
 *    Windows 资源管理器也是这么显示的，所以不特殊处理。
 *
 * @param posts   文章列表
 * @param opts.kind  "post"（此电脑）或 "draft"（回收站）
 * @param opts.withRaw  是否带上 raw 源码字段
 */
/**
 * 建树选项。
 *
 * ⚠️ withRaw 只给「回收站」用。
 *    回收站的定位是「看草稿的原始 .md 源码」，所以它需要 raw。
 *    此电脑双击是去开窗口渲染 HTML，完全用不到 raw ——
 *    raw 可能有几百 KB，默认传过去会让岛屿的 props 白白胖一圈。
 *
 * ⚠️ 注意 raw 不在 ClientPost 里。ClientPost 是白名单，
 *    只声明实际会跨岛屿传的字段。raw 是运行时从 Post 上摘下来的可选项，
 *    所以下面用 `ClientPost & { raw?: string }` 交叉类型接它。
 */
export function buildTree(
  posts: ClientPost[],
  opts: { kind?: "post" | "draft"; withRaw?: boolean } = {},
): FileNode[] {
  const kind = opts.kind ?? "post";
  const root = newTreeNode("", "/");

  for (const p of posts) {
    const segs = splitCategory(p.category);

    // 逐段下沉，沿途补建缺失的文件夹
    let cur = root;
    for (const seg of segs) {
      const childPath = `${cur.path === "/" ? "" : cur.path}/${seg}`;
      if (!cur.children.has(seg)) {
        cur.children.set(seg, newTreeNode(seg, childPath));
      }
      cur = cur.children.get(seg)!;
    }

    // 文件名用 title（比 slug 可读），id 用完整路径保证唯一
    cur.files.push({
      id: `${cur.path === "/" ? "" : cur.path}/${p.slug}`,
      name: p.title,
      kind,
      post: {
        ...p,
        // ⚠️ 只有显式要求时才带 raw。它可能占几百 KB，
        //    而此电脑根本用不到（双击是去开窗口渲染 HTML）。
        raw: opts.withRaw ? (p as ClientPost & { raw?: string }).raw : undefined,
      },
    });
  }

  /** 递归把 Map 结构转成数组，并排序：文件夹在前、同类按名称 */
  function toArray(node: TreeNode): FileNode[] {
    const folders: FileNode[] = [...node.children.values()]
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
      .map((child) => ({
        id: child.path,
        name: child.name,
        nameKey: child.nameKey,
        kind: "folder" as const,
        children: toArray(child),
      }));

    const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

    return [...folders, ...files];
  }

  return toArray(root);
}

/* ────────────────────────────────────────────────────────────
   排序
   ──────────────────────────────────────────────────────────── */

export type SortKey = "name" | "date" | "kind";
export type SortDir = "asc" | "desc";

/**
 * 递归统计一个节点下的文章总数。
 *
 * 文件夹那一行要显示「12 个项目」，这个数字必须是【整个子树】的，
 * 而不是直接子节点的数量 —— 否则「技术」文件夹显示 1，
 * 点进去却有 8 篇，看着像 bug。
 */
export function countPosts(node: FileNode): number {
  if (node.kind !== "folder") return 1;
  return (node.children ?? []).reduce((n, c) => n + countPosts(c), 0);
}

/**
 * 按指定列和方向排序。
 *
 * ⚠️⚠️ 文件夹永远排在文章前面，这一条不受排序方向和列的影响。
 *
 *    理由：Windows 资源管理器就是这么做的，而且是用户肌肉记忆。
 *    如果你点「名称降序」，文件夹跑到文章后面去了，
 *    用户的直觉是"这东西坏了"，而不是"哦排序生效了"。
 *    让「文件夹优先」凌驾于排序之上，是符合预期的做法。
 *
 * ⚠️ 排序不递归 —— 只排当前这一层。
 *    子文件夹里的内容在点进去之后才排（用同一个函数）。
 *    这样每一层的排序是独立的，符合资源管理器的行为。
 */
export function sortNodes(nodes: FileNode[], key: SortKey, dir: SortDir): FileNode[] {
  const sign = dir === "asc" ? 1 : -1;

  return [...nodes].sort((a, b) => {
    // 1. 文件夹优先（不参与方向翻转）
    const aFolder = a.kind === "folder";
    const bFolder = b.kind === "folder";
    if (aFolder !== bFolder) return aFolder ? -1 : 1;

    // 2. 同类型之间比大小
    let cmp = 0;
    if (key === "name") {
      cmp = a.name.localeCompare(b.name, "zh-CN");
    } else if (key === "date") {
      const ta = a.post ? new Date(a.post.pubDate).getTime() : 0;
      const tb = b.post ? new Date(b.post.pubDate).getTime() : 0;
      cmp = ta - tb;
    } else {
      // kind：文件夹在前已处理，这里只剩文章之间，
      // 按分类名比，让同分类的聚在一起
      cmp = (a.post?.category ?? "").localeCompare(b.post?.category ?? "", "zh-CN");
    }

    // 3. 平手时用名称兜底，保证排序稳定（不会每次渲染都换位置）
    if (cmp === 0) cmp = a.name.localeCompare(b.name, "zh-CN");

    return cmp * sign;
  });
}

/** 在树里按 id 找节点（用于地址栏跳转、状态栏显示选中项） */
export function findNode(nodes: FileNode[], id: string): FileNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const hit = findNode(n.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * 取某个路径下的直接子节点列表。path 为 "/" 时返回根层。
 *
 * 注意返回的【只是这一层】，不递归 —— 列表视图只显示当前文件夹的内容，
 * 这是资源管理器的标准行为（不是把所有后代都摊平）。
 */
export function childrenAt(nodes: FileNode[], path: string): FileNode[] {
  if (path === "/") return nodes;

  const target = findNode(nodes, path);
  if (!target) return [];

  // 如果选中的是一篇文章，就展示它所在的文件夹
  if (target.kind !== "folder") {
    const parentPath = path.slice(0, path.lastIndexOf("/")) || "/";
    return childrenAt(nodes, parentPath);
  }

  return target.children ?? [];
}

/**
 * 由路径生成面包屑。"/技术/Hexo" → [此电脑, 技术, Hexo]
 *
 * ⚠️⚠️ rootLabel 是必传参数 —— 这里顺手修掉了一个老 bug：
 *    以前根这一项写死成「此电脑」，于是【回收站】窗口的地址栏
 *    最左边也显示「此电脑」，明明是从回收站点进来的。
 *    现在由外壳把自己的 rootLabel 传进来（已经是翻译过的），
 *    既修了 bug，也让面包屑跟着界面语言走。
 */
export function crumbsOf(path: string, rootLabel: string): Crumb[] {
  const out: Crumb[] = [{ label: rootLabel, path: "/" }];
  if (path === "/") return out;

  const segs = path.split("/").filter(Boolean);
  let acc = "";
  for (const s of segs) {
    acc += `/${s}`;
    out.push({ label: s, path: acc });
  }
  return out;
}
