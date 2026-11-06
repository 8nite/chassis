

import type { Effect } from "effect"
import type { Chassis } from "./client.js"

export * from "./generated/index"
export { Chassis } from "./client.js"
export type {
  AgentApi,
  AppApi,
  CommandApi,
  ConfigApi,
  EventApi,
  IntegrationApi,
  ModelApi,
  PluginApi,
  ProviderApi,
  ReferenceApi,
  RpcApi,
  RpcClient,
  WebSearchApi,
  SessionApi,
  SkillApi,
} from "./api.js"
export { Agent } from "@chassis/schema/agent"
export { Command } from "@chassis/schema/command"
export { Config } from "@chassis/schema/config"
export { Credential } from "@chassis/schema/credential"
export { Event } from "@chassis/schema/event"
export { EventLog } from "@chassis/schema/event-log"
export { FileSystem } from "@chassis/schema/filesystem"
export { Form } from "@chassis/schema/form"
export { Integration } from "@chassis/schema/integration"
export { Location } from "@chassis/schema/location"
export { Model } from "@chassis/schema/model"
export { Permission } from "@chassis/schema/permission"
export { PermissionSaved } from "@chassis/schema/permission-saved"
export { Project } from "@chassis/schema/project"
export { Worktree } from "@chassis/schema/worktree"
export { Vcs } from "@chassis/schema/vcs"
export { Provider } from "@chassis/schema/provider"
export { Pty } from "@chassis/schema/pty"
export { Question } from "@chassis/schema/question"
export { Reference } from "@chassis/schema/reference"
export { WebSearch } from "@chassis/schema/websearch"
export { AbsolutePath, RelativePath } from "@chassis/schema/schema"
export { Session } from "@chassis/schema/session"
export { SessionInbox } from "@chassis/schema/session-inbox"
export { SessionMessage } from "@chassis/schema/session-message"
export { Skill } from "@chassis/schema/skill"
export { Prompt } from "@chassis/schema/prompt"
export { PromptInput } from "@chassis/schema/prompt-input"
export type { ChassisEvent } from "@chassis/protocol/groups/event"
export type ChassisClient = Effect.Success<ReturnType<typeof Chassis.make>>
