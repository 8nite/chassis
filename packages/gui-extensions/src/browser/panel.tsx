import { Popover } from "@kobalte/core/popover"
import { Button } from "@chassis/ui/button"
import { Icon } from "@chassis/ui/icon"
import type { IconName } from "@chassis/ui/icons/catalog"
import { IconButton } from "@chassis/ui/icon-button"
import { LineCommentEditor } from "@chassis/ui/line-comment"
import { Loader } from "@chassis/ui/loader"
import { Keybind } from "@chassis/ui/keybind"
import { Menu } from "@chassis/ui/menu"
import { showToast } from "@chassis/ui/toast"
import { Tooltip } from "@chassis/ui/tooltip"
import { createEventListener } from "@solid-primitives/event-listener"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { createMemo, For, on, onCleanup, Show, type Accessor, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import type { Browser } from "@chassis/plugin-browser/rpc"
import { createKeyed, useExtension, usePanel, type PanelTab, type MountedSession, type SessionScreen } from "../sdk"
import { addressParts, connection, loopback, resolveAddress, searches } from "./address"
import { commentNote, pageNote } from "./comment"
import { bare, completes, highlight, suggest, type Visit } from "./history"
import type { Model } from "./model"
import type { PaneElement } from "./ipc"
import { PageIcon } from "./page-icon"

type PaneState = {
  
  address: string
  editing: boolean
  
  kept: { followed: number; rejected: number } | undefined
  
  navigating: number | undefined
  
  typed: boolean
  
  active: number
  
  dismissed: boolean
  
  picking: { sessionKey: string; tabID: Browser.TabID } | undefined
  
  comment:
    | {
        sessionKey: string
        tabID: Browser.TabID
        url: string
        
        generation: number
        element: PaneElement
        draft: string
      }
    | undefined
  
  note: { sessionKey: string; tabID: Browser.TabID; url: string; title: string; draft: string } | undefined
  size: { width: number; height: number }
  editorHeight: number
}


const SUGGESTIONS = 5

const RECENT = 5

export default function SessionBrowserPane(props: {
  tab: Accessor<PanelTab>
  session: MountedSession
  screen: SessionScreen
  model: Model
}) {
  const extension = useExtension()
  const keybinds = extension.keybinds
  const desktop = extension.desktop
  const embeds = extension.embeds
  const system = extension.system
  const panel = usePanel()
  const visible = () => panel.visible()
  const state = () => props.model.tab(props.session, props.tab().id)
  const address = () => (state()?.url === "about:blank" ? "" : (state()?.url ?? ""))
  const failed = () => !!state()?.loadError
  const suspended = () => props.model.suspended(props.session)
  const command = (action: Browser.Action) => props.model.command(props.session, action)

  const page = () => {
    const tab = state()

    return tab ? props.model.page(props.session, tab.id) : undefined
  }

  const [store, setStore] = createStore<PaneState>({
    address: "",
    editing: false,
    kept: undefined,
    navigating: undefined,
    typed: false,
    active: -1,
    dismissed: false,
    picking: undefined,
    comment: undefined,
    note: undefined,
    size: { width: 0, height: 0 },
    editorHeight: 0,
  })

  
  
  const settled = createMemo(
    on(
      () => !!state()?.loading,
      (loading, previous, count: number = 0) => (previous && !loading ? count + 1 : count),
    ),
  )

  
  
  const followed = createMemo(
    on([() => state()?.id, address, settled], (_input, _previous, count: number = 0) => count + 1),
  )

  
  const rejected = createMemo(
    on(
      () => props.model.error(props.session),
      (error, _previous, count: number = 0) => (error ? count + 1 : count),
    ),
  )

  
  const moved = createMemo(
    on(
      [() => state()?.id, () => state()?.generation, () => state()?.loading, rejected],
      (_input, _previous, count: number = 0) => count + 1,
    ),
  )

  
  const navigating = () => store.navigating === moved()

  
  
  const field = () => {
    if (store.editing) return store.address
    const kept = store.kept

    return kept?.followed === followed() && kept.rejected === rejected() ? store.address : address()
  }

  const empty = () => !address() && !state()?.loading && !navigating()
  
  
  const shown = () => visible() && !empty() && !failed()

  const embed = () => {
    const tab = state()

    return tab ? props.model.embed(props.session, tab.id) : undefined
  }

  let box: HTMLDivElement | undefined
  let input: HTMLInputElement | undefined
  let anchor: HTMLFormElement | undefined

  const error = () => {
    const value = props.model.error(props.session)

    if (value === "browser.pane.replaced") return extension.t("replaced")

    if (value === "browser.pane.unsupported") return extension.t("unsupported")

    return value
  }

  const inspectable = () => !!address() && !failed() && !suspended()
  const picking = () => store.picking?.sessionKey === props.session.key && store.picking?.tabID === state()?.id
  
  const commenting = () => store.comment?.sessionKey === props.session.key && store.comment?.tabID === state()?.id
  const noting = () => store.note?.sessionKey === props.session.key && store.note?.tabID === state()?.id

  
  const parts = () => addressParts(field())
  const site = () => !!field() && !store.editing

  
  const suggestions = createMemo(() =>
    store.editing && store.typed ? suggest(props.model.visits(), store.address, SUGGESTIONS) : [],
  )

  const listed = () => suggestions().length > 0 && !store.dismissed
  const chosen = () => (listed() ? suggestions()[store.active] : undefined)
  const recent = () => props.model.visits().slice(0, RECENT)

  
  
  const reachable = () => {
    const url = address()

    if (!URL.canParse(url)) return false
    const parsed = new URL(url)

    if (parsed.protocol === "file:") return props.session.server.local

    return /^https?:$/.test(parsed.protocol) && (props.session.server.local || !loopback(parsed.hostname))
  }

  const setPicking = (current: NonNullable<PaneState["picking"]>, enabled: boolean) => {
    props.model.inspect({ key: current.sessionKey }, current.tabID, enabled)
    setStore("picking", enabled ? current : undefined)
  }

  const closeComment = () => {
    const current = store.comment

    if (!current) return
    props.model.highlight({ key: current.sessionKey }, current.tabID)
    setStore("comment", undefined)
  }

  const closeNote = () => setStore("note", undefined)

  const toggleInspect = () => {
    const tab = state()

    if (!tab || !inspectable()) return

    if (store.comment) closeComment()
    closeNote()
    setPicking({ sessionKey: props.session.key, tabID: tab.id }, !picking())
  }

  const focusAddress = () => {
    input?.focus()
    input?.select()
  }

  
  
  
  const go = (url: string) => {
    const tab = state()

    if (!tab) return
    setStore({
      editing: false,
      typed: false,
      active: -1,
      address: url === "about:blank" ? "" : url,
      navigating: moved(),
      kept: { followed: followed(), rejected: rejected() },
    })
    command({ type: "navigate", tabID: tab.id, url })
    input?.blur()
  }

  const step = (by: number) => {
    const count = suggestions().length

    if (!count) return
    setStore({
      dismissed: false,
      active: store.active + by < -1 ? count - 1 : ((store.active + by + 1) % (count + 1)) - 1,
    })
  }

  const submitComment = (value: string) => {
    const current = store.comment

    if (!current) return
    const tab = state()

    
    const live =
      props.session.key === current.sessionKey && tab?.id === current.tabID && tab.generation === current.generation

    
    props.screen.composer.attach(
      commentNote({
        origin: extension.id,
        tabID: current.tabID,
        url: current.url,
        element: {
          ref: live ? current.element.ref : undefined,
          selector: current.element.selector,
          label: current.element.label,
          role: current.element.role,
          name: current.element.name,
          text: current.element.text,
        },
        comment: value,
      }),
    )
    closeComment()
  }

  const openNote = () => {
    const tab = state()

    if (!tab || !address()) return

    
    if (noting()) return

    if (picking() && store.picking) setPicking(store.picking, false)
    closeComment()
    setStore("note", { sessionKey: props.session.key, tabID: tab.id, url: tab.url, title: tab.title, draft: "" })
  }

  const submitNote = (value: string) => {
    const current = store.note

    if (!current) return
    props.screen.composer.attach(
      pageNote({
        origin: extension.id,
        tabID: current.tabID,
        url: current.url,
        title: current.title,
        label: current.title || addressParts(current.url).host || current.url,
        comment: value,
      }),
    )
    closeNote()
  }

  const zoomed = () => !!address() && (page()?.zoom ?? 1) !== 1

  const zoomPage = (direction: "in" | "out" | "reset") => {
    const tab = state()

    if (tab) props.model.zoom(props.session, tab.id, direction)
  }

  const copyLink = () => {
    const url = address()

    if (!url) return
    void system.copy(url).then(
      () => showToast({ title: extension.t("common.copied") }),
      () => showToast({ title: extension.t("common.requestFailed") }),
    )
  }

  
  const spotlight = () => {
    const rect = store.comment?.element.rect

    if (!rect) return
    const zoom = desktop?.zoom() ?? 1

    return { x: rect.x / zoom, y: rect.y / zoom, width: rect.width / zoom, height: rect.height / zoom }
  }

  const placement = () => {
    const rect = spotlight()

    if (!rect) return
    const gap = 8
    const width = Math.max(0, Math.min(400, store.size.width - gap * 2))
    
    const maxHeight = Math.max(0, store.size.height - gap * 2)
    
    const height = Math.min(store.editorHeight || 176, maxHeight)
    const left = Math.min(Math.max(gap, rect.x), Math.max(gap, store.size.width - width - gap))
    const below = rect.y + rect.height + gap
    const above = rect.y - gap - height

    const top =
      below + height <= store.size.height - gap
        ? below
        : above >= gap
          ? above
          : Math.max(gap, store.size.height - height - gap)

    return { left, top, width, maxHeight }
  }

  onCleanup(
    props.model.mount({
      visible,
      address,
      reload: () => {
        const tab = state()

        if (tab) command({ type: "reload", tabID: tab.id })
      },
      inspectable,
      inspect: toggleInspect,
      focusAddress,
    }),
  )

  
  createKeyed(
    () => props.session.key,
    (sessionKey) =>
      onCleanup(
        props.model.onInspect({ key: sessionKey }, (event) => {
          if (event.active) {
            setStore("picking", { sessionKey, tabID: event.tabID })

            return
          }

          if (store.picking?.sessionKey === sessionKey && store.picking.tabID === event.tabID)
            setStore("picking", undefined)

          if (!event.element) return
          const tab = state()

          if (tab?.id !== event.tabID || !visible()) {
            props.model.highlight({ key: sessionKey }, event.tabID)

            return
          }

          setStore("comment", {
            sessionKey,
            tabID: tab.id,
            url: tab.url,
            generation: tab.generation,
            element: event.element,
            draft: "",
          })
        }),
      ),
  )

  
  createKeyed(
    () => props.session.key,
    (sessionKey) =>
      onCleanup(
        props.model.onAddress({ key: sessionKey }, (tabID) => {
          if (tabID === state()?.id && visible()) focusAddress()
        }),
      ),
  )

  
  createKeyed(
    () => (visible() && empty() ? state()?.id : undefined),
    () => {
      if (props.model.opened(props.session)) focusAddress()
    },
  )

  
  
  const endPicker = () => {
    const current = store.picking

    if (current && (current.sessionKey !== props.session.key || current.tabID !== state()?.id || !visible()))
      setPicking(current, false)
  }

  onCleanup(() => {
    if (store.picking) setPicking(store.picking, false)
    closeComment()
  })

  createKeyed(visible, endPicker, { otherwise: endPicker })
  createKeyed(
    () => {
      const tab = state()

      return tab ? { session: props.session.key, tabID: tab.id } : undefined
    },
    (current) => {
      endPicker()

      if (store.comment?.sessionKey !== current.session || store.comment.tabID !== current.tabID) closeComment()

      if (store.note?.sessionKey !== current.session || store.note.tabID !== current.tabID) closeNote()
    },
    {
      equals: (previous, next) => previous.session === next.session && previous.tabID === next.tabID,
      otherwise: () => {
        endPicker()
        closeComment()
        closeNote()
      },
    },
  )
  
  createEventListener(
    window,
    "keydown",
    (event) => {
      if (event.key !== "Escape" || !store.picking) return
      event.preventDefault()
      event.stopPropagation()
      setPicking(store.picking, false)
    },
    { capture: true },
  )
  createResizeObserver(
    () => box,
    (rect) => setStore("size", { width: rect.width, height: rect.height }),
  )

  
  createKeyed(
    () => {
      const tab = state()

      return tab && shown() && !embed() ? tab.id : undefined
    },
    (tabID) => props.model.load(props.session, tabID),
  )

  const tip = (label: string, keys?: readonly string[]): JSX.Element => (
    <div class="flex items-center gap-2">
      <span>{label}</span>
      <Show when={keys && keys.length > 0}>
        <Keybind keys={[...(keys ?? [])]} variant="neutral" />
      </Show>
    </div>
  )

  return (
    <aside id="browser-panel" class="relative size-full min-w-0 overflow-hidden bg-v2-background-bg-base flex flex-col">
      <div
        data-component="browser-bar"
        class="h-11 shrink-0 flex items-center gap-2 px-3 border-b-[0.5px] border-v2-border-border-muted"
      >
        <div class="flex shrink-0 items-center">
          <For each={["back", "forward"] as const}>
            {(direction) => (
              <Tooltip placement="top" value={extension.t(direction === "back" ? "common.goBack" : "common.goForward")}>
                <IconButton
                  variant="ghost-muted"
                  size="large"
                  disabled={!state()?.[direction === "back" ? "canGoBack" : "canGoForward"]}
                  aria-label={extension.t(direction === "back" ? "common.goBack" : "common.goForward")}
                  onClick={() => {
                    const tab = state()

                    if (tab) command({ type: direction, tabID: tab.id })
                  }}
                  icon={<Icon name={direction === "back" ? "outline-arrow-left" : "outline-arrow-right"} />}
                />
              </Tooltip>
            )}
          </For>
          <Tooltip
            placement="top"
            value={
              state()?.loading
                ? extension.t("action.stop")
                : tip(extension.t("action.reload"), keybinds.keybind("browser.reload"))
            }
          >
            <IconButton
              variant="ghost-muted"
              size="large"
              disabled={!state()?.loading && !address()}
              aria-label={extension.t(state()?.loading ? "action.stop" : "action.reload")}
              onClick={() => {
                const tab = state()

                if (tab) command({ type: tab.loading ? "stop" : "reload", tabID: tab.id })
              }}
              icon={
                <Show when={state()?.loading} fallback={<Icon name="outline-rotate-clockwise" />}>
                  <Loader />
                </Show>
              }
            />
          </Tooltip>
        </div>
        <Popover
          open={store.editing && listed()}
          anchorRef={() => anchor}
          placement="bottom-start"
          gutter={4}
          
          shift={-8}
          modal={false}
        >
          <form
            ref={anchor}
            dir="ltr"
            data-component="browser-address"
            data-editing={store.editing ? "" : undefined}
            data-site={site() ? "" : undefined}
            data-address={store.editing && !store.typed && field() ? "" : undefined}
            onPointerDown={(event) => {
              
              if (event.target === event.currentTarget) {
                event.preventDefault()
                input?.focus()
              }
            }}
            onSubmit={(event) => {
              event.preventDefault()
              const picked = chosen()
              const text = field().trim()

              if (picked) return go(picked.url)

              if (text || failed()) return go(resolveAddress(text))
              input?.blur()
            }}
          >
            {}
            <Show
              when={site()}
              fallback={
                <PageIcon
                  icon={store.editing && field() ? (store.typed ? chosen()?.icon : page()?.icon) : undefined}
                  class="text-v2-icon-icon-muted"
                />
              }
            >
              {}
              <Show when={`${props.session.key}\n${state()?.id}\n${address()}`} keyed>
                <SiteInformation
                  url={address()}
                  server={props.session.server.local ? undefined : props.session.server.name}
                  site={() => {
                    const tab = state()

                    return tab ? props.model.site(props.session, tab.id) : undefined
                  }}
                  clear={() => {
                    const tab = state()

                    return tab ? props.model.clearSite(props.session, tab.id) : undefined
                  }}
                />
              </Show>
            </Show>
            <div data-slot="browser-address-text">
              <input
                ref={input}
                data-slot="browser-address-input"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={store.editing && listed()}
                aria-controls={listed() ? "browser-suggestions" : undefined}
                aria-activedescendant={chosen() ? `browser-suggestion-${store.active}` : undefined}
                spellcheck={false}
                autocomplete="off"
                value={field()}
                disabled={!state()}
                placeholder={extension.t("address.search")}
                aria-label={extension.t("address.label")}
                onFocus={(event) => {
                  setStore({ editing: true, address: field(), typed: false, active: -1, dismissed: false })
                  event.currentTarget.select()
                }}
                
                
                
                onBlur={(event) => {
                  if (store.editing) setStore({ editing: false, typed: false, active: -1, kept: undefined })

                  if (!document.hasFocus()) event.currentTarget.blur()
                }}
                onInput={(event) => {
                  const value = event.currentTarget.value
                  const first = suggest(props.model.visits(), value, 1)[0]

                  
                  const complete =
                    !!first && !event.inputType.startsWith("delete") && (completes(first, value) || searches(value))

                  setStore({ address: value, typed: true, dismissed: false, active: complete ? 0 : -1 })
                }}
                onKeyDown={(event) => {
                  
                  
                  if (event.isComposing || event.keyCode === 229) return

                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    if (!suggestions().length) return
                    event.preventDefault()
                    step(event.key === "ArrowDown" ? 1 : -1)

                    return
                  }

                  if (event.key !== "Escape") return
                  event.preventDefault()

                  if (listed()) return setStore({ dismissed: true, active: -1 })
                  event.currentTarget.blur()
                }}
              />
              {}
              <Show when={!store.editing && field()}>
                <div aria-hidden="true" data-slot="browser-address-display">
                  <span data-slot="browser-address-url" data-host={parts().host ? "" : undefined}>
                    <span data-slot="browser-address-muted">{parts().scheme}</span>
                    <span data-slot="browser-address-host">{parts().host}</span>
                    {parts().rest}
                  </span>
                </div>
              </Show>
              {}
              <Show when={store.editing && store.address.length <= 48 && chosen()}>
                {(visit) => (
                  <div aria-hidden="true" data-slot="browser-address-hint">
                    <span class="invisible shrink-0">{store.address}</span>
                    <span class="ms-1.5 min-w-0 truncate">{`- ${bare(visit().url)}`}</span>
                  </div>
                )}
              </Show>
            </div>
            {}
            <Show when={zoomed()}>
              <Tooltip placement="top" value={extension.t("zoom.reset")}>
                <button
                  type="button"
                  data-slot="browser-address-zoom"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => zoomPage("reset")}
                >
                  {extension.t("zoom.percent", { percent: Math.round((page()?.zoom ?? 1) * 100) })}
                </button>
              </Tooltip>
            </Show>
            <Show when={address()}>
              <div data-slot="browser-address-actions">
                <Tooltip placement="top" value={extension.t("page.add")}>
                  <IconButton
                    type="button"
                    variant="ghost-muted"
                    size="small"
                    aria-label={extension.t("page.add")}
                    disabled={suspended() || failed()}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={openNote}
                    icon={<Icon name="outline-globe-plus" />}
                  />
                </Tooltip>
                <Tooltip placement="top" value={extension.t(reachable() ? "external.open" : "external.unavailable")}>
                  <IconButton
                    type="button"
                    variant="ghost-muted"
                    size="small"
                    aria-label={extension.t("external.open")}
                    disabled={!reachable()}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => system.openExternal(address())}
                    icon={<Icon name="outline-arrow-up-right" />}
                  />
                </Tooltip>
              </div>
            </Show>
          </form>
          <Popover.Portal>
            <Popover.Content
              data-component="browser-suggestions"
              onOpenAutoFocus={(event) => event.preventDefault()}
              onCloseAutoFocus={(event) => event.preventDefault()}
            >
              <div id="browser-suggestions" role="listbox" aria-label={extension.t("address.suggestions")}>
                <For each={suggestions()}>
                  {(visit, index) => (
                    <PageRow
                      visit={visit}
                      query={store.address}
                      option={{ id: `browser-suggestion-${index()}`, selected: index() === store.active }}
                      onClick={() => go(visit.url)}
                    />
                  )}
                </For>
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover>
        <div class="flex shrink-0 items-center gap-1">
          <Tooltip
            placement="top"
            value={
              <div class="flex flex-col gap-1">
                {tip(extension.t("inspect"), keybinds.keybind("browser.inspect"))}
                {}
                {tip(extension.t("inspect.pageShortcut"), keybinds.keys("mod+shift+c"))}
              </div>
            }
          >
            {}
            <IconButton
              variant="ghost-muted"
              size="large"
              data-action="browser-inspect"
              disabled={!inspectable()}
              state={picking() ? "pressed" : undefined}
              classList={{ "!text-v2-icon-icon-accent": picking() || commenting() }}
              aria-pressed={picking()}
              aria-label={extension.t("inspect")}
              onClick={toggleInspect}
              icon={<Icon name="outline-browser-annotate" />}
            />
          </Tooltip>
          <Menu gutter={4} modal={false} placement="bottom-end">
            <Tooltip placement="top" value={extension.t("options")}>
              <Menu.Trigger
                as={IconButton}
                variant="ghost-muted"
                size="large"
                disabled={!state()}
                icon={<Icon name="outline-dots" />}
                aria-label={extension.t("options")}
              />
            </Tooltip>
            <Menu.Portal>
              <Menu.Content class="min-w-56">
                {}
                <Menu.Group>
                  <Menu.Item
                    disabled={!address()}
                    onSelect={() => zoomPage("in")}
                    shortcut={<Keybind keys={[...keybinds.keys("mod+plus")]} variant="neutral" />}
                  >
                    {extension.t("zoom.in")}
                  </Menu.Item>
                  <Menu.Item
                    disabled={!address()}
                    onSelect={() => zoomPage("out")}
                    shortcut={<Keybind keys={[...keybinds.keys("mod+-")]} variant="neutral" />}
                  >
                    {extension.t("zoom.out")}
                  </Menu.Item>
                  <Menu.Item
                    disabled={!zoomed()}
                    onSelect={() => zoomPage("reset")}
                    badge={extension.t("zoom.percent", { percent: Math.round((page()?.zoom ?? 1) * 100) })}
                  >
                    {extension.t("zoom.reset")}
                  </Menu.Item>
                </Menu.Group>
                <Menu.Separator />
                <Menu.Item disabled={!address()} onSelect={copyLink}>
                  {extension.t("link.copy")}
                </Menu.Item>
                <Menu.Item disabled={!reachable()} onSelect={() => system.openExternal(address())}>
                  {extension.t("external.open")}
                </Menu.Item>
                <Menu.Separator />
                <Menu.Item disabled={props.model.visits().length === 0} onSelect={() => props.model.clearHistory()}>
                  {extension.t("history.clear")}
                </Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu>
        </div>
      </div>
      <Show when={error() && !failed()}>
        <div
          class="shrink-0 px-3 py-1.5 text-12-regular text-v2-state-fg-danger border-b border-v2-border-border-muted"
          role="alert"
          aria-live="assertive"
        >
          {error()}
        </div>
      </Show>
      <embeds.View
        id={embed()}
        visible={shown()}
        frozen={commenting() || noting()}
        radius={10}
        class="relative min-h-0 flex-1 bg-v2-background-bg-base flex items-center justify-center"
      >
        <div ref={box} aria-hidden="true" class="pointer-events-none absolute inset-0" />
        <Show when={empty() && !failed() && !suspended()}>
          {}
          <div dir="auto" class="size-full overflow-y-auto">
            <div class="relative flex min-h-[max(100%,732px)] items-center justify-center px-6 pb-40">
              <div class="absolute inset-x-6 top-20 mx-auto flex max-w-[360px] flex-col items-center gap-4 text-center">
                <Icon name="outline-globe" size="large" class="text-v2-icon-icon-muted" />
                <div class="flex flex-col gap-2">
                  <div class="text-[13px] font-[530] leading-[var(--line-height-compact)] text-v2-text-text-base">
                    {extension.t("home.title")}
                  </div>
                  <div class="text-[13px] font-[440] leading-[var(--line-height-compact)] text-v2-text-text-muted">
                    {extension.t("home.description")}
                  </div>
                </div>
              </div>
              {}
              <Show when={recent().length > 0}>
                <div class="flex w-full max-w-[685px] flex-col gap-4">
                  <div class="px-2 text-[13px] font-[440] leading-[var(--line-height-compact)] text-v2-text-text-muted">
                    {extension.t("home.recent")}
                  </div>
                  <div class="flex flex-col gap-2">
                    <For each={recent()}>{(visit) => <PageRow visit={visit} onClick={() => go(visit.url)} />}</For>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        </Show>
        <Show when={failed() && !suspended()}>
          {}
          <div
            dir="auto"
            class="flex size-full flex-col items-center justify-center gap-2 p-6 pb-[200px] text-center text-text-weak"
          >
            <Icon name="globe" size="large" class="mb-2 shrink-0" />
            <div class="text-[13px] font-medium leading-[var(--line-height-compact)] text-text-strong">
              {extension.t("failed.title")}
            </div>
            <div class="text-13-regular leading-[var(--line-height-base)]">{extension.t("failed.description")}</div>
          </div>
        </Show>
        <Show when={suspended()}>
          <p class="px-6 text-center text-13-regular text-v2-text-text-subtle" role="status">
            {extension.t("suspended")}
          </p>
        </Show>
        <Show when={commenting() && store.comment}>
          {(current) => (
            <div
              data-component="browser-comment"
              class="absolute inset-0 z-10"
              onPointerDown={(event) => {
                
                if (event.target === event.currentTarget && !current().draft.trim()) closeComment()
              }}
            >
              <Show when={spotlight()}>
                {(rect) => (
                  <div
                    data-slot="browser-comment-spotlight"
                    class="pointer-events-none absolute rounded-[2px]"
                    style={{
                      left: `${rect().x}px`,
                      top: `${rect().y}px`,
                      width: `${rect().width}px`,
                      height: `${rect().height}px`,
                    }}
                  />
                )}
              </Show>
              <Show when={placement()}>
                {(position) => (
                  <div
                    ref={(element) =>
                      createResizeObserver(element, (rect) => setStore("editorHeight", Math.ceil(rect.height)))
                    }
                    data-slot="browser-comment-editor"
                    data-prevent-autofocus
                    class="absolute overflow-y-auto rounded-[6px] shadow-[var(--v2-elevation-raised)]"
                    style={{
                      left: `${position().left}px`,
                      top: `${position().top}px`,
                      width: `${position().width}px`,
                      "max-height": `${position().maxHeight}px`,
                    }}
                  >
                    <LineCommentEditor
                      value={current().draft}
                      onInput={(value) => setStore("comment", "draft", value)}
                      onCancel={closeComment}
                      onSubmit={submitComment}
                      mention={{
                        items: (query) => props.screen.file.search(query, { kind: "any" }),
                      }}
                      selection={
                        <span class="flex min-w-0 items-center gap-1" dir="ltr">
                          <Icon name="select-element" size="small" class="shrink-0" />
                          <span class="min-w-0 truncate leading-[var(--line-height-tight)]">
                            {current().element.label}
                          </span>
                        </span>
                      }
                    />
                  </div>
                )}
              </Show>
            </div>
          )}
        </Show>
        <Show when={noting() && store.note}>
          {(current) => (
            <div
              data-component="browser-comment"
              class="absolute inset-0 z-10"
              onPointerDown={(event) => {
                if (event.target === event.currentTarget && !current().draft.trim()) closeNote()
              }}
            >
              {}
              <div
                data-slot="browser-comment-editor"
                data-prevent-autofocus
                class="absolute end-2 top-2 overflow-y-auto rounded-[6px] shadow-[var(--v2-elevation-raised)]"
                style={{
                  width: `${Math.max(0, Math.min(400, store.size.width - 16))}px`,
                  "max-height": `${Math.max(0, store.size.height - 16)}px`,
                }}
              >
                <LineCommentEditor
                  value={current().draft}
                  onInput={(value) => setStore("note", "draft", value)}
                  onCancel={closeNote}
                  onSubmit={submitNote}
                  placeholder={extension.t("page.placeholder")}
                  mention={{
                    items: (query) => props.screen.file.search(query, { kind: "any" }),
                  }}
                  selection={
                    <span class="flex min-w-0 items-center gap-1" dir="ltr">
                      <Icon name="outline-globe" size="small" class="shrink-0" />
                      <span class="min-w-0 truncate leading-[var(--line-height-tight)]">
                        {current().title || addressParts(current().url).host || current().url}
                      </span>
                    </span>
                  }
                />
              </div>
            </div>
          )}
        </Show>
      </embeds.View>
      <p class="sr-only" role="status" aria-live="polite">
        {picking() ? extension.t("inspect.active") : ""}
      </p>
    </aside>
  )
}


