import { createComponent, createContext, useContext, type Accessor, type Component, type JSX } from "solid-js"
import type { Context, SetupContext } from "./context"
import type { Definition } from "./core"


export const ExtensionContext = createContext<Context>()


export const LifetimeContext = createContext<{
  
  readonly ended: boolean
}>()


export function useExtension<D extends Definition = never>() {
  const context = useContext(ExtensionContext)

  if (!context) throw new Error("useExtension must run inside an extension contribution")

  
  return context as [D] extends [never] ? Context : SetupContext<D>
}


export function bindExtension<P extends object>(component: Component<P>): Component<P> {
  const context = useExtension()

  return (props) =>
    createComponent(ExtensionContext.Provider, {
      value: context,
      get children() {
        return createComponent(component, props)
      },
    })
}


export interface PanelSidebar {
  
  opened(): boolean
  
  width(): number
  
  transition(): boolean
  
  resize(width: number): void
  
  toggle(): void
}


export interface PanelFrame {
  
  readonly visible: Accessor<boolean>
  
  readonly present: Accessor<boolean>
  
  readonly placement: Accessor<"side" | "bottom" | "mobile">
  
  readonly reserve: Accessor<boolean>
  
  readonly animate: Accessor<boolean>
  
  readonly sidebar: PanelSidebar
  
  readonly open: Accessor<readonly string[]>
}


export const PanelContext = createContext<PanelFrame>()


export function usePanel() {
  const frame = useContext(PanelContext)

  if (!frame) throw new Error("usePanel must run inside a panel render")

  return frame
}


export const DrawerContext = createContext<{
  
  readonly close: () => void
  
  readonly open: (view: {
    
    readonly title: string
    
    readonly content: JSX.Element
    
    readonly trigger: HTMLElement
  }) => void
}>()


export function useDrawer() {
  return useContext(DrawerContext)
}


export function onIdle(fn: () => void) {
  if (typeof requestIdleCallback !== "undefined") {
    const id = requestIdleCallback(fn)

    return () => cancelIdleCallback(id)
  }

  const id = setTimeout(fn, 200)

  return () => clearTimeout(id)
}
