import { groupID } from "./anchors"
import type { GroupKind, SessionNode, SessionRow } from "./grouping/session"


export function rowWeight(
  row: SessionRow,
  input: { expanded: (groupID: string, kind: GroupKind) => boolean; grouped: (kind: GroupKind) => boolean },
) {
  if (row.type !== "group") return 1
  const visit = (node: Extract<SessionNode, { type: "group" }>, level: number): number => {
    if (!input.grouped(node.kind)) return node.size
    const id = groupID(node, level)
    if (!id || !input.expanded(id, node.kind)) return 1
    return node.children.reduce((total, child) => total + (child.type === "group" ? visit(child, level + 1) : 1), 1)
  }
  return visit(row, 0)
}


export function rowsBefore(weights: readonly number[], end: number, budget: number) {
  let index = end
  let spent = 0
  while (index > 0 && spent < budget) spent += weights[--index]
  return index
}


export function rowsAfter(weights: readonly number[], start: number, budget: number) {
  let index = start
  let spent = 0
  while (index < weights.length && spent < budget) spent += weights[index++]
  return index
}
