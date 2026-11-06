import { createMemo, createSignal, Index, onCleanup, onMount, Show, type JSX } from "solid-js"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { createKeyed } from "../sdk"
import { paper } from "./paper"


export type PaintPage = (index: number, canvas: HTMLCanvasElement, scale: number, signal: AbortSignal) => Promise<void>


export type PageOverlay = (input: { readonly index: number; readonly scale: number }) => JSX.Element


export type ScrollToPage = (index: number, y: number) => void


type PageSize = { readonly width: number; readonly height: number; readonly background?: string }


type Watch = (element: Element, change: (near: boolean) => void) => void


type PendingScroll = { target: { readonly index: number; readonly y: number } | undefined }


type SharedObserver = { value: IntersectionObserver | undefined }


type Growth = { timer: ReturnType<typeof setTimeout> | undefined; slice: number }

const padding = 24


const settleDelay = 150


const firstSlice = 6


const sliceBudget = 12


const maxSlice = 200


export function OfficePages(props: {
  pages: readonly PageSize[]
  maxScale: number
  paint: PaintPage
  label: (index: number) => string
  
  overlay?: PageOverlay
  
  text?: boolean
  
  footer?: (index: number) => JSX.Element
  
  onScrollTo?: (scrollTo: ScrollToPage) => void
}) {
  const [width, setWidth] = createSignal(0)
  
  const [settled, setSettled] = createSignal(0)
  const [ratio, setRatio] = createSignal(window.devicePixelRatio || 1)
  
  const [mounted, setMounted] = createSignal(firstSlice)
  const shown = createMemo(() => props.pages.slice(0, mounted()))
  
  const pending: PendingScroll = { target: undefined }
  const pages: HTMLDivElement[] = []
  const watched = new Map<Element, (near: boolean) => void>()
  const observer: SharedObserver = { value: undefined }
  let scroller: HTMLDivElement | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  createResizeObserver(
    () => scroller,
    (rect) => {
      setWidth(rect.width)
      clearTimeout(timer)

      if (settled() === 0) return void setSettled(rect.width)

      timer = setTimeout(() => setSettled(rect.width), settleDelay)
    },
  )

  onCleanup(() => {
    clearTimeout(timer)
    observer.value?.disconnect()
  })

  
  
  createKeyed(ratio, (value) => {
    const query = window.matchMedia(`(resolution: ${value}dppx)`)
    const change = () => setRatio(window.devicePixelRatio || 1)

    query.addEventListener("change", change)
    onCleanup(() => query.removeEventListener("change", change))
  })

  
  const scrollTo: ScrollToPage = (index, y) => {
    const page = pages[index]
    const target = props.pages[index]

    if (!target) return

    if (!scroller || !page || index >= mounted()) return void (pending.target = { index, y })

    pending.target = undefined
    scroller.scrollTo({ top: page.offsetTop + y * fit(width(), target.width) - padding })
  }

  onMount(() => props.onScrollTo?.(scrollTo))

  
  
  createKeyed(
    () => props.pages.length,
    (total) => {
      const state: Growth = { timer: undefined, slice: firstSlice }

      const grow = () => {
        if (mounted() >= total) return

        const started = performance.now()
        const before = mounted()

        setMounted(Math.min(total, before + state.slice))

        const each = (performance.now() - started) / (mounted() - before)

        state.slice = Math.min(maxSlice, Math.max(1, Math.floor(sliceBudget / each)))

        if (pending.target && pending.target.index < mounted()) scrollTo(pending.target.index, pending.target.y)

        state.timer = setTimeout(grow)
      }

      state.timer = setTimeout(grow)
      onCleanup(() => clearTimeout(state.timer))
    },
  )

  
  
  const watch: Watch = (element, change) => {
    observer.value ??= new IntersectionObserver(
      (entries) => entries.forEach((entry) => watched.get(entry.target)?.(entry.isIntersecting)),
      { root: scroller, rootMargin: "100% 0px" },
    )

    watched.set(element, change)
    observer.value.observe(element)
    onCleanup(() => {
      watched.delete(element)
      observer.value?.unobserve(element)
    })
  }

  const fit = (available: number, page: number) =>
    Math.max(0, Math.min(props.maxScale, (available - padding * 2) / page))

  return (
    <div ref={scroller} data-slot="artifact-stage" class="relative min-h-0 flex-1 overflow-auto">
      <div class="flex flex-col items-center gap-4 py-6">
        {}
        <Index each={shown()}>
          {(page, index) => (
            <div class="flex shrink-0 flex-col items-center gap-3">
              <OfficePage
                ref={(element) => (pages[index] = element)}
                watch={watch}
                index={index}
                page={page()}
                scale={fit(width(), page().width)}
                rasterScale={fit(settled(), page().width)}
                ratio={ratio()}
                paint={props.paint}
                overlay={props.overlay}
                text={props.text ?? false}
                label={props.label(index)}
              />
              {props.footer?.(index)}
            </div>
          )}
        </Index>
      </div>
    </div>
  )
}

