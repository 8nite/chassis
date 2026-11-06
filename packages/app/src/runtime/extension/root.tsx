import { createMemo, lazy, onCleanup, Show, Suspense, type ParentProps } from "solid-js"
import { extensionEnabled } from "@chassis/gui-extensions/sdk/bridge"
import type { Definition } from "@chassis/gui-extensions/sdk"
import { builtins } from "./builtins"
import { createInstalled } from "./installed"
import { createMenubarItems, MenubarItemsProvider } from "./menubar-items"
import { usePlatform } from "@/runtime/platform/platform"
import { ExtensionHostProvider, useExtensionHost } from "./host"
import { createIpcClients } from "./ipc"
import { createExtensionAttachment, createHostApis, ExtensionAttachmentProvider, type HostApis } from "./host-apis"
import { ExtensionCommands } from "./commands"
import { ExtensionStyles } from "./render"
import { ExtensionServersProvider } from "./servers"
import { ExtensionServerEndpoints } from "./server-shell"
import { createContext, useContext } from "solid-js"

const HostApisContext = createContext<HostApis>()

const ExtensionHotReload = import.meta.env.DEV ? lazy(() => import("./hmr")) : undefined

export function useHostApis() {
  const value = useContext(HostApisContext)

  if (!value) throw new Error("Host APIs are unavailable")

  return value
}


export function ExtensionRoot(props: ParentProps) {
  const platform = usePlatform()
  const apis = createHostApis()
  const bridge = platform.extensions
  const menubar = createMenubarItems(bridge)
  const ipcs = createIpcClients(bridge)
  onCleanup(ipcs.dispose)
  const installed = createInstalled(bridge)

  const os = platform.platform === "desktop" ? platform.os : undefined

  
  const definitions = builtins.filter(
    (definition: Definition) => !definition.os || (!!os && definition.os.includes(os)),
  )

  
  const disabled = createMemo(() => {
    const state = installed.enableState()

    if (!state) return undefined

    return new Set(definitions.flatMap((definition) => (extensionEnabled(definition, state) ? [] : [definition.id])))
  })

  const failed = (id: string) => installed.list().some((item) => item.id === id && item.error !== undefined)

  return (
    <HostApisContext.Provider value={apis}>
      <ExtensionHostProvider
        definitions={definitions}
        disabled={disabled}
        apis={apis.apis}
        whenMounted={apis.whenMounted}
        ipc={bridge ? (token) => ipcs.client(token) : undefined}
        generation={ipcs.generation}
        failed={failed}
      >
        <ExtensionStyles />
        {ExtensionHotReload && (
          <Suspense>
            <ExtensionHotReload />
          </Suspense>
        )}
        <MenubarItemsProvider value={menubar}>
          <ExtensionServersProvider failed={failed}>{props.children}</ExtensionServersProvider>
        </MenubarItemsProvider>
      </ExtensionHostProvider>
    </HostApisContext.Provider>
  )
}


export function ExtensionAttachment(props: ParentProps) {
  const host = useExtensionHost()
  const attachment = createExtensionAttachment(useHostApis())

  return (
    <ExtensionAttachmentProvider value={attachment}>
      <ExtensionCommands />
      <ExtensionServerEndpoints />
      <Show when={host.ready()}>
        <MountedInterface attach={attachment.attach} />
        {props.children}
      </Show>
    </ExtensionAttachmentProvider>
  )
}


function MountedInterface(props: { attach: () => () => void }) {
  onCleanup(props.attach())

  return null
}
