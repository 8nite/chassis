export const DESKTOP_NATIVE_LOCALES = [
  "en",
] as const

export type DesktopNativeLocale = (typeof DESKTOP_NATIVE_LOCALES)[number]

export const DESKTOP_NATIVE_LABELS: Record<DesktopNativeLocale, string> = {
  en: "English",
}

export const DESKTOP_NATIVE_LOCALE_TAGS: Record<DesktopNativeLocale, string> = {
  en: "en",
}

export function detectDesktopNativeLocale(languages: readonly string[]): DesktopNativeLocale {
  return "en"
}

export function desktopNativePluralCategories(locale: DesktopNativeLocale) {
  return new Intl.PluralRules(DESKTOP_NATIVE_LOCALE_TAGS[locale]).resolvedOptions().pluralCategories
}

function locale(value: string) {
  try {
    return new Intl.Locale(value).maximize()
  } catch {
    return undefined
  }
}


const normalizeScript = (script?: string) => (script === "Aran" ? "Arab" : script)

export const DESKTOP_NATIVE_ENGLISH = {
  "desktop.menu.app": "Chassis",
  "desktop.menu.file": "File",
  "desktop.menu.edit": "Edit",
  "desktop.menu.view": "View",
  "desktop.menu.go": "Go",
  "desktop.menu.window": "Window",
  "desktop.menu.help": "Help",
  "desktop.menu.installCli": "Install CLI…",
  "desktop.menu.settings": "Settings",
  "desktop.menu.reloadWebview": "Reload Webview",
  "desktop.menu.restart": "Restart",
  "desktop.menu.exportLogs": "Export Logs…",
  "desktop.menu.newSession": "New Session",
  "desktop.menu.openProject": "Open Project…",
  "desktop.menu.newWindow": "New Window",
  "desktop.menu.closeWindow": "Close Window",
  "desktop.menu.undo": "Undo",
  "desktop.menu.redo": "Redo",
  "desktop.menu.cut": "Cut",
  "desktop.menu.copy": "Copy",
  "desktop.menu.paste": "Paste",
  "desktop.menu.delete": "Delete",
  "desktop.menu.selectAll": "Select All",
  "desktop.menu.toggleSidebar": "Toggle Sidebar",
  "desktop.menu.toggleTerminal": "Toggle Terminal",
  "desktop.menu.toggleFileTree": "Toggle File Tree",
  "desktop.menu.reload": "Reload",
  "desktop.menu.toggleDeveloperTools": "Toggle Developer Tools",
  "desktop.menu.actualSize": "Actual Size",
  "desktop.menu.zoomIn": "Zoom In",
  "desktop.menu.zoomOut": "Zoom Out",
  "desktop.menu.toggleFullScreen": "Toggle Full Screen",
  "desktop.menu.back": "Back",
  "desktop.menu.forward": "Forward",
  "desktop.menu.previousSession": "Previous Session",
  "desktop.menu.nextSession": "Next Session",
  "desktop.menu.previousProject": "Previous Project",
  "desktop.menu.nextProject": "Next Project",
  "desktop.menu.minimize": "Minimize",
  "desktop.menu.maximize": "Maximize",
  "desktop.menu.documentation": "Chassis Documentation",
  "desktop.menu.supportForum": "Support Forum",
  "desktop.menu.shareFeedback": "Share Feedback",
  "desktop.menu.reportBug": "Report a Bug",
  "desktop.menu.ariaLabel": "Chassis menu",

  "desktop.cli.installed.title": "CLI Installed",
  "desktop.cli.installed.message": "CLI installed to {{path}}\n\nRestart your terminal to use the 'chassis' command.",
  "desktop.cli.failed.title": "Installation Failed",
  "desktop.cli.failed.message": "Failed to install CLI: {{error}}",

  "desktop.recovery.action.relaunch": "Relaunch",
  "desktop.recovery.action.exportLogs": "Export Logs",
  "desktop.recovery.action.keepWaiting": "Keep Waiting",
  "desktop.recovery.action.quit": "Quit",
  "desktop.recovery.loadFailed": "Chassis failed to load",
  "desktop.recovery.terminated": "Chassis window terminated unexpectedly",
  "desktop.recovery.unresponsive": "Chassis is not responding",
  "desktop.recovery.unresponsive.detail": "You can relaunch the app, open the logs, or keep waiting.",
  "desktop.recovery.loadFailed.detail": "Window: {{window}}\nURL: {{url}}\nError: {{code}} {{description}}",
  "desktop.recovery.terminated.detail": "Window: {{window}}\nReason: {{reason}}\nCode: {{code}}",
  "desktop.recovery.unknown": "<unknown>",

  "desktop.dialog.chooseFolder": "Choose a folder",
  "desktop.dialog.chooseFile": "Choose a file",
  "desktop.dialog.saveFile": "Save file",
  "desktop.dialog.files": "Files",
  "desktop.server.local": "Local Server",
  "desktop.onboarding.defaultProject": "Default Project",

  "desktop.picker.error.notSelected": "File was not selected by the picker",
  "desktop.picker.error.sizeLimit": "Selected attachments exceed the {{limit}} MB limit",
} as const

export type DesktopNativeKey = keyof typeof DESKTOP_NATIVE_ENGLISH

export type DesktopNativeMessages = Record<DesktopNativeKey, string>

export type DesktopNativeBundle = { locale: DesktopNativeLocale; messages: DesktopNativeMessages }

export const DESKTOP_NATIVE_KEYS = Object.keys(DESKTOP_NATIVE_ENGLISH) as DesktopNativeKey[]

export const DESKTOP_NATIVE_MAX_PAYLOAD_BYTES = 64 * 1024

export function createDesktopNativeBundle(
  locale: DesktopNativeLocale,
  translate: (key: DesktopNativeKey) => string,
): DesktopNativeBundle {
  return {
    locale,
    messages: Object.fromEntries(DESKTOP_NATIVE_KEYS.map((key) => [key, translate(key)])) as DesktopNativeMessages,
  }
}

export function parseDesktopNativeBundle(value: unknown): DesktopNativeBundle | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined

  try {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > DESKTOP_NATIVE_MAX_PAYLOAD_BYTES) return undefined
  } catch {
    return undefined
  }

  const bundle = value as { locale?: unknown; messages?: unknown }

  if (!DESKTOP_NATIVE_LOCALES.some((locale) => locale === bundle.locale)) return undefined

  if (!bundle.messages || typeof bundle.messages !== "object" || Array.isArray(bundle.messages)) return undefined
  const messages = bundle.messages as Record<string, unknown>
  const keys = Object.keys(messages)

  if (keys.length !== DESKTOP_NATIVE_KEYS.length) return undefined

  if (!DESKTOP_NATIVE_KEYS.every((key) => typeof messages[key] === "string")) return undefined

  if (!keys.every((key) => key in DESKTOP_NATIVE_ENGLISH)) return undefined

  return bundle as DesktopNativeBundle
}

export function formatDesktopNativeMessage(message: string, params?: Record<string, string | number>) {
  if (!params) return message

  return message.replace(/\{\{([^{}]+)\}\}/g, (match, key: string) => {
    const value = params[key]

    return value === undefined ? match : String(value)
  })
}