function OfficePage(props: {
  ref: (element: HTMLDivElement) => void
  watch: Watch
  index: number
  page: PageSize
  scale: number
  rasterScale: number
  ratio: number
  paint: PaintPage
  overlay: PageOverlay | undefined
  text: boolean
  label: string
}) {
  const [visible, setVisible] = createSignal(false)
  let frame: HTMLDivElement | undefined
  let canvas: HTMLCanvasElement | undefined

  onMount(() => {
    if (frame) props.watch(frame, setVisible)
  })

  return (
    <div
      ref={(element) => {
        frame = element
        props.ref(element)
      }}
      role={props.text ? "group" : undefined}
      aria-label={props.text ? props.label : undefined}
      class="relative shrink-0 shadow-[var(--v2-elevation-raised)]"
      style={{
        width: `${props.page.width * props.scale}px`,
        height: `${props.page.height * props.scale}px`,
        
        background: props.page.background ?? paper,
      }}
    >
      <canvas
        ref={canvas}
        role={props.text ? undefined : "img"}
        aria-label={props.text ? undefined : props.label}
        aria-hidden={props.text ? "true" : undefined}
        class="absolute inset-0 block size-full"
      />
      <Show when={visible() && canvas}>
        {(target) => (
          <PageBitmap
            canvas={target()}
            index={props.index}
            page={props.page}
            scale={props.scale}
            rasterScale={props.rasterScale}
            ratio={props.ratio}
            paint={props.paint}
            overlay={props.overlay}
          />
        )}
      </Show>
    </div>
  )
}


function PageBitmap(props: {
  canvas: HTMLCanvasElement
  index: number
  page: PageSize
  scale: number
  rasterScale: number
  ratio: number
  paint: PaintPage
  overlay: PageOverlay | undefined
}) {
  
  
  const raster = createMemo(
    () => (props.rasterScale > 0 ? { scale: props.rasterScale, ratio: props.ratio, page: props.page } : false),
    undefined,
    {
      equals: (previous, next) =>
        previous === next ||
        (!!previous &&
          !!next &&
          previous.page === next.page &&
          Math.round(props.page.width * previous.scale * previous.ratio) ===
            Math.round(props.page.width * next.scale * next.ratio) &&
          Math.round(props.page.height * previous.scale * previous.ratio) ===
            Math.round(props.page.height * next.scale * next.ratio)),
    },
  )

  
  const canvas = props.canvas

  const clear = () => {
    canvas.width = 0
    canvas.height = 0
  }

  
  createKeyed(
    raster,
    (value) => {
      const controller = new AbortController()

      onCleanup(() => controller.abort())
      void props.paint(props.index, canvas, value.scale, controller.signal).catch(() => undefined)
    },
    { otherwise: clear },
  )

  
  onCleanup(clear)

  return <Show when={props.overlay}>{(overlay) => overlay()({ index: props.index, scale: props.scale })}</Show>
}
