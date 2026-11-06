import { isShellNotFoundError, type ShellOutputInput, type ShellOutputOutput } from "@chassis/client/promise"


export const SHELL_OUTPUT_TAIL_BYTES = 64 * 1024

const PROGRESS_LIMIT = 32

type Progress = { cursor: number; output: string; state: "partial" | "complete" | "missing" }




const progress = new Map<string, Progress>()

function remember(id: string, entry: Progress) {
  progress.delete(id)
  progress.set(id, entry)

  if (progress.size <= PROGRESS_LIMIT) return
  const oldest = progress.keys().next().value

  if (oldest !== undefined) progress.delete(oldest)
}

export function followShellOutput(input: {
  id: string
  directory: string
  running: boolean
  load: (input: ShellOutputInput) => Promise<ShellOutputOutput>
  onOutput: (output: string) => void
}) {
  const cached = progress.get(input.id)

  if (cached) {
    remember(input.id, cached)
    input.onOutput(cached.output)
  }

  
  
  if (cached?.state === "missing" || (cached?.state === "complete" && !input.running)) return () => {}

  let cursor = cached?.cursor ?? 0
  let text = cached?.output ?? ""
  let loading = false
  let disposed = false

  const read = async () => {
    if (loading) return
    loading = true

    while (true) {
      const page = await input.load({ id: input.id, location: { directory: input.directory }, cursor }).then(
        (response) => response.data,
        (cause: unknown) => (isShellNotFoundError(cause) ? "missing" : undefined),
      )

      if (disposed) break

      if (page === "missing") {
        
        remember(input.id, { cursor, output: text, state: "missing" })
        clearInterval(interval)
        break
      }

      if (!page) break
      const advanced = page.cursor > cursor
      cursor = Math.max(cursor, page.cursor)
      text = (text + page.output).slice(-SHELL_OUTPUT_TAIL_BYTES)
      const complete = !input.running && cursor >= page.size
      remember(input.id, { cursor, output: text, state: complete ? "complete" : "partial" })
      input.onOutput(text)

      if (input.running || complete || !advanced) break
    }

    loading = false
  }

  void read()
  
  const interval = input.running ? setInterval(() => void read(), 1_000) : undefined

  return () => {
    disposed = true
    clearInterval(interval)
  }
}
