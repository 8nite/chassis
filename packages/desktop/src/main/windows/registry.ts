

export function createWindowRegistry<W>(persistence: {
  read: () => unknown
  write: (ids: string[]) => void
}) {
  const windows = new Map<string, W>()
  let quitting = false
  let lastFocusedID: string | undefined

  const persisted = () => {
    const value = persistence.read()

    if (!Array.isArray(value)) return []

    return value.filter((id): id is string => typeof id === "string" && id.length > 0)
  }

  return {
    persisted,
    setQuitting(value = true) {
      quitting = value
    },
    register(id: string, window: W) {
      windows.set(id, window)
      const ids = persisted()

      if (!ids.includes(id)) persistence.write([...ids, id])
    },
    focused(id: string) {
      lastFocusedID = id
    },
    lastFocused() {
      if (!lastFocusedID) return

      return windows.get(lastFocusedID)
    },
    get(id: string) {
      return windows.get(id)
    },
    list() {
      return [...windows.values()]
    },
    closed(id: string) {
      windows.delete(id)

      if (lastFocusedID === id) lastFocusedID = windows.keys().next().value

      
      
      
      
      if (quitting || windows.size === 0) return false
      persistence.write(persisted().filter((item) => item !== id))

      return true
    },
  }
}
