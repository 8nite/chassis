export * as ChassisWorkerd from "./workerd"

import { WorkerdProfile } from "./internal/workerd"
import type { LogOptions } from "./logging"
import { PromiseSdk } from "./promise"

export type Configuration = WorkerdProfile.Configuration

export interface CreateOptions extends WorkerdProfile.Options {
  readonly log?: LogOptions
  readonly plugins?: PromiseSdk.CreateOptions["plugins"]
  readonly instances?: PromiseSdk.CreateOptions["instances"]
}


export const create = ({ log, plugins, instances, ...options }: CreateOptions) => {
  const profile = WorkerdProfile.make(options)
  return PromiseSdk.create({ ...profile.options, log, plugins, instances }, { overrides: profile.replacements })
}

export type Interface = PromiseSdk.Interface
