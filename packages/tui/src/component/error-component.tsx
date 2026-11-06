import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createSignal, For, Show } from "solid-js"
import { getScrollAcceleration } from "../util/scroll"
import { useClipboard } from "../context/clipboard"
import { useExit } from "../context/exit"
import { useTuiApp } from "../context/runtime"
import { describeOS, describeTerminal } from "../util/system"

export function ErrorComponent(props: { error: Error; reset: () => void; mode?: "dark" | "light" }) {
  const term = useTerminalDimensions()
  const exit = useExit()
  const clipboard = useClipboard()
  const app = useTuiApp()
  const [copyState, setCopyState] = createSignal<"idle" | "copied" | "failed">("idle")

  
  
  const isLight = props.mode === "light"
  const colors = isLight
    ? {
        bg: "#ffffff",
        element: "#f5f5f5",
        borderSubtle: "#d4d4d4",
        text: "#1a1a1a",
        muted: "#8a8a8a",
        primary: "#3b7dd8",
        onPrimary: "#ffffff",
        error: "#d1383d",
        success: "#3d9a57",
      }
    : {
        bg: "#0a0a0a",
        element: "#1e1e1e",
        borderSubtle: "#3c3c3c",
        text: "#eeeeee",
        muted: "#808080",
        primary: "#fab283",
        onPrimary: "#0a0a0a",
        error: "#e06c75",
        success: "#7fd88f",
      }

  const message = props.error.message || "An unknown error occurred."
  const stack = props.error.stack || "No stack trace available."
  const issueURL = buildIssueURL(message, stack, app.version)

  const copyReport = () => {
    void clipboard
      .write(issueURL.toString())
      .then(() => setCopyState("copied"))
      .catch(() => setCopyState("failed"))
  }

  const actions = [
    {
      key: "c",
      label: () => ({ idle: "Copy report", copied: "✓ Copied", failed: "Copy failed" })[copyState()],
      copy: true,
      onUse: copyReport,
    },
    { key: "r", label: () => "Restart", onUse: props.reset },
    { key: "q", label: () => "Quit", onUse: () => exit() },
  ]
  const [selected, setSelected] = createSignal(0)
  const move = (delta: number) => setSelected((prev) => (prev + delta + actions.length) % actions.length)
  let scroll: ScrollBoxRenderable | undefined

  useKeyboard((evt) => {
    if (evt.ctrl && evt.name === "c") return exit()
    if (evt.name === "return") {
      evt.preventDefault()
      evt.stopPropagation()
      return actions[selected()].onUse()
    }
    if (evt.name === "left") {
      evt.preventDefault()
      evt.stopPropagation()
      return move(-1)
    }
    if (evt.name === "right") {
      evt.preventDefault()
      evt.stopPropagation()
      return move(1)
    }
    if (evt.name === "tab") {
      evt.preventDefault()
      evt.stopPropagation()
      return move(evt.shift ? -1 : 1)
    }
    
    if (evt.name === "up") return scroll?.scrollBy(-1)
    if (evt.name === "down") return scroll?.scrollBy(1)
    if (evt.name === "pageup" && scroll) return scroll.scrollBy(-scroll.height)
    if (evt.name === "pagedown" && scroll) return scroll.scrollBy(scroll.height)
    if (evt.name === "home" && scroll) return scroll.scrollTo(0)
    if (evt.name === "end" && scroll) return scroll.scrollTo(scroll.scrollHeight)
    if (evt.name === "q") return exit()
    if (evt.name === "c") return copyReport()
    if (evt.name === "r") return props.reset()
  })

  
  const contentWidth = () => Math.min(84, Math.max(24, term().width - 4))
  const showSubtext = () => term().height >= 18
  const showFooter = () => term().height >= 20

  return (
    <box
      width={term().width}
      height={term().height}
      backgroundColor={colors.bg}
      flexDirection="column"
      alignItems="center"
    >
      <box width={contentWidth()} flexGrow={1} flexDirection="column" paddingTop={1} paddingBottom={1} gap={1}>
        {}
        <box flexDirection="column" alignItems="center" flexShrink={0}>
          <text attributes={TextAttributes.BOLD} fg={colors.text}>
            Chassis crashed
          </text>
          <Show when={showSubtext()}>
            <text fg={colors.muted}>An unexpected error stopped the session.</text>
          </Show>
        </box>

        {}
        <box
          flexShrink={0}
          border
          borderStyle="rounded"
          borderColor={colors.error}
          title=" Error "
          titleColor={colors.error}
          paddingLeft={2}
          paddingRight={2}
        >
          <text fg={colors.text}>{message}</text>
        </box>

        {}
        <box flexDirection="row" flexWrap="wrap" justifyContent="center" gap={2} rowGap={1} flexShrink={0}>
          <For each={actions}>
            {(action, index) => {
              const isSelected = () => selected() === index()
              const copyColor = () =>
                action.copy
                  ? copyState() === "copied"
                    ? colors.success
                    : copyState() === "failed"
                      ? colors.error
                      : undefined
                  : undefined
              return (
                <box flexDirection="column" alignItems="center" flexShrink={0}>
                  <box
                    onMouseDown={() => setSelected(index())}
                    onMouseUp={() => action.onUse()}
                    backgroundColor={copyColor() ?? (isSelected() ? colors.primary : colors.element)}
                    minWidth={15}
                    alignItems="center"
                    paddingLeft={2}
                    paddingRight={2}
                  >
                    <text
                      attributes={TextAttributes.BOLD}
                      fg={copyColor() || isSelected() ? colors.onPrimary : colors.text}
                    >
                      {action.label()}
                    </text>
                  </box>
                  <text fg={isSelected() ? colors.primary : colors.muted}>{action.key}</text>
                </box>
              )
            }}
          </For>
        </box>

        {}
        <box
          flexGrow={1}
          flexBasis={0}
          minHeight={3}
          border
          borderStyle="rounded"
          borderColor={colors.borderSubtle}
          title=" Stack trace "
          titleColor={colors.muted}
          bottomTitle=" ↑↓ scroll "
          bottomTitleAlignment="right"
          paddingLeft={1}
          paddingRight={1}
        >
          <scrollbox
            ref={(element: ScrollBoxRenderable) => (scroll = element)}
            flexGrow={1}
            scrollAcceleration={getScrollAcceleration()}
          >
            <text fg={colors.muted}>{stack}</text>
          </scrollbox>
        </box>

        {}
        <Show when={showFooter()}>
          <box flexDirection="column" alignItems="center" flexShrink={0}>
            <text fg={colors.muted}>
              {copyState() === "copied"
                ? "Report copied — paste it into a new GitHub issue."
                : copyState() === "failed"
                  ? "Clipboard write failed. Try again or report the crash manually."
                  : "Copy the report and open a GitHub issue to help us fix this."}
            </text>
            <text fg={colors.muted}>Chassis {app.version}</text>
          </box>
        </Show>
      </box>
    </box>
  )
}

function buildIssueURL(message: string, stack: string, version: string) {
  
  
  
  const url = new URL("https://github.com/8nite/chassis/issues/new?template=bug-report.yml")
  url.searchParams.set("title", `TUI crash: ${message}`)
  url.searchParams.set("chassis-version", version)
  url.searchParams.set("os", describeOS())
  url.searchParams.set("terminal", describeTerminal())
  url.searchParams.set(
    "reproduce",
    "Reported automatically from the Chassis crash screen. If you can, describe what you were doing when it crashed.",
  )

  
  
  
  
  const MAX_URL_LENGTH = 6000
  const marker = "\n… (truncated)"
  const head = `The Chassis TUI crashed with an unexpected error.\n\n**Error:** ${message}\n\n**Stack trace:**\n`
  const setBody = (body: string) => url.searchParams.set("description", head + "```\n" + body + "\n```")

  setBody(stack)
  if (url.toString().length <= MAX_URL_LENGTH) return url

  
  let lo = 0
  let hi = stack.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    setBody(stack.slice(0, mid) + marker)
    if (url.toString().length <= MAX_URL_LENGTH) lo = mid
    else hi = mid - 1
  }
  setBody(stack.slice(0, lo) + marker)
  return url
}
