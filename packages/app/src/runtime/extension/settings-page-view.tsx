import { For } from "solid-js"
import { Tabs } from "@chassis/ui/tabs"
import { useSettingsSurface } from "@/settings/surface"
import { Contribution } from "./render"


export function ExtensionSettingsPages() {
  const surface = useSettingsSurface()

  return (
    <For each={surface.extensions.pages()}>
      {(item) => (
        <Tabs.Content value={item.value.id} class="settings-panel">
          <Contribution extension={item.extension}>
            {() =>
              item.value.render({
                get target() {
                  const view = surface.view()

                  return view.tab === item.value.id ? view.target : undefined
                },
              })
            }
          </Contribution>
        </Tabs.Content>
      )}
    </For>
  )
}


export function ExtensionSettingsSections(props: { page: "general" | "servers"; section?: "general" }) {
  const surface = useSettingsSurface()

  return (
    <For each={surface.extensions.sections(props.page, props.section)}>
      {(item) => (
        <Contribution extension={item.extension}>
          {() =>
            item.value.render({
              get target() {
                return surface.view().target
              },
            })
          }
        </Contribution>
      )}
    </For>
  )
}
