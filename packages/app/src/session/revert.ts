import type { SessionMessageUser } from "@chassis/client/promise"
import { useComposerState } from "@/composer/persistence"
import { useData } from "@/runtime/server/current"
import { useServerSDK } from "@/runtime/server/client"
import { useWorkspaceLocation } from "@/workspaces/location"
import { useLanguage } from "@/runtime/i18n/language"

import { extractPromptContext, extractPromptFromMessage } from "@/composer/prompt"
import { promptLength } from "@/composer/prompt-parts"
import { showToast } from "@/shell/notifications/toast"
import type { SessionModel } from "./model"

export function createSessionRevert(input: {
  session: SessionModel
  setActiveMessage: (message: SessionMessageUser | undefined) => void
}) {
  const prompt = useComposerState()
  const server = useServerSDK()
  const data = useData()
  const location = useWorkspaceLocation()
  const language = useLanguage()

  const request = async <A>(action: () => Promise<A>) =>
    action()
      .then(() => true)
      .catch((error) => {
        showToast({
          title: language.t("common.requestFailed"),
          description: error instanceof Error ? error.message : String(error),
        })

        return false
      })

  const restore = (target: ReturnType<typeof prompt.capture>, message: SessionMessageUser) => {
    const restored = extractPromptFromMessage(message, {
      directory: location().directory,
      attachmentName: language.t("common.attachment"),
    })

    const context = extractPromptContext(message, { directory: location().directory })

    target.set(restored, promptLength(restored))
    
    target.context.replace([...context.comments, ...context.files])
  }

  const stage = async (message: SessionMessageUser, previous: SessionMessageUser | undefined) => {
    const sessionID = input.session.identity.params.id

    if (!sessionID) return
    const owner = input.session.ownership.capture()
    const target = prompt.capture()

    
    
    if (data.session.input.has(sessionID, message.id)) {
      if (!(await request(() => server.api.session.inbox.cancel({ sessionID, inboxID: message.id })))) return
      restore(target, message)
      owner.run(() => input.setActiveMessage(previous))

      return
    }

    
    
    
    if (!(await request(() => server.api.session.interrupt({ sessionID })))) return

    if (!(await request(() => server.api.session.wait({ sessionID })))) return

    if (!(await request(() => server.api.session.revert.stage({ sessionID, messageID: message.id })))) return
    
    
    restore(target, message)
    owner.run(() => input.setActiveMessage(previous))
  }

  const to = async (messageID: string) => {
    const messages = input.session.history.userMessages()
    const index = messages.findIndex((message) => message.id === messageID)
    const message = messages[index]

    if (!message) return
    await stage(message, messages[index - 1])
  }

  const undo = async () => {
    const messages = input.session.history.userMessages()
    const reverted = input.session.data.revertMessageID()
    const boundary = reverted ? messages.findIndex((message) => message.id === reverted) : messages.length

    if (boundary <= 0) return
    const message = messages[boundary - 1]

    if (message) await stage(message, messages[boundary - 2])
  }

  const redo = async () => {
    const sessionID = input.session.identity.params.id
    const reverted = input.session.data.revertMessageID()

    if (!sessionID || !reverted) return
    const owner = input.session.ownership.capture()

    
    if (!(await request(() => server.api.session.revert.clear({ sessionID })))) return
    owner.run(() =>
      input.setActiveMessage(
        input.session.history
          .userMessages()
          .filter((message) => !data.session.input.has(sessionID, message.id))
          .at(-1),
      ),
    )
  }

  return { to, undo, redo }
}

export type SessionRevert = ReturnType<typeof createSessionRevert>
