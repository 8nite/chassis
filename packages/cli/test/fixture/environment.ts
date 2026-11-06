import os from "node:os"
import path from "node:path"



export const transpilerCache = path.join(os.tmpdir(), "chassis-test-transpiler-cache")

export function isolatedEnv(root: string, overrides: Record<string, string | undefined> = {}) {
  return {
    ...process.env,
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: transpilerCache,
    HOME: root,
    CHASSIS_CLI_CONFIG_CONTENT: undefined,
    CHASSIS_CONFIG_CONTENT: "{}",
    CHASSIS_CONFIG_DIR: path.join(root, "config"),
    CHASSIS_DB: path.join(root, "chassis.db"),
    CHASSIS_DISABLE_FILEWATCHER: "true",
    CHASSIS_DISABLE_MODELS_FETCH: "true",
    CHASSIS_TEST_HOME: root,
    XDG_CACHE_HOME: path.join(root, "cache"),
    XDG_CONFIG_HOME: path.join(root, "xdg-config"),
    XDG_DATA_HOME: path.join(root, "data"),
    XDG_STATE_HOME: path.join(root, "state"),
    ...overrides,
  }
}
