import {
  createComponent,
  createContext,
  createMemo,
  ErrorBoundary,
  For,
  mergeProps,
  onCleanup,
  onMount,
  Show,
  useContext,
  type JSX,
  type ParentProps,
} from "solid-js"
import { isShallowEqual } from "remeda"
import type { SlotMap, SlotPath } from "@chassis/plugin/tui/context"
import type { SlotRender } from "./api"
import { contains, emptySlotted, type Claim } from "./structure"
import { useRoute } from "../context/route"
import { useToast } from "../ui/toast"
import { errorMessage } from "../util/error"
import { usePlugin } from "./context"



function PluginBoundary(props: ParentProps<{ id: string; where: string }>) {
  const toast = useToast()
  return (
    <ErrorBoundary
      fallback={(error) => {
        
        
        onMount(() =>
          toast.show({
            variant: "error",
            title: "Plugin",
            message: `${props.id} crashed in ${props.where}: ${errorMessage(error)}`,
          }),
        )
        return null
      }}
    >
      {props.children}
    </ErrorBoundary>
  )
}

export function PluginRoute(props: { readonly fallback: (id: string, name: string) => JSX.Element }) {
  const plugins = usePlugin()
  const route = useRoute()
  const current = createMemo(() => {
    if (route.data.type !== "plugin") return
    return {
      id: route.data.id,
      name: route.data.name,
      render: plugins.route(route.data.id, route.data.name),
      data: route.data.data,
    }
  })
  return (
    
    
    <Show keyed when={current()}>
      {(item) => (
        <PluginBoundary id={item.id} where="route">
          {item.render ? createComponent(item.render, { data: item.data }) : props.fallback(item.id, item.name)}
        </PluginBoundary>
      )}
    </Show>
  )
}


const SlotParent = createContext<string>()


type SlotProps<Path extends SlotPath> = ParentProps<{ readonly path: Path }> &
  ({} extends SlotMap[Path] ? { readonly input?: SlotMap[Path] } : { readonly input: SlotMap[Path] })






export function Slot<Path extends SlotPath>(props: SlotProps<Path>) {
  const plugins = usePlugin()
  
  
  
  const path = props.path
  
  
  
  const parent = useContext(SlotParent)
  if (parent !== undefined && !contains(parent, path)) {
    throw new Error(`Slot "${path}" is mounted inside "${parent}" but its path does not extend it`)
  }
  onCleanup(plugins.slots.register(path))
  const input = () => (props as { readonly input?: SlotMap[Path] }).input ?? ({} as SlotMap[Path])
  const slotted = createMemo(
    () => plugins.slots.resolved().slotted.get(path) ?? emptySlotted<SlotRender>(),
    emptySlotted<SlotRender>(),
    
    
    {
      equals: (a, b) =>
        isShallowEqual(a.before, b.before) &&
        isShallowEqual(a.prepend, b.prepend) &&
        isShallowEqual(a.append, b.append) &&
        isShallowEqual(a.after, b.after) &&
        a.replace === b.replace,
    },
  )
  
  
  
  const contribution = (claim: Claim<SlotRender>) => (
    <PluginBoundary id={claim.plugin} where={`slot ${path}`}>
      {createComponent(claim.render, mergeProps(input))}
    </PluginBoundary>
  )
  return (
    <>
      <For each={slotted().before}>{contribution}</For>
      {}
      <SlotParent.Provider value={path}>
        <Show
          keyed
          when={slotted().replace}
          fallback={
            <>
              <For each={slotted().prepend}>{contribution}</For>
              {props.children}
              <For each={slotted().append}>{contribution}</For>
            </>
          }
        >
          {contribution}
        </Show>
      </SlotParent.Provider>
      <For each={slotted().after}>{contribution}</For>
    </>
  )
}
