import { createSignal, Show } from "solid-js"
import { Icon } from "@chassis/ui/icon"


export function PageIcon(props: { icon: string | undefined; class?: string }) {
  
  const [broken, setBroken] = createSignal<string>()

  return (
    <Show
      when={props.icon !== broken() ? props.icon : undefined}
      fallback={<Icon name="outline-globe" class={`pointer-events-none size-4 shrink-0 ${props.class ?? ""}`} />}
    >
      {(icon) => (
        <img
          src={icon()}
          alt=""
          class="pointer-events-none size-4 shrink-0 object-contain"
          onError={() => setBroken(icon())}
        />
      )}
    </Show>
  )
}
