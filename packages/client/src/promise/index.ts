import type { Chassis } from "./client.js"

export * from "./generated/index.js"
export { Chassis } from "./client.js"
export type {
  AgentApi,
  CommandApi,
  ConfigApi,
  EventApi,
  IntegrationApi,
  ModelApi,
  PluginApi,
  ProviderApi,
  ReferenceApi,
  RpcApi,
  RpcCallOptions,
  RpcClient,
  RpcEventPayload,
  WebSearchApi,
  SessionApi,
  SkillApi,
} from "./api.js"
export type { EventSubscribeOutput as ChassisEvent } from "./generated/types.js"
export type ChassisClient = ReturnType<typeof Chassis.make>
