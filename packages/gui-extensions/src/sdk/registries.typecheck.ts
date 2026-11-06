

import { Extension, MenuItem, TitlebarItem, type Setup } from "./index"

const Fixture = Extension.define({ id: "fixture" })

export const menus: Setup<typeof Fixture> = (ctx) => {
  
  ctx.add(MenuItem, { menu: "session.panel", id: "open", title: "Open", icon: "plus", keybind: "file.open", run() {} })
  ctx.add(MenuItem, { menu: "server.add", id: "add", title: "Add", order: 1, run() {} })
  ctx.add(MenuItem, {
    menu: "server.row",
    id: "connect",
    title: "Connect",
    when: (server) => server.startsWith("ssh:"),
    enabled: () => true,
    run: (server) => void server.length,
  })
  ctx.add(MenuItem, (): MenuItem | undefined =>
    Math.random() > 0.5 ? { menu: "server.add", id: "add", title: "Add", run() {} } : undefined,
  )

  
  ctx.add(MenuItem, { menu: "server.add", id: "add", title: "Add", icon: "plus", run() {} })
  
  ctx.add(MenuItem, { menu: "session.panel", id: "open", title: "Open", when: () => true, run() {} })
  
  ctx.add(MenuItem, { menu: "server.row", id: "connect", title: "Connect", keybind: "file.open", run() {} })
  
  ctx.add(MenuItem, { menu: "server.add", id: "add", title: "Add", run: (server: string) => void server })

  
  ctx.add(TitlebarItem, { id: "status", label: "Ready" })
}
