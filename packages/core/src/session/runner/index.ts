export * as SessionRunner from "./index.js"

import type { FileSystem } from "../../filesystem.js"
import type { AIError } from "@chassis/ai"
import { Context, Data, Effect } from "effect"
import { SessionSchema } from "../schema.js"
import type { Promotable } from "../inbox.js"
import type { AgentNotFoundError, MessageDecodeError, StepFailedError } from "../error.js"
import { SessionRunnerModel } from "./model.js"
import type { Instructions } from "../../instructions/index.js"

export type RunError =
  | AIError
  | SessionRunnerModel.Error
  | MessageDecodeError
  | AgentNotFoundError
  | StepFailedError
  | Instructions.InitializationBlocked
  | FileSystem.DirectoryNotFoundError

export type Continuation = { readonly step: number }

export type DrainResult = Data.TaggedEnum<{
  Complete: {}
  Moved: { readonly continuation?: Continuation }
  Reloaded: { readonly force: boolean; readonly continuation?: Continuation }
}>
export const DrainResult = Data.taggedEnum<DrainResult>()


export interface Interface {
  
  readonly drain: (input: {
    readonly sessionID: SessionSchema.ID
    readonly force: boolean
    readonly continuation?: Continuation
    
    readonly promotable?: Promotable
  }) => Effect.Effect<DrainResult, RunError>
}

export class Service extends Context.Service<Service, Interface>()("@chassis/SessionRunner") {}
