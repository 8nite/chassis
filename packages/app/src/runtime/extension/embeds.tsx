import { createEffect, on, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { createEventListener } from "@solid-primitives/event-listener"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import type { EmbedProps, Embeds } from "@chassis/gui-extensions/sdk"
import type { Bridge } from "@chassis/gui-extensions/sdk/bridge"

const geometry =
  /^(inset|left|right|top|bottom|translate|transform|scale|rotate|margin|padding|flex|grid|gap|row-gap|column-gap)|(^|-)(width|height)$/

type Input = {
  readonly bridge: Bridge | undefined
  readonly zoom: () => number
  readonly dialog: () => boolean
}


export function createEmbeds(input: Input): Embeds {
  return {
    View: (props) => {
      const bridge = input.bridge

      
      if (!bridge) return <div class={props.class}>{props.children}</div>

      return <EmbedView {...props} input={input} bridge={bridge} />
    },
    capture: (id) => input.bridge?.capture(id) ?? Promise.resolve(undefined),
  }
}

function EmbedView(props: EmbedProps & { input: Input; bridge: Bridge }) {
  const [store, setStore] = createStore<{
    visible: boolean
    snapshot: { id: string; url: string; presented: boolean } | undefined
  }>({
    visible: typeof document === "undefined" || document.visibilityState === "visible",
    
    snapshot: undefined,
  })

  let element: HTMLDivElement | undefined
  let frame: number | undefined
  let layout: string | undefined
  let until = 0
  let capturing: string | undefined
  let release: ReturnType<typeof setTimeout> | undefined
  
  let placed: string | undefined
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 1
  const paint = canvas.getContext("2d", { willReadFrequently: true })

  
  
  const resolve = (color: string) => {
    if (!paint) return undefined
    paint.clearRect(0, 0, 1, 1)
    paint.fillStyle = color
    paint.fillRect(0, 0, 1, 1)
    const data = paint.getImageData(0, 0, 1, 1).data

    return [data[0], data[1], data[2], data[3]] as const
  }

  const hide = () => {
    if (placed) props.bridge.embed(placed)
    placed = undefined
  }

  
  
  const covered = (rect: DOMRect) =>
    Array.from(document.querySelectorAll('[data-popper-positioner]:not(:has([role="tooltip"]))')).some((el) => {
      const r = el.getBoundingClientRect()

      return r.width > 0 && r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top
    })

  const replaceSnapshot = (next?: { id: string; url: string; presented: boolean }) => {
    if (store.snapshot?.url) URL.revokeObjectURL(store.snapshot.url)
    setStore("snapshot", next)
  }

  
  
  const freeze = (id: string) => {
    clearTimeout(release)
    release = undefined

    if (store.snapshot?.id === id || capturing === id) return
    capturing = id
    void props.bridge
      .capture(id)
      .catch(() => undefined)
      .then(async (data) => {
        const url = data ? URL.createObjectURL(new Blob([new Uint8Array(data)], { type: "image/jpeg" })) : ""
        const image = new Image()

        if (url) image.src = url

        const decoded =
          !!url &&
          (await image
            .decode()
            .then(() => true)
            .catch(() => false))

        if (capturing !== id) {
          if (url) URL.revokeObjectURL(url)

          return
        }

        capturing = undefined
        
        
        replaceSnapshot({ id, url, presented: !decoded })
        schedule()
      })
  }

  
  
  const presentation = new PerformanceObserver((list) => {
    const snapshot = store.snapshot

    if (!snapshot || snapshot.presented) return

    if (!list.getEntries().some((entry) => "url" in entry && entry.url === snapshot.url)) return
    setStore("snapshot", "presented", true)
    schedule()
  })

  presentation.observe({ type: "element" })
  onCleanup(() => presentation.disconnect())

  const thaw = () => {
    capturing = undefined

    if (!store.snapshot || release !== undefined) return
    
    release = setTimeout(() => {
      release = undefined
      replaceSnapshot()
    }, 150)
  }

  const measure = () => {
    if (!element) return
    const id = props.id

    if (!id) return hide()
    const rect = element.getBoundingClientRect()
    const zoom = props.input.zoom()
    const left = Math.round(rect.left * zoom)
    const top = Math.round(rect.top * zoom)
    const right = Math.round(rect.right * zoom)
    const bottom = Math.round(rect.bottom * zoom)
    const shown = props.visible && store.visible && !props.input.dialog()
    const cover = !!props.frozen || covered(rect)

    if (shown && cover) freeze(id)

    if (!cover) thaw()
    const visible = shown && !(cover && store.snapshot?.id === id && store.snapshot.presented)

    
    const color =
      props.background ??
      getComputedStyle(element.closest(".bg-v2-background-bg-deep") ?? document.documentElement).backgroundColor

    const ring = props.radius ? cardRing(element) : undefined
    const viewport = { width: Math.round(window.innerWidth * zoom), height: Math.round(window.innerHeight * zoom) }

    const next = `${id}:${visible}:${left}:${top}:${right}:${bottom}:${viewport.width}:${viewport.height}:${color}:${ring?.color}:${ring?.width}:${window.devicePixelRatio}`

    if (next === layout) return
    layout = next

    const background = resolve(color)
    const border = ring && resolve(ring.color)

    if (placed !== id) hide()
    placed = id

    const box = {
      visible,
      bounds: { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) },
      viewport,
      radius: Math.round((props.radius ?? 0) * zoom),
    }

    const backed = background ? { ...box, background } : box

    props.bridge.embed(
      id,
      ring && border && border[3] > 0 ? { ...backed, border: { color: border, width: ring.width * zoom } } : backed,
    )
  }

  const tick = () => {
    frame = undefined
    measure()

    if (performance.now() < until) frame = requestAnimationFrame(tick)
  }

  const schedule = (duration = 0) => {
    until = Math.max(until, performance.now() + duration)

    if (frame === undefined) frame = requestAnimationFrame(tick)
  }

  createEffect(
    on(
      [
        props.input.zoom,
        props.input.dialog,
        () => store.visible,
        () => props.visible,
        () => props.id,
        () => props.frozen,
      ],
      () => {
        layout = undefined

        
        
        if (!props.visible || !store.visible || props.input.dialog() || !props.id) return hide()
        schedule(300)
      },
    ),
  )
  
  
  createResizeObserver(() => element, measure)
  createEventListener(window, "resize", () => schedule(300))
  
  
  createEventListener(document, "transitionrun", (event) => {
    if (geometry.test(event.propertyName)) schedule(300)
  })
  createEventListener(document, ["transitionend", "transitioncancel"], (event) => {
    if (geometry.test(event.propertyName)) schedule()
  })
  
  
  const portals = new MutationObserver(() => schedule(300))
  portals.observe(document.body, { childList: true })
  onCleanup(() => portals.disconnect())
  const appearance = new MutationObserver(() => schedule(300))
  appearance.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-theme"] })
  onCleanup(() => appearance.disconnect())
  createEventListener(window.matchMedia("(prefers-color-scheme: dark)"), "change", () => schedule(300))
  createEventListener(document, "visibilitychange", () => setStore("visible", document.visibilityState === "visible"))
  onCleanup(() => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    clearTimeout(release)
    capturing = undefined
    replaceSnapshot()
    hide()
  })

  return (
    <div ref={element} class={props.class}>
      <Show when={store.snapshot?.id === props.id && props.visible && store.snapshot?.url}>
        {(url) => (
          <img
            src={url()}
            alt=""
            elementtiming="embed-snapshot"
            draggable={false}
            class="absolute inset-0 size-full pointer-events-none select-none"
          />
        )}
      </Show>
      {props.children}
    </div>
  )
}



function cardRing(element: HTMLElement) {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const shadow = getComputedStyle(node).boxShadow

    if (shadow === "none") continue

    return shadow
      .split(/,(?![^(]*\))/)
      .map((layer) => layer.trim().match(/^(.+?)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px\s+([\d.]+)px$/))
      .flatMap((match) =>
        match && +match[2] === 0 && +match[3] === 0 && +match[4] === 0 && +match[5] > 0
          ? [{ color: match[1], width: +match[5] }]
          : [],
      )
      .at(0)
  }
}
