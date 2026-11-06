import { createContext, useContext } from "solid-js"
import type { createExtensionAttachment } from "./host-apis"


const AttachmentContext = createContext<ReturnType<typeof createExtensionAttachment>>()

export function useExtensionAttachment() {
  const value = useContext(AttachmentContext)

  if (!value) throw new Error("Extension attachment is unavailable")

  return value
}

export const ExtensionAttachmentProvider = AttachmentContext.Provider
