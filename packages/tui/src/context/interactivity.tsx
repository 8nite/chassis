import { createContext, createMemo, getOwner, useContext, type Accessor, type ParentProps } from "solid-js"

const Context = createContext<Accessor<boolean>>(() => true)


export function InteractivityProvider(props: ParentProps<{ enabled: boolean }>) {
  const parent = useInteractivity()
  const enabled = createMemo(() => parent() && props.enabled)
  return <Context.Provider value={enabled}>{props.children}</Context.Provider>
}


export function useInteractivity() {
  return useContext(Context)
}


export function resolveInteractivity(fallback: Accessor<boolean>) {
  return getOwner() ? useInteractivity() : fallback
}
