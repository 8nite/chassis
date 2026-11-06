declare const CHASSIS_VERSION: string
declare const CHASSIS_CHANNEL: string
declare const CHASSIS_ARTIFACT: string

const version = typeof CHASSIS_VERSION === "string" ? CHASSIS_VERSION : "local"
const channel = typeof CHASSIS_CHANNEL === "string" ? CHASSIS_CHANNEL : "local"
const artifact = typeof CHASSIS_ARTIFACT === "string" ? CHASSIS_ARTIFACT : "cli"

export { version as CHASSIS_VERSION, channel as CHASSIS_CHANNEL, artifact as CHASSIS_ARTIFACT }
export const CHASSIS_LOCAL = channel === "local"
