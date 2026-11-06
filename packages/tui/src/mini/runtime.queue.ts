









import { SessionMessage } from "@chassis/schema/session-message"
import { Locale } from "../util/locale"
import { isCompactCommand, isExitCommand, isNewCommand } from "./prompt.shared"
import type { FooterApi, FooterEvent, RunDelivery, RunPrompt } from "./types"

type Trace = {
  write(type: string, data?: unknown): void
}

export type QueueInput = {
  footer: FooterApi
  initialInput?: string
  trace?: Trace
  onSend?: (prompt: RunPrompt, emittedUser: boolean) => void
  onAdmissionError?: (prompt: RunPrompt, error: unknown) => void | Promise<void>
  onNewSession?: () => void | Promise<void>
  onCompact?: () => void | Promise<void>
  admit: (prompt: RunPrompt, delivery: RunDelivery, signal: AbortSignal) => Promise<void>
  settle: () => Promise<void>
  run: (prompt: RunPrompt, signal: AbortSignal, admitted: () => void) => Promise<void>
}

type State = {
  queue: RunPrompt[]
  active?: RunPrompt
  admission?: Promise<void>
  ctrl?: AbortController
  closed: boolean
}






export async function runPromptQueue(input: QueueInput): Promise<void> {
  const stop = Promise.withResolvers<{ type: "closed" }>()
  const done = Promise.withResolvers<void>()
  const state: State = {
    queue: [],
    closed: input.footer.isClosed,
  }
  let draining: Promise<void> | undefined
  let admissions = Promise.resolve()
  let admissionVersion = 0
  const admissionController = new AbortController()

  const emit = (next: FooterEvent, row: Record<string, unknown>) => {
    input.trace?.write("ui.patch", row)
    input.footer.event(next)
  }

  const finish = () => {
    if (!state.closed || draining) {
      return
    }

    done.resolve()
  }

  const close = () => {
    if (state.closed) {
      return
    }

    state.closed = true
    state.queue.length = 0
    
    if (state.active?.mode === "shell") state.ctrl?.abort()
    admissionController.abort()
    stop.resolve({ type: "closed" })
    finish()
  }

  const drain = () => {
    if (draining || state.closed || state.queue.length === 0) {
      return
    }

    draining = (async () => {
      try {
        while (!state.closed && state.queue.length > 0) {
          const prompt = state.queue.shift()!

          if (prompt.mode !== "shell" && isNewCommand(prompt.text)) {
            if (!input.onNewSession) {
              emit(
                {
                  type: "stream.patch",
                  patch: {
                    status: "new sessions unavailable",
                  },
                },
                {
                  status: "new sessions unavailable",
                },
              )
              continue
            }

            emit(
              {
                type: "stream.patch",
                patch: {
                  phase: "running",
                  status: "starting new session",
                },
              },
              {
                phase: "running",
                status: "starting new session",
              },
            )
            await input.onNewSession()
            continue
          }

          if (prompt.mode !== "shell" && isCompactCommand(prompt.text)) {
            emit(
              {
                type: "stream.patch",
                patch: {
                  phase: "running",
                  status: "compacting session",
                },
              },
              {
                phase: "running",
                status: "compacting session",
              },
            )
            await input.onCompact?.()
            continue
          }

          const sent =
            prompt.mode === "shell"
              ? prompt
              : {
                  ...prompt,
                  messageID: prompt.messageID ?? SessionMessage.ID.create(),
                }
          state.active = sent

          emit(
            { type: "turn.send" },
            {
              phase: "running",
              status: "sending prompt",
            },
          )
          const start = Date.now()
          const ctrl = new AbortController()
          const admission = Promise.withResolvers<void>()
          const version = admissionVersion
          state.ctrl = ctrl
          state.admission = admission.promise

          try {
            await input.footer.idle()
            if (state.closed) {
              break
            }

            input.onSend?.(sent, false)

            if (state.closed) {
              break
            }

            const task = input.run(sent, ctrl.signal, admission.resolve).then(
              () => ({ type: "done" as const }),
              (error) => ({ type: "error" as const, error }),
            )

            const next = await Promise.race([task, stop.promise])
            if (next.type === "closed") {
              break
            }

            if (next.type === "error") {
              throw next.error
            }
            if (sent.mode !== "shell" && admissionVersion !== version) {
              do {
                const current = admissionVersion
                await admissions
                if (state.closed) break
                await input.settle()
                if (current === admissionVersion) break
              } while (!state.closed)
            }
          } finally {
            admission.resolve()
            if (state.ctrl === ctrl) {
              state.ctrl = undefined
            }
            if (state.admission === admission.promise) state.admission = undefined

            if (sent.mode !== "shell") {
              const duration = Locale.duration(Math.max(0, Date.now() - start))
              emit(
                {
                  type: "turn.duration",
                  duration,
                },
                {
                  duration,
                },
              )
            }
            state.active = undefined
          }
        }
      } catch (error) {
        done.reject(error)
        return
      } finally {
        draining = undefined
        emit(
          { type: "turn.idle" },
          {
            phase: "idle",
            status: "",
          },
        )
      }

      finish()
    })()
  }

  const submit = (prompt: RunPrompt) => {
    if (
      state.closed ||
      (!prompt.text.trim() && (prompt.mode === "shell" || !prompt.parts.some((part) => part.type === "file")))
    ) {
      return
    }

    if (prompt.mode !== "shell" && isExitCommand(prompt.text)) {
      input.footer.close()
      return
    }

    const active = state.active
    if (
      active &&
      active.mode !== "shell" &&
      prompt.mode !== "shell" &&
      prompt.command?.source !== "skill" &&
      !isNewCommand(prompt.text) &&
      !isCompactCommand(prompt.text) &&
      !state.queue.some((item) => item.mode !== "shell" && (isNewCommand(item.text) || isCompactCommand(item.text)))
    ) {
      const sent = { ...prompt, messageID: SessionMessage.ID.create() }
      const admission = state.admission
      admissionVersion += 1
      const delivery = prompt.delivery ?? "queue"
      input.onSend?.(sent, false)
      admissions = admissions
        .then(() => admission)
        .then(() => input.admit(sent, delivery, admissionController.signal))
        .catch((error) => (state.closed ? undefined : input.onAdmissionError?.(sent, error)))
      return
    }

    state.queue.push(prompt)
    if (prompt.mode !== "shell" && (isNewCommand(prompt.text) || isCompactCommand(prompt.text))) {
      drain()
      return
    }

    emit(
      {
        type: "first",
        first: false,
      },
      {
        first: false,
      },
    )
    drain()
  }

  const offPrompt = input.footer.onPrompt((prompt) => {
    submit(prompt)
  })
  const offClose = input.footer.onClose(() => {
    close()
  })
  try {
    if (state.closed) {
      return
    }

    submit({
      text: input.initialInput ?? "",
      parts: [],
    })
    finish()
    await done.promise
  } finally {
    offPrompt()
    offClose()
    close()
    await draining?.catch(() => {})
    await admissions
  }
}
