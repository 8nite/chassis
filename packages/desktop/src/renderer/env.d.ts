import type { ElectronNative } from "../preload/types"

declare global {
  interface ImportMetaEnv {
    readonly CHASSIS_TEST_ONBOARDING: boolean
  }

  interface Window {
    electron: ElectronNative
    __CHASSIS__?: {
      deepLinks?: string[]
    }
  }
}
