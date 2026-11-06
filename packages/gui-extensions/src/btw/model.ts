import { batch, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { showToast } from "@chassis/ui/toast"
import type { MountedSession, SetupContext } from "../sdk"
import type Btw from "./index"

const instructions = [
  "The user is asking a quick side question about the conversation so far.",
  "Answer directly and concisely in markdown from what you already know.",
  "Do not call any tools and do not take any actions.",
].join(" ")


export function createBtw(ctx: SetupContext<typeof Btw>) {
  const controllers = new Map<string, AbortController>()
  const [requests, setRequests] = createStore<{ pending: string[] }>({ pending: [] })
  const saved = (session: MountedSession) => ctx.stores.chats(session)

  const stop = (id: string) => {
    controllers.get(id)?.abort()
    controllers.delete(id)
    setRequests("pending", (list) => list.filter((item) => item !== id))
  }

  
  
  onCleanup(() => Array.from(controllers.keys()).forEach(stop))

  const entry = (session: MountedSession, id: string) => saved(session).value?.chats.find((item) => item.id === id)
  const pending = (id: string) => requests.pending.includes(id)

  
  const generate = (session: MountedSession, id: string, question: string) => {
    if (pending(id)) return

    const store = saved(session)
    const controller = new AbortController()
    controllers.set(id, controller)
    setRequests("pending", (list) => [...list, id])

    return (
      session.server.client.session
        .generate(
          { sessionID: session.id, prompt: [instructions, question].join("\n\n") },
          { signal: controller.signal },
        )
        .then((result) => {
          if (ctx.signal.aborted || controller.signal.aborted) return
          store.update((draft) => {
            const chat = draft.chats.find((item) => item.id === id)

            if (chat) chat.answer = result.text.trim()
          })
        })
        
        .catch(() => undefined)
        .finally(() => {
          if (controllers.get(id) === controller) stop(id)
        })
    )
  }

  const ask = (value?: string) => {
    const question = value?.trim()

    if (!question) {
      showToast({ title: ctx.t("question.required") })

      return
    }

    const session = ctx.sessions.current()

    if (!session?.id) return

    const id = crypto.randomUUID()

    
    
    
    batch(() => {
      saved(session).update((draft) => {
        draft.chats.push({ id, question })
      })
      ctx.layout.open(`${ctx.id}:${id}`, session, { tab: "select" })
    })
    void generate(session, id, question)
  }

  return {
    ask,
    saved,
    pending,
    question: (session: MountedSession, id: string) => entry(session, id)?.question,
    answer: (session: MountedSession, id: string) => entry(session, id)?.answer,
    error: (session: MountedSession, id: string) => {
      const item = entry(session, id)

      return !!item && item.answer === undefined && !pending(id)
    },
    retry: (session: MountedSession, id: string) => {
      const question = entry(session, id)?.question

      if (question) void generate(session, id, question)
    },
    
    remove: (session: MountedSession, id: string) => {
      stop(id)
      saved(session).update((draft) => {
        draft.chats = draft.chats.filter((item) => item.id !== id)
      })
    },
  }
}

export type BtwModel = ReturnType<typeof createBtw>
