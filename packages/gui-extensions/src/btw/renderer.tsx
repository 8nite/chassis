import { createMemo, lazy, onCleanup, Suspense } from "solid-js"
import { Icon } from "@chassis/ui/icon"
import { Command, createKeyed, onIdle, Panel, type PanelTab, type Setup } from "../sdk"
import type Btw from "./index"
import { createBtw } from "./model"

const setup: Setup<typeof Btw> = (ctx) => {
  const SessionBtwPanel = lazy(() => import("./panel"))
  onCleanup(onIdle(() => void SessionBtwPanel.preload()))
  const layout = ctx.layout
  const sessions = ctx.sessions
  const btw = createBtw(ctx)
  
  const mounted = createMemo(() => !!sessions.current())

  
  const tabs = new Map<string, Map<string, PanelTab>>()

  
  createKeyed(
    () => [...sessions.list().map((session) => session.key), sessions.current()?.key].join("\u0000"),
    () => {
      const keep = new Set([...sessions.list().map((session) => session.key), sessions.current()?.key])
      tabs.forEach((_cache, key) => {
        if (!keep.has(key)) tabs.delete(key)
      })
    },
  )

  ctx.add(
    Command,
    (): Command => ({
      id: "ask",
      title: ctx.t("command.title"),
      description: ctx.t("command.description"),
      group: ctx.t("command.category.session"),
      section: "session",
      slash: { name: "btw", arguments: true },
      hidden: true,
      
      enabled: !layout.narrow() && mounted(),
      run: (input) => btw.ask(input),
    }),
  )

  ctx.add(Panel, {
    id: "main",
    region: "side",
    transient: true,
    
    legacy: { btw: "main" },
    
    
    list: (input) => {
      if (input.open.length === 0) return []

      const saved = btw.saved(input.session)
      const cache = tabs.get(input.session.key) ?? new Map<string, PanelTab>()
      tabs.set(input.session.key, cache)

      return input.open.flatMap((id) => {
        if (saved.ready() && !saved.value?.chats.some((item) => item.id === id)) return []

        const existing = cache.get(id)

        if (existing) return [existing]

        const tab: PanelTab = {
          id,
          get title() {
            return saved.value?.chats.find((item) => item.id === id)?.question ?? ctx.t("tab.title")
          },
          get hidden() {
            return !saved.ready()
          },
          label: (state) => (
            <div class="flex min-w-0 items-center gap-1.5">
              <Icon name="bubble-5" size="small" />
              <span class="truncate">{btw.question(state.session, id) ?? ctx.t("tab.title")}</span>
            </div>
          ),
        }

        cache.set(id, tab)

        return [tab]
      })
    },
    render: (props) => (
      <Suspense>
        <SessionBtwPanel btw={btw} session={props.session} id={props.tab.id} />
      </Suspense>
    ),
    close: (input) => {
      btw.remove(input.session, input.tab.id)
      tabs.get(input.session.key)?.delete(input.tab.id)
    },
  })
}

export default setup
