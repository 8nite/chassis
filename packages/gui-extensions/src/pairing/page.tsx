import { Button } from "@chassis/ui/button"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@chassis/ui/dialog"
import { Icon } from "@chassis/ui/icon"
import { RadioGroup, RadioItem } from "@chassis/ui/radio"
import { Switch } from "@chassis/ui/switch"
import { TextInput } from "@chassis/ui/text-input"
import { Tooltip } from "@chassis/ui/tooltip"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { createMemo, createSignal, For, onCleanup, Show, type Accessor, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { renderSVG } from "uqr"
import { useExtension, type Live, type IpcClient } from "../sdk"
import type { Pairing } from "./contract"
import type definition from "./index"
import { customAddress, pairingRoutes, type PairingRoute, type RouteKind } from "./routes"

type Client = IpcClient<typeof Pairing.spec>


export type PairingServer = {
  readonly client: {
    readonly server: {
      info(options: { signal: AbortSignal }): Promise<{ readonly urls: readonly string[] }>
      pair(options: { signal: AbortSignal }): Promise<{ readonly code: string; readonly expires_in: number }>
    }
  }
}


const LISTEN_COMMAND = "chassis service set hostname 0.0.0.0"

export default function PairingPage(props: {
  server: Accessor<PairingServer | undefined>
  pairing: Accessor<Live<Client>>
}) {
  const ctx = useExtension<typeof definition>()
  
  const dialogs = ctx.dialogs
  const system = ctx.system
  const links = ctx.stores.links
  const queryClient = useQueryClient()
  const [custom, setCustom] = createStore({ draft: links.value.custom, invalid: false })

  const local = useQuery(() => ({
    queryKey: [ctx.id, "local"],
    queryFn: (input) => {
      const server = props.server()

      if (!server) throw new Error("The local server is not listed")

      return server.client.server.info({ signal: input.signal })
    },
    enabled: !!props.server(),
    
    gcTime: 0,
  }))

  
  const localInfo = () => (local.isSuccess ? local.data : undefined)

  
  
  const routes = createMemo(() => pairingRoutes(localInfo()?.urls ?? [], customAddress(custom.draft.trim()) ?? ""))

  
  
  const listensLocally = () => local.isSuccess && pairingRoutes(local.data.urls, "").length === 0

  const code = async (signal: AbortSignal) => {
    const server = props.server()

    if (!server) throw new Error("The local server is not listed")
    const pairing = await server.client.server.pair({ signal })

    return { code: pairing.code, expiresIn: pairing.expires_in }
  }

  
  const display = () => {
    const live = props.pairing()

    return live.status === "active" ? live : undefined
  }

  const screenActive = useQuery(() => ({
    queryKey: [ctx.id, "screen-active", display()?.generation],
    queryFn: (input) => {
      const live = display()

      if (!live) throw new Error("Pairing's main side is not active")

      return live.value.screenActive({ signal: input.signal })
    },
    enabled: !!display(),
    gcTime: 0,
  }))

  const screenActivity = useMutation(() => ({
    mutationFn: (enabled: boolean) => {
      const live = display()

      if (!live) throw new Error("Pairing's main side is not active")

      return live.value.setScreenActive(enabled)
    },
    onSuccess: (_, enabled) => queryClient.setQueryData([ctx.id, "screen-active", display()?.generation], enabled),
  }))

  
  const commandCopied: CopiedTimer = {}
  onCleanup(() => clearTimeout(commandCopied.timeout))

  const copyCommand = useMutation(() => ({
    mutationFn: () => system.copy(LISTEN_COMMAND),
    onMutate: () => clearTimeout(commandCopied.timeout),
    onSuccess: () => {
      commandCopied.timeout = setTimeout(() => copyCommand.reset(), 2000)
    },
  }))

  const saveCustom = () => {
    const draft = custom.draft.trim()
    const address = draft ? customAddress(draft) : ""

    if (address === undefined) return void setCustom("invalid", true)
    setCustom({ draft: address, invalid: false })

    if (address === links.value.custom) return
    links.update((value) => {
      value.custom = address

      
      if (address) value.selected = address
    })
  }

  return (
    <>
      <div class="settings-tab-header">
        <div class="settings-tab-header-row">
          <div class="flex flex-col gap-1">
            <h2 class="settings-tab-title">{ctx.t("title")}</h2>
            <span class="text-11-regular text-v2-text-text-muted">{ctx.t("description")}</span>
          </div>
        </div>
      </div>

      <div class="settings-tab-body settings-tab-body--sectioned">
        <section class="settings-section" aria-label={ctx.t("connection")}>
          <div data-component="settings-list">
            <Row title={ctx.t("connection")} description={ctx.t("local.description")}>
              <Show when={routes().length > 0}>
                <Button
                  variant="neutral"
                  onClick={() => {
                    saveCustom()
                    dialogs.open(() => (
                      <DialogPairing
                        title={ctx.t("connection")}
                        routes={routes}
                        selected={() => links.value.selected}
                        onSelect={(url) =>
                          links.update((value) => {
                            value.selected = url
                          })
                        }
                        code={code}
                      />
                    ))
                  }}
                >
                  {ctx.t("local.open")}
                </Button>
              </Show>
            </Row>
            <Show when={listensLocally()}>
              <div class="flex flex-col gap-2 py-4" role="status">
                <div class="flex items-center gap-2 text-[13px] font-[530] leading-[var(--line-height-compact)] text-v2-text-text-base">
                  <Icon name="lock" size="small" class="shrink-0 text-v2-icon-icon-muted" />
                  {ctx.t("unreachable.title")}
                </div>
                <p class="text-[13px] leading-[var(--line-height-base)] text-v2-text-text-muted">
                  {ctx.t("unreachable.description")}
                </p>
                <div class="flex min-w-0 items-center gap-2">
                  <code
                    dir="ltr"
                    class="min-w-0 truncate rounded-[6px] border border-v2-border-border-base bg-v2-background-bg-layer-01 px-2 py-1 text-12-mono text-v2-text-text-base"
                  >
                    {LISTEN_COMMAND}
                  </code>
                  <Tooltip
                    value={ctx.t(copyCommand.isSuccess ? "common.copied" : "unreachable.copy")}
                    placement="top"
                    forceOpen={copyCommand.isSuccess ? true : undefined}
                  >
                    <Button
                      variant="ghost"
                      size="small"
                      aria-label={ctx.t("unreachable.copy")}
                      onClick={() => copyCommand.mutate()}
                    >
                      <Icon name={copyCommand.isSuccess ? "check" : "copy"} size="small" />
                    </Button>
                  </Tooltip>
                </div>
              </div>
            </Show>
            {}
            <div data-component="settings-row">
              <div data-slot="settings-row-copy">
                <div data-slot="settings-row-title">{ctx.t("custom.title")}</div>
                <div data-slot="settings-row-description">{ctx.t("custom.description")}</div>
                <TextInput
                  type="url"
                  dir="ltr"
                  spellcheck={false}
                  autocapitalize="off"
                  aria-label={ctx.t("custom.title")}
                  placeholder={ctx.t("custom.placeholder")}
                  value={custom.draft}
                  invalid={custom.invalid}
                  aria-describedby={custom.invalid ? "pairing-custom-error" : undefined}
                  onInput={(event) => setCustom({ draft: event.currentTarget.value, invalid: false })}
                  onChange={saveCustom}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveCustom()
                  }}
                />
                <Show when={custom.invalid}>
                  <span
                    id="pairing-custom-error"
                    class="text-11-regular leading-[var(--line-height-compact)] text-v2-state-fg-danger"
                    role="alert"
                  >
                    {ctx.t("custom.invalid")}
                  </span>
                </Show>
              </div>
            </div>
            <Show when={display()}>
              <div data-action="settings-keep-screen-active">
                <Row title={ctx.t("screenActive.title")} description={ctx.t("screenActive.description")}>
                  <Switch
                    hideLabel
                    checked={screenActive.isSuccess && screenActive.data}
                    disabled={screenActive.isPending || !!screenActive.error || screenActivity.isPending}
                    onChange={(enabled) => screenActivity.mutate(enabled)}
                  >
                    {ctx.t("screenActive.title")}
                  </Switch>
                </Row>
              </div>
            </Show>
          </div>
          <Show when={display() && (screenActive.error || screenActivity.error)}>
            <p class="text-text-danger-base" role="alert">
              {ctx.t("screenActive.error")}
            </p>
          </Show>
          <Show when={local.error || !props.server()}>
            <p class="text-text-danger-base" role="alert">
              {ctx.t("error")}
            </p>
          </Show>
        </section>
      </div>
    </>
  )
}