function PageRow(props: {
  visit: Visit
  query?: string
  
  option?: { id: string; selected: boolean }
  onClick: () => void
}) {
  const body = () => (
    <>
      <PageIcon icon={props.visit.icon} class="text-v2-icon-icon-muted" />
      <span data-slot="browser-page-row-text">
        <Show when={props.visit.title}>
          <span data-slot="browser-page-row-title">
            <Marked text={props.visit.title} query={props.query ?? ""} />
          </span>
          <span>-</span>
        </Show>
        <span data-slot="browser-page-row-url">
          <Marked text={bare(props.visit.url)} query={props.query ?? ""} />
        </span>
      </span>
    </>
  )

  return (
    <Show
      when={props.option}
      fallback={
        <button type="button" data-component="browser-page-row" dir="ltr" onClick={() => props.onClick()}>
          {body()}
        </button>
      }
    >
      {(option) => (
        <div
          id={option().id}
          role="option"
          aria-selected={option().selected}
          data-component="browser-page-row"
          dir="ltr"
          
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => props.onClick()}
        >
          {body()}
        </div>
      )}
    </Show>
  )
}

function Marked(props: { text: string; query: string }) {
  return (
    <For each={highlight(props.text, props.query)}>
      {(part) => (
        <Show when={part.match} fallback={part.text}>
          <mark>{part.text}</mark>
        </Show>
      )}
    </For>
  )
}

