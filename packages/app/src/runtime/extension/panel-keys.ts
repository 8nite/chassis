import type { Panel } from "@chassis/gui-extensions/sdk"


export function panelKey(extension: string, id: string) {
  return `${extension}:${id}`
}


export function legacyKeys(providers: readonly { readonly extension: string; readonly value: Panel }[]) {
  return new Map(
    providers.flatMap((item) =>
      Object.entries(item.value.legacy ?? {}).map(([key, id]) => [key, panelKey(item.extension, id)] as const),
    ),
  )
}
