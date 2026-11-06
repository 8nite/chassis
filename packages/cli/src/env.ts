import { Config } from "effect"








export const password = Config.Redacted("CHASSIS_PASSWORD").pipe(
  Config.orElse(() => Config.Redacted("CHASSIS_SERVER_PASSWORD")),
  Config.withDefault(undefined),
)

export function session() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[0] !== "CHASSIS_PASSWORD" && entry[0] !== "CHASSIS_SERVER_PASSWORD",
    ),
  )
}

export * as Env from "./env"
