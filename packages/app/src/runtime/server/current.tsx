import { createMemo, Show, type ParentProps } from "solid-js"
import { createSimpleContext } from "@chassis/ui/context"
import { ServerConnection } from "./registry"
import { useGlobal, type ServerCtx } from "./runtime"

const context = createSimpleContext({
  name: "Server",
  init: (props: { conn: ServerConnection.Any; ctx: ServerCtx }) => {
    const conn = props.conn
    const key = ServerConnection.key(conn)

    const global = useGlobal()

    return {
      conn,
      key,
      isLocal: ServerConnection.local(props.conn),
      ctx: props.ctx,
      get health() {
        return global.servers.health[key]
      },
    }
  },
})

export const useServer = context.use



export function ServerProvider(props: ParentProps<{ conn: ServerConnection.Any }>) {
  const global = useGlobal()
  const key = ServerConnection.key(props.conn)

  const ctx = createMemo<ServerCtx>(
    (previous) => (global.servers.health[key]?.healthy ? global.serverCtx(key) : undefined) ?? previous,
    global.ensureServerCtx(props.conn),
  )

  return (
    <Show when={ctx()} keyed>
      {(ctx) => (
        <context.provider conn={props.conn} ctx={ctx}>
          {props.children}
        </context.provider>
      )}
    </Show>
  )
}

export const useData = () => {
  const server = useServer()

  return server.ctx.data
}
