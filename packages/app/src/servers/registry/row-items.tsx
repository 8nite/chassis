import { Menu } from "@chassis/ui/menu"
import { For } from "solid-js"
import { useServerRowItems } from "@/runtime/extension/servers"


export function ServerRowItems(props: { server: string }) {
  const items = useServerRowItems(() => props.server)

  return (
    <For each={items()}>
      {(item) => (
        <Menu.Item disabled={item.enabled?.(props.server) === false} onSelect={() => item.run(props.server)}>
          {item.title}
        </Menu.Item>
      )}
    </For>
  )
}
