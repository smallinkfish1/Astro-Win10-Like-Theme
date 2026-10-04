import { useCallback, useState } from "react";
import { sortNodes, type FileNode, type SortDir, type SortKey } from "./types";

/**
 * 列表排序状态。
 *
 * 抽成 hook 是因为「此电脑」和「回收站」都要这套逻辑，
 * 而且行为要完全一致 —— 在两个组件里各写一遍，
 * 迟早会出现"这个窗口点列头是升序、那个是降序"的不一致。
 *
 * ⚠️ 为什么排序逻辑（sortNodes）在 types.ts 而状态在这里？
 *
 *    因为 sortNodes 是纯函数，不依赖 React。
 *    它可以被单元测试直接调用，不需要跑浏览器。
 *    而这个 hook 只管 React 的那部分（useState + 回调）。
 *    分开之后，想单独验证排序规则会容易得多。
 */
export function useSortable(defaultKey: SortKey = "date", defaultDir: SortDir = "desc") {
  const [key, setKey] = useState<SortKey>(defaultKey);
  const [dir, setDir] = useState<SortDir>(defaultDir);

  /**
   * 点某一列的列头。
   *
   * ⚠️ 行为规则（和 Windows 资源管理器一致）：
   *
   *    点到【不同的列】   → 换列，并重置成该列的默认方向
   *                         名称默认升序（A→Z），日期默认降序（新→旧）
   *    点到【当前列】     → 方向翻转（升 ↔ 降）
   *
   *    为什么日期默认降序？
   *    因为你看文件列表时，想看的多半是"最新的那篇"，
   *    而不是 2019 年的第一篇。这是资源管理器的默认行为。
   */
  const toggle = useCallback(
    (next: SortKey) => {
      if (next === key) {
        setDir((d) => (d === "asc" ? "desc" : "asc"));
        return;
      }
      setKey(next);
      // 日期默认新→旧（desc），其它默认 A→Z（asc）
      setDir(next === "date" ? "desc" : "asc");
    },
    [key],
  );

  /** 应用到一组节点上 */
  const apply = useCallback(
    (nodes: FileNode[]) => sortNodes(nodes, key, dir),
    [key, dir],
  );

  return { key, dir, toggle, apply };
}
