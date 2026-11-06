import { createContext, useContext } from "solid-js"
import type { Renderable } from "@opentui/core"
import type { ModelInfo } from "@chassis/client"
import type { SessionInbox } from "@chassis/schema/session-inbox"
import type { useConfig } from "../../config"
import type { ThinkingMode } from "../../context/thinking"
import type { createTimelineAnchors } from "./anchors"
import type { GroupKind } from "./grouping/session"

export type PendingAction = "steer" | "queue" | "cancel"

export const context = createContext<{
  
  width: number
  
  terminal: { width: number; height: number }
  sessionID: string
  anchors: ReturnType<typeof createTimelineAnchors>
  
  groupExpanded: (groupID: string, kind: GroupKind) => boolean
  
  setGroupExpanded: (groupID: string, expanded: boolean, anchor?: Renderable | null) => void
  thinkingMode: () => ThinkingMode
  markdownMode: () => "source" | "rendered"
  groupExploration: () => boolean
  diffWrapMode: () => "word" | "none"
  models: () => ModelInfo[]
  messageIndex: (messageID: string) => number | undefined
  
  legacyTurns: () => boolean
  config: ReturnType<typeof useConfig>["data"]
  mutatePending: (action: PendingAction, inboxID: string) => Promise<boolean>
  pendingDelivery: (inboxID: string) => SessionInbox.Delivery | undefined
}>()

export function use() {
  const ctx = useContext(context)
  if (!ctx) throw new Error("useContext must be used within a Session component")
  return ctx
}
