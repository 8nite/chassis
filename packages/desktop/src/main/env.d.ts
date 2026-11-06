interface ImportMetaEnv {
  readonly CHASSIS_CHANNEL: string
  readonly CHASSIS_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