const connections = {
  secure: { icon: "lock", title: "site.secure", description: undefined },
  insecure: { icon: "outline-hexagonal-warning", title: "site.insecure", description: "site.insecure.description" },
  local: { icon: "monitor", title: "site.local", description: "site.local.description" },
  file: { icon: "folder", title: "site.file", description: "site.file.description" },
} as const


function SiteInformation(props: {
  url: string
  server: string | undefined
  
  site: () => Promise<{ cookies: number }> | undefined
  clear: () => Promise<void> | undefined
}) {
  const extension = useExtension()

  
  const [state, setState] = createStore<{ open: boolean; cookies?: number; clearing: boolean; load: number }>({
    open: false,
    clearing: false,
    load: 0,
  })

  const kind = () => {
    const value = connection(props.url)

    return value ? connections[value] : undefined
  }

  
  const web = () => {
    const value = connection(props.url)

    return !!value && value !== "file"
  }

  const load = () => {
    const run = state.load + 1
    setState({ load: run, cookies: undefined })
    void props.site()?.then(
      (value) => {
        if (state.load === run) setState("cookies", value.cookies)
      },
      () => undefined,
    )
  }

  const clear = () => {
    setState("clearing", true)
    void (props.clear() ?? Promise.reject(new Error("browser.pane.unavailable")))
      .catch(() => showToast({ title: extension.t("common.requestFailed") }))
      .finally(() => {
        setState("clearing", false)
        load()
      })
  }

  return (
    <Popover
      open={state.open}
      placement="bottom-start"
      gutter={8}
      modal={false}
      onOpenChange={(open) => {
        setState("open", open)

        if (open) load()
      }}
    >
      <Tooltip placement="top" value={extension.t("site.info")}>
        <Popover.Trigger
          as={IconButton}
          type="button"
          variant="ghost-muted"
          size="small"
          aria-label={extension.t("site.info")}
          icon={<Icon name="outline-sliders" />}
        />
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          data-component="browser-site"
          
          onOpenAutoFocus={(event: Event) => {
            event.preventDefault()

            if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
          }}
        >
          <div class="flex items-center justify-between gap-2">
            <Popover.Title data-slot="browser-site-host" dir="ltr">
              {addressParts(props.url).host || props.url}
            </Popover.Title>
            {}
            <IconButton
              variant="ghost-muted"
              size="small"
              aria-label={extension.t("common.close")}
              icon={<Icon name="outline-xmark" />}
              onClick={() => setState("open", false)}
            />
          </div>
          <Show when={kind()}>
            {(value) => (
              <SiteRow
                icon={value().icon}
                title={extension.t(value().title)}
                detail={value().description ? extension.t(value().description ?? "") : undefined}
              />
            )}
          </Show>
          <Show when={web()}>
            <SiteRow
              icon="outline-cookie"
              title={extension.t("site.cookies")}
              detail={state.cookies === undefined ? undefined : extension.plural("site.cookies.count", state.cookies)}
            >
              <Button
                size="small"
                variant="neutral"
                disabled={state.clearing || state.cookies === undefined}
                onClick={clear}
              >
                {extension.t("site.cookies.clear")}
              </Button>
            </SiteRow>
            <SiteRow
              icon="outline-eye-slash"
              title={extension.t("site.permissions")}
              detail={extension.t("site.permissions.description")}
            />
          </Show>
          <SiteRow
            icon="select-element"
            title={extension.t("site.agent")}
            detail={extension.t("site.agent.description")}
          />
          <Show when={props.server}>
            {(server) => <SiteRow icon="server" title={extension.t("site.network", { server: server() })} />}
          </Show>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  )
}

function SiteRow(props: { icon: IconName; title: string; detail?: string; children?: JSX.Element }) {
  return (
    <div data-slot="browser-site-row">
      <Icon name={props.icon} class="shrink-0" />
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="text-v2-text-text-base">{props.title}</span>
        <Show when={props.detail}>{(detail) => <span data-slot="browser-site-detail">{detail()}</span>}</Show>
      </div>
      {props.children}
    </div>
  )
}
