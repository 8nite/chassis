import { createMemo, lazy, on, onCleanup, Suspense } from "solid-js"
import { Command, createKeyed, onIdle, Panel, type Setup } from "../sdk"
import type Terminal from "./index"
import { createTerminalModel, type TerminalWorkspace } from "./model"

const DOCK = "terminal:main"

const setup: Setup<typeof Terminal> = (ctx) => {
  const sessions = ctx.sessions
  const layout = ctx.layout
  const model = createTerminalModel({ storage: ctx.storage, sessions })

  onCleanup(model.dispose)
  
  ctx.workspaces.on("remove", model.remove)

  
  const workspace = createMemo<TerminalWorkspace | undefined>((previous) => {
    const session = sessions.current()

    return session ? model.load(session) : previous
  })

  
  const left = createMemo(
    on(workspace, (next, previous) => (previous && next !== previous ? previous : undefined), { defer: true }),
  )

  
  createKeyed(left, (previous) => previous.trimAll())

  const routed = createMemo(() => !!sessions.current())

  const current = () => {
    const session = sessions.current()

    if (!session) return

    return { session, terminal: model.load(session) }
  }

  ctx.add(
    Command,
    (): Command => ({
      id: "toggle",
      title: ctx.t("command.toggle"),
      group: ctx.t("command.category.view"),
      section: "terminal",
      featured: true,
      bind: "ctrl+`",
      slash: { name: "terminal", after: "open" },
      editable: true,
      enabled: routed(),
      run() {
        const target = current()

        if (!target) return

        if (layout.dock.opened(target.session)) {
          target.terminal.cancelFocus()
          layout.close(DOCK, target.session)

          return
        }

        layout.open(DOCK, target.session)
        target.terminal.requestFocus(target.terminal.active())
      },
    }),
  )

  ctx.add(
    Command,
    (): Command => ({
      id: "new",
      title: ctx.t("command.new"),
      description: ctx.t("command.new.description"),
      group: ctx.t("command.category"),
      section: "terminal",
      bind: "ctrl+alt+t",
      editable: true,
      enabled: routed(),
      run() {
        const target = current()

        if (!target) return

        layout.open(DOCK, target.session)

        if (target.terminal.all().length > 0) target.terminal.new()

        if (target.terminal.all().length === 0) target.terminal.requestFocus()
      },
    }),
  )

  ctx.add(
    Command,
    (): Command => ({
      id: "close",
      title: ctx.t("close"),
      group: ctx.t("command.category"),
      section: "terminal",
      bind: "mod+w",
      hidden: true,
      scope: '[data-component="terminal"]',
      enabled: routed(),
      run() {
        const target = current()

        if (!target) return

        const id = target.terminal.active()

        if (!id) return

        const last = target.terminal.all().length === 1

        void target.terminal.close(id)

        if (last) layout.close(DOCK, target.session)
      },
    }),
  )

  const TerminalPanel = lazy(() => import("./panel"))

  
  onCleanup(onIdle(() => void TerminalPanel.preload()))
  
  createKeyed(
    () => sessions.list().some((session) => layout.dock.opened(session)),
    () => void TerminalPanel.preload(),
  )

  
  const tab = {
    id: "main",
    get title() {
      return ctx.t("tab.title")
    },
  }

  ctx.add(Panel, {
    id: "main",
    region: "dock",
    mobile: {
      get title() {
        return ctx.t("tab.title")
      },
      order: 30,
      kind: "menu",
      icon: "terminal",
    },
    list: () => [tab],
    render: (props) => (
      <Suspense>
        <TerminalPanel model={model} session={props.session} onClose={() => layout.close(DOCK, props.session)} />
      </Suspense>
    ),
  })
}

export default setup
