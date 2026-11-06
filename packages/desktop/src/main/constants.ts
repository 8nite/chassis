import { app } from "electron"

type Channel = "local" | "dev" | "beta" | "prod"

const raw = import.meta.env.CHASSIS_CHANNEL

export const CHANNEL: Channel = raw === "local" || raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const VERSION = app.isPackaged ? app.getVersion() : (process.env.CHASSIS_VERSION ?? app.getVersion())

const appNames: Record<string, string> = {
  dev: "Chassis Dev",
  beta: "Chassis Beta",
  prod: "Chassis",
}

const appIDs: Record<string, string> = {
  dev: "ai.chassis.desktop.dev",
  beta: "ai.chassis.desktop.beta",
  prod: "ai.chassis.desktop",
}


export const APP_NAME = app.isPackaged ? appNames[CHANNEL] : "Chassis Dev"

export const APP_ID = app.isPackaged ? appIDs[CHANNEL] : "ai.chassis.desktop.dev"
