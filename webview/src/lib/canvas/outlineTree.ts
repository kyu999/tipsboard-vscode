import type { CanvasGraphIndex } from "./graphUtils";
import { getBecauseChildren, getSolutionChildren } from "./graphUtils";

export type OutlineChildKind = "because" | "solved_by";

export interface OutlineTreeNode {
  nodeId: string;
  kind: OutlineChildKind | "root";
  children: OutlineTreeNode[];
  cycle: boolean;
  sharedElsewhere: boolean;
}

export function buildOutlineForest(
  index: CanvasGraphIndex,
  rootIds: string[],
  placedNodes: Set<string> = new Set(),
): OutlineTreeNode[] {
  return rootIds.map((rootId) => buildOutlineSubtree(index, rootId, "root", placedNodes, new Set()));
}

function buildOutlineSubtree(
  index: CanvasGraphIndex,
  nodeId: string,
  kind: OutlineChildKind | "root",
  placedNodes: Set<string>,
  ancestry: Set<string>,
): OutlineTreeNode {
  const sharedElsewhere = placedNodes.has(nodeId);
  if (!sharedElsewhere) placedNodes.add(nodeId);

  const cycle = ancestry.has(nodeId);
  const nextAncestry = new Set(ancestry);
  nextAncestry.add(nodeId);

  const children: OutlineTreeNode[] = [];
  if (!cycle && !sharedElsewhere) {
    const becauseKids = getBecauseChildren(index, nodeId);
    for (const kid of becauseKids) {
      if (placedNodes.has(kid.id)) continue;
      children.push(buildOutlineSubtree(index, kid.id, "because", placedNodes, nextAncestry));
    }
    const solutionKids = getSolutionChildren(index, nodeId);
    for (const kid of solutionKids) {
      if (placedNodes.has(kid.id)) continue;
      children.push(buildOutlineSubtree(index, kid.id, "solved_by", placedNodes, nextAncestry));
    }
  }

  return { nodeId, kind, children, cycle, sharedElsewhere };
}

export function flattenOutlineNodes(forest: OutlineTreeNode[]): string[] {
  const out: string[] = [];
  const walk = (nodes: OutlineTreeNode[]) => {
    for (const node of nodes) {
      out.push(node.nodeId);
      walk(node.children);
    }
  };
  walk(forest);
  return out;
}
