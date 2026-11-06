import { createMemo, createSignal, createUniqueId, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { Loader } from "@chassis/ui/loader"
import { showToast } from "@chassis/ui/toast"
import {
  cellAtPoint,
  extendTo,
  hyperlinkAtCell,
  normalizeRange,
  parseHyperlinkLocation,
  rangeRect,
  safeExternalHyperlink,
  selectionAt,
  selectionKeyReducer,
  type CellAddr,
  type DisplayList,
  type GridMeta,
  type HyperlinkRegion,
  type Selection,
  type SelectionLimits,
} from "@betteroffice/xlsx/headless"
import { createKeyed, createLatest, useExtension } from "../sdk"
import type { FileViewerProps } from "../file/contract"
import { externalUrl } from "./links"
import { paper } from "./paper"
import { columnName, contains, coverMerges, hiddenAt, lastCell, settleMerges, skipHidden } from "./sheet-cells"
import {
  headerHeight,
  paintCells,
  paintHeaders,
  paintSelection,
  rowHeaderWidth,
  shiftGrid,
  trackIndex,
  type Painted,
} from "./sheet-paint"
import type { SheetFrameRequest, SheetLayout, SheetMethods, SheetTab, SheetViewport } from "./sheet-protocol"
import { createWorkerClient, movableBuffer, SupersededError, WorkerClosedError } from "./worker-rpc"


type Client = ReturnType<typeof createWorkerClient<SheetMethods>>

type Opened = { readonly client: Client; readonly tabs: readonly SheetTab[] }


type Shown = { readonly layout: SheetLayout; readonly target: CellAddr | undefined }


type FrameOrder = { requested: string; sent: number; received: number; pending: SheetFrameRequest | undefined }


type Picking = { controller: AbortController | undefined }


const copyLimit = 200_000


const readerBlock = { rows: 10, cols: 5 }


const settleDelay = 150


export default function OfficeSpreadsheet(props: FileViewerProps) {
  const ctx = useExtension()
  const panel = createUniqueId()

  
  const [state, setState] = createStore<{
    opened: Opened | undefined
    shown: Shown | undefined
    selecting: number | undefined
  }>({
    opened: undefined,
    shown: undefined,
    selecting: undefined,
  })

  
  
  createKeyed(
    () => props.bytes,
    (bytes) => {
      const controller = new AbortController()
      const worker = new Worker(new URL("./spreadsheet.worker.ts", import.meta.url), { type: "module" })
      const client = createWorkerClient<SheetMethods>(worker)

      const crash = () => {
        if (!controller.signal.aborted) props.onError()
      }

      worker.addEventListener("error", crash)
      worker.addEventListener("messageerror", crash)

      onCleanup(() => {
        controller.abort()
        client.close()
        setState({ opened: undefined, shown: undefined, selecting: undefined })
      })

      
      const buffer = movableBuffer(bytes)

      void client.call("open", { bytes: buffer }, { transfer: [buffer], signal: controller.signal }).then((opened) => {
        if (controller.signal.aborted) return

        if (!opened) return props.onError()

        setState({ opened: { client, tabs: opened.tabs }, shown: { layout: opened.layout, target: undefined } })
        props.onDetails([ctx.plural("sheets", opened.tabs.length)])
      }, crash)
    },
  )

  const active = () => state.selecting ?? state.shown?.layout.info.activeSheet
  const picking: Picking = { controller: undefined }

  const show = (index: number, target?: CellAddr) => {
    const opened = state.opened

    if (!opened || (index === active() && !target)) return

    picking.controller?.abort()

    
    if (index === state.shown?.layout.info.activeSheet && !target) return void setState("selecting", undefined)

    const controller = new AbortController()

    picking.controller = controller
    setState("selecting", index)

    void opened.client.call("show", { sheet: index }, { signal: controller.signal }).then(
      (layout) => {
        
        if (state.opened === opened) setState({ shown: { layout, target }, selecting: undefined })
      },
      (error: Error) => {
        if (state.opened !== opened || error instanceof WorkerClosedError) return

        
        setState("selecting", undefined)
        showToast({ title: ctx.t("sheet.openFailed") })
      },
    )
  }

  
  const navigate = (name: string, cell: CellAddr) => {
    const tab = state.opened?.tabs.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase())

    if (tab) show(tab.index, cell)
  }

  
  const roam = (event: KeyboardEvent & { currentTarget: HTMLDivElement }) => {
    const tabs = state.opened?.tabs ?? []
    const current = tabs.findIndex((tab) => tab.index === active())
    const forward = getComputedStyle(event.currentTarget).direction === "rtl" ? "ArrowLeft" : "ArrowRight"
    const backward = forward === "ArrowRight" ? "ArrowLeft" : "ArrowRight"

    const position = (() => {
      if (event.key === "Home") return 0

      if (event.key === "End") return tabs.length - 1

      if (event.key === forward) return (current + 1) % tabs.length

      if (event.key === backward) return (current - 1 + tabs.length) % tabs.length

      return undefined
    })()

    const tab = position === undefined ? undefined : tabs[position]

    if (position === undefined || !tab) return

    event.preventDefault()
    show(tab.index)
    event.currentTarget.querySelectorAll<HTMLElement>("[role=tab]")[position]?.focus()
  }

  const tabID = (index: number | undefined) => `${panel}-tab-${index}`

  return (
    <Show
      when={state.opened}
      fallback={
        <div class="flex min-h-0 flex-1 items-center justify-center">
          <Loader />
        </div>
      }
    >
      {(opened) => (
        <div class="flex min-h-0 flex-1 flex-col">
          <div
            id={panel}
            role={opened().tabs.length > 1 ? "tabpanel" : undefined}
            aria-labelledby={opened().tabs.length > 1 ? tabID(state.shown?.layout.info.activeSheet) : undefined}
            class="flex min-h-0 flex-1"
          >
            {}
            <Show when={state.shown} keyed>
              {(shown) => (
                <SpreadsheetGrid
                  client={opened().client}
                  layout={shown.layout}
                  target={shown.target}
                  onNavigate={navigate}
                />
              )}
            </Show>
          </div>
          <Show when={opened().tabs.length > 1}>
            <div
              role="tablist"
              aria-label={ctx.t("sheet.tabs")}
              class="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-t border-v2-border-border-muted px-2"
              onKeyDown={roam}
            >
              <For each={opened().tabs}>
                {(tab) => (
                  <button
                    type="button"
                    role="tab"
                    id={tabID(tab.index)}
                    aria-controls={panel}
                    aria-selected={tab.index === active()}
                    tabIndex={tab.index === active() ? 0 : -1}
                    class="h-7 shrink-0 rounded-md px-2.5 text-13-regular text-text-weak hover:bg-v2-background-bg-layer-02 aria-selected:bg-v2-background-bg-layer-02 aria-selected:text-text-strong"
                    onClick={() => show(tab.index)}
                  >
                    {tab.name}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      )}
    </Show>
  )
}


function SpreadsheetGrid(props: {
  client: Client
  layout: SheetLayout
  target: CellAddr | undefined
  onNavigate: (sheet: string, cell: CellAddr) => void
}) {
  const ctx = useExtension()
  const id = createUniqueId()
  const controller = new AbortController()
  let scroller: HTMLDivElement | undefined
  let canvas: HTMLCanvasElement | undefined
  let frame = 0
  
  let painted: Painted | undefined
  
  let shown: { grid: GridMeta | undefined; links: DisplayList } | undefined
  
  const frames: FrameOrder = { requested: "", sent: 0, received: 0, pending: undefined }
  
  const scrolling = { at: -Infinity, timer: 0 }
  
  let opening = true
  
  let drag: "cells" | "rows" | "columns" | undefined
  let pressed: CellAddr | undefined

  onCleanup(() => {
    controller.abort()
    painted?.frame.bitmap.close()
  })

  
  
  const [view, setView] = createStore({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    frozenWidth: 0,
    frozenHeight: 0,
    header: 0,
    reachX: 0,
    reachY: 0,
  })

  
  
  const [end, setEnd] = createSignal<{ readonly x: number; readonly y: number } | undefined>(undefined, {
    equals: (previous, next) => previous?.x === next?.x && previous?.y === next?.y,
  })

  
  const [state, setState] = createStore<{
    selection: Selection
    hover: { cursor: string; title: string | undefined }
    failed: boolean
  }>({
    selection: selectionAt({ row: 0, col: 0 }),
    hover: { cursor: "default", title: undefined },
    failed: false,
  })

  const [ratio, setRatio] = createSignal(window.devicePixelRatio || 1)

  const info = () => props.layout.info
  const sheet = () => info().activeSheet
  const name = () => info().sheetNames[sheet()] ?? ""
  const frozen = () => ({ rows: info().frozenRows, cols: info().frozenCols })

  
  const area = () => {
    const limit = end()

    const width = Math.max(
      info().contentWidth,
      props.layout.chartWidth + view.frozenWidth,
      view.reachX,
      view.left + view.width,
    )

    const height = Math.max(
      info().contentHeight,
      props.layout.chartHeight + view.frozenHeight,
      view.reachY,
      view.top + view.height,
    )

    return {
      width: view.header + Math.min(limit ? limit.x + view.frozenWidth : Infinity, width + view.width),
      height: headerHeight + Math.min(limit ? limit.y + view.frozenHeight : Infinity, height + view.height),
    }
  }

  const selected = createMemo(() => coverMerges(normalizeRange(state.selection), props.layout.merges))

  const paint = () => {
    if (!scroller || !canvas) return

    const context = canvas.getContext("2d")

    if (!context) return

    const ratio = window.devicePixelRatio || 1
    const width = scroller.clientWidth
    const height = scroller.clientHeight
    const headers = { width: view.header || rowHeaderWidth(context, 99), height: headerHeight }
    const size = { width: width - headers.width, height: height - headers.height }

    if (size.width <= 0 || size.height <= 0) return

    if (opening) {
      opening = false
      setView({ width: size.width, height: size.height })
      open()
    }

    const limit = end()
    const left = clamp(scroller.scrollLeft, limit ? limit.x + view.frozenWidth - size.width : Infinity)
    const top = clamp(scroller.scrollTop, limit ? limit.y + view.frozenHeight - size.height : Infinity)

    
    
    const margin = { x: Math.round(size.width / 4), y: Math.round(size.height / 2) }
    const moving = performance.now() - scrolling.at < settleDelay
    const x = Math.max(0, left - margin.x)
    const y = Math.max(0, top - margin.y)

    const input: SheetFrameRequest = {
      sheet: sheet(),
      x: left,
      y: top,
      ...size,
      ratio,
      offset: { x: fraction(headers.width * ratio), y: fraction(headers.height * ratio) },
      wider:
        moving && limit
          ? {
              x,
              y,
              width: Math.min(left + size.width + margin.x, limit.x + view.frozenWidth) - x,
              height: Math.min(top + size.height + margin.y, limit.y + view.frozenHeight) - y,
            }
          : undefined,
    }

    
    
    const needed = limit && {
      x: Math.max(0, left - margin.x / 2),
      y: Math.max(0, top - margin.y / 2),
      right: Math.min(left + size.width + margin.x / 2, limit.x + view.frozenWidth),
      bottom: Math.min(top + size.height + margin.y / 2, limit.y + view.frozenHeight),
    }

    const serves = (frame: { readonly request: SheetFrameRequest; readonly viewport: SheetViewport } | undefined) =>
      !!frame &&
      !!needed &&
      interchangeable(frame.request, input) &&
      frame.viewport.x <= needed.x &&
      frame.viewport.y <= needed.y &&
      frame.viewport.x + frame.viewport.width >= needed.right &&
      frame.viewport.y + frame.viewport.height >= needed.bottom

    const pending = frames.pending

    if (
      !moving ||
      !(
        serves(painted && { request: painted.request, viewport: painted.frame.viewport }) ||
        serves(pending?.wider && { request: pending, viewport: pending.wider })
      )
    )
      request(input)

    
    if (!painted) return setView({ left, top, ...size })

    
    
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }

    paintCells(context, painted, { ratio, headers, x: left, y: top, ...size })

    const panes = painted.frame.frozen
    const drawn = painted.frame.viewport

    const grid =
      painted.frame.grid && shiftGrid(painted.frame.grid, frozen(), panes, { x: drawn.x - left, y: drawn.y - top })

    shown = { grid, links: { width: 0, height: 0, commands: [], hyperlinks: [...painted.frame.hyperlinks] } }

    if (grid) {
      const anchor = state.selection.anchor

      paintSelection(context, {
        grid,
        ratio,
        headers,
        ...size,
        range: selected(),
        active: coverMerges(
          { top: anchor.row, left: anchor.col, bottom: anchor.row, right: anchor.col },
          props.layout.merges,
        ),
      })
      paintHeaders(context, { grid, ratio, headers, width, height, selected: selected() })
    }

    
    const last = grid
      ? grid.rowOffsets.findLastIndex(
          (offset, position) => position < grid.rowOffsets.length - 1 && offset < size.height,
        )
      : -1

    const header = rowHeaderWidth(context, grid ? trackIndex(grid.startRow, grid.rowIndices, Math.max(0, last)) + 1 : 1)

    setView({ left, top, ...size, frozenWidth: panes.width, frozenHeight: panes.height, header })

    
    if (header !== headers.width) schedule()
  }

  
  
  const request = (input: SheetFrameRequest) => {
    const key = JSON.stringify(input)

    if (key === frames.requested) return

    frames.requested = key
    frames.pending = input

    const order = ++frames.sent

    const settled = () => {
      if (order === frames.sent) frames.pending = undefined
    }

    void props.client.call("frame", input, { key: "frame", signal: controller.signal }).then(
      (reply) => {
        settled()

        if (order < frames.received) return reply?.bitmap.close()

        frames.received = order
        
        
        setState("failed", !reply)

        if (!reply) return

        painted?.frame.bitmap.close()
        painted = { request: input, frame: reply }
        setEnd(reply.end)
        schedule()
      },
      (error: Error) => {
        settled()

        if (error instanceof SupersededError || controller.signal.aborted) return

        setState("failed", true)
      },
    )
  }

  
  const scrolled = () => {
    scrolling.at = performance.now()
    clearTimeout(scrolling.timer)
    scrolling.timer = window.setTimeout(schedule, settleDelay)
    schedule()
  }

  onCleanup(() => clearTimeout(scrolling.timer))

  
  const schedule = () => {
    if (frame) return

    frame = requestAnimationFrame(() => {
      frame = 0
      paint()
    })
  }

  onCleanup(() => cancelAnimationFrame(frame))
  createResizeObserver(() => scroller, schedule)

  
  
  createKeyed(ratio, (value) => {
    const query = window.matchMedia(`(resolution: ${value}dppx)`)

    const change = () => {
      setRatio(window.devicePixelRatio || 1)
      schedule()
    }

    query.addEventListener("change", change)
    onCleanup(() => query.removeEventListener("change", change))
  })

  
  const block = createMemo(
    () => {
      const focus = state.selection.focus
      const top = Math.max(0, (Math.floor(focus.row / readerBlock.rows) - 1) * readerBlock.rows)
      const left = Math.max(0, (Math.floor(focus.col / readerBlock.cols) - 1) * readerBlock.cols)

      return {
        top,
        left,
        bottom: Math.min(lastCell.row, top + readerBlock.rows * 3 - 1),
        right: Math.min(lastCell.col, left + readerBlock.cols * 3 - 1),
      }
    },
    undefined,
    { equals: (previous, next) => previous.top === next.top && previous.left === next.left },
  )

  const reading = createLatest(block, (range, signal) =>
    props.client.call("cells", { sheet: sheet(), range }, { signal }).then((texts) => ({ range, texts })),
  )

  
  const readable = createMemo(() => {
    const read = reading.latest

    if (!read) return { columns: [], rows: [] }

    const range = read.range
    const hidden = props.layout.hidden
    const tracks = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, step) => first + step)
    const columns = tracks(range.left, range.right).filter((col) => !hiddenAt(hidden.columns, col))

    return {
      columns,
      rows: tracks(range.top, range.bottom)
        .filter((row) => !hiddenAt(hidden.rows, row))
        .map((row) => ({
          row,
          cells: columns.map((col) => ({ row, col, text: read.texts[row - range.top]?.[col - range.left] ?? "" })),
        })),
    }
  })

  const cellID = (cell: CellAddr) => `${id}-${cell.row}-${cell.col}`

  
  
  const activeCell = () => {
    const focus = state.selection.focus
    const grid = readable()

    if (!grid.columns.includes(focus.col) || !grid.rows.some((row) => row.row === focus.row)) return undefined

    return cellID(focus)
  }

  
  const open = () => {
    const target = props.target

    
    if (target) {
      scroller?.focus({ preventScroll: true })
      select(at(target))
      reveal(target, "start")

      return
    }

    setView({ reachX: info().initialScrollX + view.width, reachY: info().initialScrollY + view.height })
    scroller?.scrollTo({ left: info().initialScrollX, top: info().initialScrollY })
  }

  const select = (selection: Selection) => {
    setState("selection", selection)
    schedule()
  }

  
  const at = (cell: CellAddr) => {
    const merge = props.layout.merges.find((candidate) => contains(candidate, cell))

    return selectionAt(merge ? { row: merge.top, col: merge.left } : cell)
  }

  
  
  const reveal = (cell: CellAddr, align: "start" | "nearest") => {
    if (!scroller || (align === "nearest" && whole(cell))) return

    
    const target = { row: cell.row, col: cell.col }

    void props.client
      .call("position", { sheet: sheet(), cell: target }, { key: "position", signal: controller.signal })
      .then(
        (position) => {
          if (!scroller || !position) return

          const start = position.start
          const next = position.next

          const left =
            cell.col < info().frozenCols
              ? scroller.scrollLeft
              : place(start.x, next.x - start.x, scroller.scrollLeft, view.width - view.frozenWidth, align)

          const top =
            cell.row < info().frozenRows
              ? scroller.scrollTop
              : place(start.y, next.y - start.y, scroller.scrollTop, view.height - view.frozenHeight, align)

          
          setView({ reachX: left + view.width, reachY: top + view.height })
          scroller.scrollTo({ left, top })
        },
        () => undefined,
      )
  }

  
  const whole = (cell: CellAddr) => {
    const grid = shown?.grid

    if (!grid) return false

    const rect = rangeRect(grid, { top: cell.row, left: cell.col, bottom: cell.row, right: cell.col })

    if (!rect) return false

    
    
    const clear = (start: number, pane: number, frozen: boolean) => frozen || (pane > 0 ? start > pane : start >= 0)

    return (
      clear(rect.x, view.frozenWidth, cell.col < info().frozenCols) &&
      clear(rect.y, view.frozenHeight, cell.row < info().frozenRows) &&
      rect.x + rect.w <= view.width &&
      rect.y + rect.h <= view.height
    )
  }

  
  
  const hit = (event: PointerEvent, held: boolean) => {
    const grid = shown?.grid

    if (!grid || !canvas) return undefined

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left - view.header
    const y = event.clientY - rect.top - headerHeight

    if (!held && (x >= view.width || y >= view.height)) return undefined

    const cell = cellAtPoint(
      grid,
      Math.min(Math.max(x, 0), view.width - 1, (grid.colOffsets[grid.colOffsets.length - 1] ?? 0) - 1),
      Math.min(Math.max(y, 0), view.height - 1, (grid.rowOffsets[grid.rowOffsets.length - 1] ?? 0) - 1),
    )

    if (!cell) return undefined

    if (held) return { kind: "cell" as const, cell }

    if (x < 0 && y < 0) return { kind: "all" as const, cell }

    if (y < 0) return { kind: "column" as const, cell }

    if (x < 0) return { kind: "row" as const, cell }

    return { kind: "cell" as const, cell }
  }

  const press = (event: PointerEvent) => {
    if (event.button !== 0 || !scroller) return

    const target = hit(event, false)

    if (!target) return

    const anchor = state.selection.anchor
    const shift = event.shiftKey

    scroller.setPointerCapture(event.pointerId)
    pressed = target.kind === "cell" && !shift ? target.cell : undefined

    
    if (target.kind === "all") {
      drag = undefined
      select({ anchor: { row: lastCell.row, col: lastCell.col }, focus: { row: 0, col: 0 } })

      return
    }

    if (target.kind === "column") {
      drag = "columns"
      select({
        anchor: { row: lastCell.row, col: shift ? anchor.col : target.cell.col },
        focus: { row: 0, col: target.cell.col },
      })

      return
    }

    if (target.kind === "row") {
      drag = "rows"
      select({
        anchor: { row: shift ? anchor.row : target.cell.row, col: lastCell.col },
        focus: { row: target.cell.row, col: 0 },
      })

      return
    }

    drag = "cells"
    select(shift ? extendTo(state.selection, target.cell) : at(target.cell))
  }

  const move = (event: PointerEvent) => {
    if (drag) {
      chase(drag, event)
      extend(drag, hit(event, true)?.cell)

      return
    }

    const target = hit(event, false)

    if (!target || target.kind !== "cell") return setState("hover", { cursor: "default", title: undefined })

    const link = linkAt(target.cell)

    setState("hover", {
      cursor: link ? "pointer" : "cell",
      title: link ? linkTitle(link) : undefined,
    })
  }

  
  const extend = (kind: "cells" | "rows" | "columns", cell: CellAddr | undefined) => {
    if (!cell) return

    const focus = state.selection.focus

    const next = {
      row: kind === "columns" ? 0 : cell.row,
      col: kind === "rows" ? 0 : cell.col,
    }

    if (next.row !== focus.row || next.col !== focus.col) select({ anchor: state.selection.anchor, focus: next })
  }

  
  
  const chase = (kind: "cells" | "rows" | "columns", event: PointerEvent) => {
    if (!scroller || !canvas) return

    const rect = canvas.getBoundingClientRect()
    const past = (point: number, start: number, end: number) => Math.min(0, point - start) + Math.max(0, point - end)

    scroller.scrollBy(
      kind === "rows" ? 0 : past(event.clientX, rect.left + view.header, rect.right),
      kind === "columns" ? 0 : past(event.clientY, rect.top + headerHeight, rect.bottom),
    )
  }

  const release = (event: PointerEvent) => {
    const was = drag
    const start = pressed

    drag = undefined
    pressed = undefined

    if (was !== "cells" || !start) return

    const cell = hit(event, false)?.cell

    if (cell && cell.row === start.row && cell.col === start.col) follow(cell)
  }

  
  const linkAt = (cell: CellAddr): HyperlinkRegion | undefined => {
    if (!shown) return undefined

    const origin = at(cell).anchor
    const link = hyperlinkAtCell(shown.links, origin.row, origin.col)

    if (!link) return undefined

    if (sheetLinkUrl(link) || (link.location && parseHyperlinkLocation(link.location, name()))) return link

    return undefined
  }

  const follow = (cell: CellAddr) => {
    const link = linkAt(cell)

    if (!link) return

    const url = sheetLinkUrl(link)

    if (url) return ctx.system.openExternal(url)

    const target = link.location ? parseHyperlinkLocation(link.location, name()) : null

    if (!target) return

    const destination = { row: target.row, col: target.col }

    if (target.sheetName.toLowerCase() !== name().toLowerCase()) return props.onNavigate(target.sheetName, destination)

    select(at(destination))
    reveal(destination, "start")
  }

  const limits = (bounded: boolean): SelectionLimits => {
    const rowsPerPage = Math.max(1, Math.floor((view.height - view.frozenHeight) / 20))

    if (!bounded) return { rows: lastCell.row + 1, cols: lastCell.col + 1, rowsPerPage }

    
    const used = props.layout.used
    const focus = state.selection.focus

    return {
      rows: Math.max((used?.bottom ?? 0) + 1, focus.row + 1),
      cols: Math.max((used?.right ?? 0) + 1, focus.col + 1),
      rowsPerPage,
    }
  }

  const key = (event: KeyboardEvent) => {
    const command = event.ctrlKey || event.metaKey

    if (command && !event.altKey && event.key.toLowerCase() === "c") {
      event.preventDefault()
      copy()

      return
    }

    
    if (event.key === "Tab" || event.altKey || event.isComposing) return

    
    if (event.key === "Enter" && !event.shiftKey && !command && linkAt(state.selection.anchor)) {
      event.preventDefault()
      follow(state.selection.anchor)

      return
    }

    
    if (command && event.key === "Home") {
      const home = { row: info().frozenRows, col: info().frozenCols }

      event.preventDefault()
      select(at(home))
      reveal(home, "start")

      return
    }

    const bounded =
      event.key === "Home" ||
      event.key === "End" ||
      (command && (event.key.startsWith("Arrow") || event.key.toLowerCase() === "a"))

    const action = selectionKeyReducer(
      state.selection,
      {
        key: event.key,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
      },
      limits(bounded),
    )

    
    if (action.type !== "move") return

    event.preventDefault()

    const next = skipHidden(
      state.selection.focus,
      settleMerges(state.selection, action.selection, props.layout.merges),
      props.layout.hidden,
    )

    select(next)

    
    if (!(command && event.key.toLowerCase() === "a")) reveal(next.focus, "nearest")
  }

  
  const copy = () => {
    const range = selected()
    const used = props.layout.used

    const clipped = {
      top: range.top,
      left: range.left,
      bottom: Math.min(range.bottom, Math.max(range.top, used?.bottom ?? 0)),
      right: Math.min(range.right, Math.max(range.left, used?.right ?? 0)),
    }

    if ((clipped.bottom - clipped.top + 1) * (clipped.right - clipped.left + 1) > copyLimit)
      return showToast({ title: ctx.t("sheet.copyTooLarge") })

    const failed = () => {
      if (!controller.signal.aborted) showToast({ title: ctx.t("sheet.copyFailed") })
    }

    void props.client.call("copy", { sheet: sheet(), range: clipped }, { signal: controller.signal }).then((text) => {
      if (text === undefined) return failed()

      return ctx.system.copy(text).catch(failed)
    }, failed)
  }

  return (
    <div class="relative flex min-h-0 flex-1">
      {}
      {}
      <div
        ref={scroller}
        dir="ltr"
        tabIndex={0}
        role="grid"
        aria-label={name()}
        aria-readonly="true"
        aria-multiselectable="true"
        aria-rowcount={lastCell.row + 2}
        aria-colcount={lastCell.col + 2}
        aria-activedescendant={activeCell()}
        class="peer relative min-h-0 min-w-0 flex-1 select-none overflow-auto outline-none"
        
        style={{ background: paper, cursor: state.hover.cursor }}
        title={state.hover.title}
        onScroll={scrolled}
        onKeyDown={key}
        onPointerDown={press}
        onPointerMove={move}
        onPointerUp={release}
        onPointerCancel={() => {
          drag = undefined
          pressed = undefined
        }}
      >
        <div
          aria-hidden="true"
          class="pointer-events-none absolute left-0 top-0"
          style={{ width: `${area().width}px`, height: `${area().height}px` }}
        />
        <div aria-hidden="true" class="sticky left-0 top-0 h-0 w-0">
          <canvas ref={canvas} class="absolute left-0 top-0 block" />
        </div>
        <div class="sr-only">
          <div role="row" aria-rowindex={1}>
            <span role="columnheader" aria-colindex={1} />
            <For each={readable().columns}>
              {(col) => (
                <span role="columnheader" aria-colindex={col + 2}>
                  {columnName(col)}
                </span>
              )}
            </For>
          </div>
          <For each={readable().rows}>
            {(row) => (
              <div role="row" aria-rowindex={row.row + 2}>
                <span role="rowheader" aria-colindex={1}>
                  {row.row + 1}
                </span>
                <For each={row.cells}>
                  {(cell) => (
                    <span
                      role="gridcell"
                      id={cellID(cell)}
                      aria-colindex={cell.col + 2}
                      aria-selected={contains(selected(), cell)}
                    >
                      {cell.text}
                    </span>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </div>
      {}
      <div class="pointer-events-none absolute inset-0 peer-focus-visible:shadow-[inset_0_0_0_2px_var(--v2-border-border-focus)]" />
      <Show when={state.failed}>
        <div
          role="status"
          class="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-v2-background-bg-base px-3 py-1.5 text-12-regular text-v2-text-text-muted shadow-[var(--v2-elevation-raised)]"
        >
          {ctx.t("sheet.paintFailed")}
        </div>
      </Show>
    </div>
  )
}


function linkTitle(link: HyperlinkRegion) {
  const target = sheetLinkUrl(link) ?? link.location ?? ""

  if (!link.tooltip || link.tooltip === target) return target

  return `${link.tooltip}\n${target}`
}


function sheetLinkUrl(link: HyperlinkRegion) {
  const url = safeExternalHyperlink(link)

  return url ? externalUrl(url) : undefined
}


function place(start: number, size: number, current: number, visible: number, align: "start" | "nearest") {
  if (align === "start" || start < current || size >= visible) return start

  if (start + size > current + visible) return start + size - visible

  return current
}


function interchangeable(left: SheetFrameRequest, right: SheetFrameRequest) {
  return (
    left.sheet === right.sheet &&
    left.ratio === right.ratio &&
    left.width === right.width &&
    left.height === right.height &&
    left.offset.x === right.offset.x &&
    left.offset.y === right.offset.y
  )
}

function clamp(value: number, max: number) {
  return Math.max(0, Math.min(value, max))
}


function fraction(value: number) {
  return value - Math.floor(value)
}
