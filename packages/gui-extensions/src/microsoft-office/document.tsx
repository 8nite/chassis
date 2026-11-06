import { createSignal, For, onCleanup, Show, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { Loader } from "@chassis/ui/loader"
import { createKeyed, createLatest, useExtension } from "../sdk"
import { OfficePages, type PaintPage, type ScrollToPage } from "./pages"
import {
  layerFont,
  lineHeight,
  type WordLink,
  type WordMethods,
  type WordPageSize,
  type WordSpan,
} from "./word-protocol"
import { createWorkerClient, movableBuffer } from "./worker-rpc"
import type { FileViewerProps } from "../file/contract"

type Opened = {
  readonly pages: Accessor<readonly WordPageSize[]>
  
  readonly loading: Accessor<boolean>
  readonly paint: PaintPage
  
  readonly text: (index: number, signal: AbortSignal) => Promise<readonly WordSpan[]>
  
  readonly bookmark: (name: string) => Promise<{ readonly index: number; readonly y: number } | undefined>
  
  readonly finish: () => Promise<number>
}

type Client = ReturnType<typeof createWorkerClient<WordMethods>>


type Scroll = { to: ScrollToPage | undefined }


type Lazy<T> = { value: T | undefined }


export default function OfficeDocument(props: FileViewerProps) {
  const ctx = useExtension()
  const [opened, setOpened] = createSignal<Opened>()

  
  createKeyed(
    () => props.bytes,
    (bytes) => {
      const controller = new AbortController()
      const worker = new Worker(new URL("./document.worker.ts", import.meta.url), { type: "module" })
      const client = createWorkerClient<WordMethods>(worker)

      const fail = () => {
        if (controller.signal.aborted) return

        controller.abort()
        props.onError()
      }

      
      worker.addEventListener("error", fail)
      worker.addEventListener("messageerror", fail)
      onCleanup(() => {
        controller.abort()
        client.close()
        setOpened(undefined)
      })

      void open(client, bytes)
        .then((value) => {
          if (controller.signal.aborted) return

          setOpened(value)

          
          
          return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            .then(() => (controller.signal.aborted ? undefined : value.finish()))
            .then((count) => {
              if (count !== undefined && !controller.signal.aborted) props.onDetails([ctx.plural("pages", count)])
            })
        })
        .catch(fail)
    },
  )

  return (
    <Show
      when={opened()}
      fallback={
        <div class="flex min-h-0 flex-1 items-center justify-center">
          <Loader />
        </div>
      }
    >
      {(opened) => {
        const scroll: Scroll = { to: undefined }

        const follow = (link: WordLink) => {
          if (link.kind === "external") return ctx.system.openExternal(link.url)

          void opened()
            .bookmark(link.bookmark)
            .then(
              (target) => {
                if (target) scroll.to?.(target.index, target.y)
              },
              () => undefined,
            )
        }

        return (
          <OfficePages
            pages={opened().pages()}
            maxScale={1}
            paint={opened().paint}
            label={(index) => ctx.t("page", { number: index + 1 })}
            overlay={(input) => (
              <WordTextLayer
                index={input.index}
                page={opened().pages()[input.index]}
                text={opened().text}
                follow={follow}
              />
            )}
            text
            footer={(index) => (
              <Show when={opened().loading() && index === opened().pages().length - 1}>
                <Loader />
              </Show>
            )}
            onScrollTo={(scrollTo) => {
              scroll.to = scrollTo
            }}
          />
        )
      }}
    </Show>
  )
}


function WordTextLayer(props: {
  index: number
  
  page: WordPageSize | undefined
  text: (index: number, signal: AbortSignal) => Promise<readonly WordSpan[]>
  follow: (link: WordLink) => void
}) {
  
  const spans = createLatest(
    () => props.page,
    (_, signal) => props.text(props.index, signal),
  )

  return (
    <div
      class="absolute inset-0 select-text overflow-hidden whitespace-pre text-transparent [container-type:inline-size] selection:bg-[rgb(0_120_215/0.3)] selection:text-transparent"
      
      style={{ "font-family": layerFont, "font-size": "0", "line-height": lineHeight }}
    >
      <For each={spans.latest}>
        {(span) => (
          <>
            <Show
              when={span.link}
              fallback={
                <span dir={span.dir} class="absolute origin-top-left cursor-text" style={place(span)}>
                  {span.text}
                </span>
              }
            >
              {(link) => (
                <span
                  role="link"
                  tabIndex={0}
                  title={span.title}
                  dir={span.dir}
                  class="absolute origin-top-left cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-focus"
                  style={place(span)}
                  onClick={(event) => {
                    
                    if (event.button === 0 && (globalThis.getSelection()?.isCollapsed ?? true)) props.follow(link())
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return

                    event.preventDefault()
                    props.follow(link())
                  }}
                >
                  {span.text}
                </span>
              )}
            </Show>
            <Show when={span.after === "br"}>
              <br />
            </Show>
            <Show when={span.after === "tab"}>{"\t"}</Show>
          </>
        )}
      </For>
    </div>
  )
}

function place(span: WordSpan) {
  return {
    left: `${span.left * 100}%`,
    top: `${span.top * 100}%`,
    "font-size": `${span.size * 100}cqw`,
    transform: span.transform,
  }
}


async function open(client: Client, bytes: Uint8Array): Promise<Opened> {
  
  const buffer = movableBuffer(bytes)
  const first = await client.call("open", { bytes: buffer }, { transfer: [buffer] })
  const [layout, setLayout] = createStore({ pages: first.pages, loading: first.loading })

  const layOut = async (): Promise<number> => {
    const step = await client.call("layout", undefined)

    if (!step.done) return layOut()

    
    
    const sizes = step.pages.map((page, index) => {
      const size = layout.pages[index]

      return size && step.kept[index] && sameSize(size, page) ? size : page
    })

    
    setLayout({ pages: sizes, loading: false })

    return sizes.length
  }

  const rest: Lazy<Promise<number>> = { value: undefined }
  
  
  const texts = new WeakMap<WordPageSize, readonly WordSpan[]>()
  const pages = () => layout.pages
  const loading = () => layout.loading

  const finish = () => (rest.value ??= loading() ? layOut() : Promise.resolve(pages().length))

  return {
    pages,
    loading,
    finish,
    paint: async (index, canvas, scale, signal) => {
      const painted = client.call(
        "paint",
        { index, scale, ratio: window.devicePixelRatio || 1 },
        
        
        { key: `paint:${index}`, signal },
      )

      
      
      void client.call("build", { index: index + 1 }, { key: "build" }).catch(() => undefined)

      
      const bitmap = await painted

      if (!bitmap) return

      const context = canvas.getContext("bitmaprenderer")

      if (!context) return bitmap.close()

      canvas.width = bitmap.width
      canvas.height = bitmap.height
      context.transferFromImageBitmap(bitmap)
    },
    text: async (index, signal) => {
      const page = pages()[index]
      const cached = page && texts.get(page)

      if (cached) return cached

      const spans = await client.call("text", { index }, { signal })

      if (page) texts.set(page, spans)

      return spans
    },
    bookmark: async (name) => {
      const found = await client.call("bookmark", { name })

      
      if (found || !loading()) return found

      await finish()

      return client.call("bookmark", { name })
    },
  }
}

function sameSize(size: WordPageSize, page: WordPageSize) {
  return size.width === page.width && size.height === page.height && size.background === page.background
}
