import { HoverCard } from "@kobalte/core/hover-card"
import { createSignal, Show, type JSXElement } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { createMediaQuery } from "@solid-primitives/media"
import "./tab-popover.css"


const OPEN_DELAY = 750


const CLOSE_DELAY = 0




const SKIP_WINDOW = 500

let lastClosedAt = 0

export interface TabPreviewData {
  projectName?: string
  title?: string
  path?: string
  serverName?: string
}

export function TabPreviewPopover(props: {
  trigger: JSXElement
  open: boolean
  onOpenChange: (open: boolean) => void
  data: TabPreviewData
  orientation?: "horizontal" | "vertical"
}) {
  const language = useLanguage()
  const mobile = createMediaQuery("(max-width: 767px)")
  let triggerEl: HTMLDivElement | undefined
  
  
  
  const [instant, setInstant] = createSignal(false)

  const warm = () => Date.now() - lastClosedAt < SKIP_WINDOW
  
  
  const resolveOpenDelay = () => (warm() ? 0 : OPEN_DELAY)

  const handleOpenChange = (open: boolean) => {
    if (open) setInstant(warm())
    else lastClosedAt = Date.now()
    props.onOpenChange(open)
  }

  
  
  const placement = () =>
    props.orientation === "vertical" ? (language.direction() === "rtl" ? "left-start" : "right-start") : "bottom-start"

  return (
    <HoverCard
      open={props.open && !mobile()}
      onOpenChange={handleOpenChange}
      openDelay={resolveOpenDelay()}
      closeDelay={CLOSE_DELAY}
      
      
      ignoreSafeArea
      placement={placement()}
      gutter={6}
    >
      <HoverCard.Trigger ref={triggerEl} as="div" data-component="session-tab-popover-trigger" tabIndex={-1}>
        {props.trigger}
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          ref={(el) => {
            
            
            const theme = triggerEl?.closest("[data-theme]")?.getAttribute("data-theme")

            if (theme) el.setAttribute("data-theme", theme)
          }}
          data-component="session-tab-popover"
          data-instant={instant() || undefined}
        >
          <div data-slot="header">
            <Show when={props.data.projectName}>
              <span data-slot="project">{props.data.projectName}</span>
            </Show>
            <Show when={props.data.title}>
              <span data-slot="title">{props.data.title}</span>
            </Show>
          </div>

          <Show when={props.data.path}>
            <div data-slot="row">
              <span data-slot="detail">{props.data.path}</span>
            </div>
          </Show>

          <Show when={props.data.serverName}>
            <div data-slot="server">{props.data.serverName}</div>
          </Show>
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard>
  )
}