type CopiedTimer = { timeout?: ReturnType<typeof setTimeout> }

const routeLabel: Record<RouteKind, string> = {
  custom: "route.custom",
  local: "route.local",
  vpn: "route.vpn",
  other: "route.other",
}

const routeDescription: Record<RouteKind, string> = {
  custom: "route.custom.description",
  local: "route.local.description",
  vpn: "route.vpn.description",
  other: "route.other.description",
}

function DialogPairing(props: {
  title: string
  routes: Accessor<readonly PairingRoute[]>
  selected: Accessor<string>
  onSelect: (url: string) => void
  code: (signal: AbortSignal) => Promise<{ readonly code: string; readonly expiresIn: number }>
}) {
  const ctx = useExtension()
  const system = ctx.system

  
  const code = useQuery(() => ({
    queryKey: [ctx.id, "code"],
    queryFn: (input) => props.code(input.signal),
    gcTime: 0,
    refetchInterval: (query) => (query.state.data?.expiresIn ?? 60) * 1000,
    
    refetchIntervalInBackground: true,
  }))

  
  const [now, setNow] = createSignal(Date.now())
  const clock = setInterval(() => setNow(Date.now()), 1000)
  onCleanup(() => clearInterval(clock))

  const remaining = () => {
    if (!code.isSuccess) return 0

    
    return Math.max(0, code.data.expiresIn - Math.floor(Math.max(0, now() - code.dataUpdatedAt) / 1000))
  }

  const route = createMemo(() => props.routes().find((item) => item.url === props.selected()) ?? props.routes()[0])

  const url = createMemo(() => {
    const target = route()

    if (!code.isSuccess || !target) return

    return new URL(`/auth/connect/${code.data.code}`, target.url).href
  })

  
  const copied: CopiedTimer = {}
  onCleanup(() => clearTimeout(copied.timeout))

  const copy = useMutation(() => ({
    mutationFn: async () => {
      const value = url()

      if (!value) return
      await system.copy(value)
    },
    onMutate: () => clearTimeout(copied.timeout),
    onSuccess: () => {
      copied.timeout = setTimeout(() => copy.reset(), 2000)
    },
  }))

  
  const forgetCopy = () => {
    clearTimeout(copied.timeout)
    copy.reset()
  }

  const refresh = () => (
    <button
      type="button"
      class="rounded-[4px] px-1 text-12-regular leading-[var(--line-height-compact)] text-v2-text-text-muted underline-offset-2 hover:text-v2-text-text-base hover:underline focus-visible:underline focus-visible:outline-none disabled:opacity-50"
      disabled={code.isFetching}
      onClick={() => {
        forgetCopy()
        void code.refetch()
      }}
    >
      {ctx.t("refresh")}
    </button>
  )

  
  
  const qr = createMemo(() => {
    const target = route()

    if (!code.isSuccess || !target) return
    const urls = [target.url, ...props.routes().flatMap((item) => (item.url === target.url ? [] : [item.url]))]

    return renderSVG(JSON.stringify({ code: code.data.code, urls }), {
      border: 4,
      blackColor: "currentColor",
      whiteColor: "transparent",
    })
  })

  return (
    <Dialog fit containerClass="max-w-[min(400px,calc(100vw-32px))]">
      <DialogHeader>
        <DialogTitleGroup title={props.title} description={ctx.t("description")} />
      </DialogHeader>
      <DialogBody class="flex flex-col gap-4 px-4 pb-4">
        <Show
          when={props.routes().length > 1}
          fallback={
            <Show when={route()}>
              {(item) => (
                <div class="flex flex-col gap-0.5">
                  <span class="text-[13px] font-[530] leading-[var(--line-height-compact)] text-v2-text-text-base">
                    {ctx.t(routeLabel[item().kind])}
                  </span>
                  <span class="text-12-regular leading-[var(--line-height-compact)] text-v2-text-text-muted">
                    {ctx.t(routeDescription[item().kind])}
                  </span>
                </div>
              )}
            </Show>
          }
        >
          <RadioGroup
            hideLabel
            label={ctx.t("routes")}
            value={route()?.url}
            onChange={(url) => {
              forgetCopy()
              props.onSelect(url)
            }}
          >
            <For each={props.routes()}>
              {(item) => (
                <RadioItem
                  value={item.url}
                  label={ctx.t(routeLabel[item.kind])}
                  description={
                    <>
                      {ctx.t(routeDescription[item.kind])}
                      {" · "}
                      <bdi dir="ltr">{new URL(item.url).host}</bdi>
                    </>
                  }
                />
              )}
            </For>
          </RadioGroup>
        </Show>
        <Show when={url()}>
          <div
            class="mx-auto aspect-square w-full max-w-[min(320px,calc(100dvh-360px))] shrink-0 rounded-[6px] bg-v2-background-bg-base p-6 text-v2-text-text-base [&>svg]:size-full"
            role="img"
            aria-label={ctx.t("qr")}
            innerHTML={qr()}
          />
          <div class="flex min-w-0 flex-col items-center gap-1 pb-2">
            <Tooltip
              class="min-w-0 max-w-full"
              value={ctx.t(copy.isSuccess ? "common.copied" : "copyLink")}
              placement="top"
              forceOpen={copy.isSuccess ? true : undefined}
            >
              <button
                type="button"
                class="inline-flex min-h-8 max-w-full select-none items-center justify-center gap-2 rounded-[6px] px-2 py-1 text-[13px] font-[440] leading-text-compact tracking-[-0.04px] text-v2-text-text-muted transition-colors hover:bg-v2-background-bg-layer-02 hover:text-v2-text-text-base focus-visible:bg-v2-background-bg-layer-02 focus-visible:outline-none disabled:opacity-50"
                disabled={copy.isPending}
                aria-label={ctx.t("copyLink")}
                onClick={() => copy.mutate()}
              >
                <Icon name={copy.isSuccess ? "check" : "copy"} size="small" class="shrink-0" />
                {}
                <bdi dir="ltr" class="min-w-0 break-all text-start text-12-mono">
                  {url()}
                </bdi>
              </button>
            </Tooltip>
            <div class="flex items-center gap-2 text-12-regular leading-[var(--line-height-compact)] text-v2-text-text-muted">
              <span role="timer" aria-live="off">
                {ctx.t("expires", { time: countdown(remaining()) })}
              </span>
              <span aria-hidden="true">·</span>
              {refresh()}
            </div>
          </div>
        </Show>
        {}
        <Show when={!url() && code.error}>
          <div class="flex flex-col items-center gap-1">
            <p class="text-text-danger-base" role="alert">
              {ctx.t("error")}
            </p>
            {refresh()}
          </div>
        </Show>
        <Show when={copy.error}>
          <p class="text-text-danger-base" role="alert">
            {ctx.t("copy.error")}
          </p>
        </Show>
      </DialogBody>
    </Dialog>
  )
}

function countdown(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}


function Row(props: { title: string; description: string; children: JSX.Element }) {
  return (
    <div data-component="settings-row">
      <div data-slot="settings-row-copy">
        <div data-slot="settings-row-title">{props.title}</div>
        <div data-slot="settings-row-description">{props.description}</div>
      </div>
      <div data-slot="settings-row-control">{props.children}</div>
    </div>
  )
}
