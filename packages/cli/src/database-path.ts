import path from "node:path"
import { CHASSIS_CHANNEL } from "./version"

export function databasePath(data: string) {
  const filename =
    process.env.CHASSIS_DB ??
    (["latest", "dev", "beta", "next", "prod"].includes(CHASSIS_CHANNEL) ||
    process.env.CHASSIS_DISABLE_CHANNEL_DB === "1" ||
    process.env.CHASSIS_DISABLE_CHANNEL_DB === "true"
      ? "chassis.db"
      : `chassis-${CHASSIS_CHANNEL.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
  return filename === ":memory:" ? filename : path.resolve(data, filename)
}
