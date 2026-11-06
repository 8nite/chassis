export * as ChassisWorkerd from "./workerd"

import { Layer } from "effect"
import type { Config, Scope } from "effect"
import { WorkerdProfile } from "../internal/workerd"
import { Chassis } from "./chassis"

export type Configuration = WorkerdProfile.Configuration

export interface CreateOptions<R = never> extends WorkerdProfile.Options {
  readonly log?: Chassis.CreateOptions["log"]
  readonly plugins?: Chassis.CreateOptions["plugins"]
  readonly workspaceProviders?: Chassis.CreateOptions["workspaceProviders"]
  readonly instances?: Chassis.CreateOptions<R>["instances"]
}

export const create = <R = never>({ log, plugins, workspaceProviders, instances, ...options }: CreateOptions<R>) => {
  const profile = WorkerdProfile.make(options)
  return Chassis.create(
    { ...profile.options, log, plugins, workspaceProviders, instances },
    { overrides: profile.replacements },
  )
}

export const layer = <R = never>(
  options: CreateOptions<R>,
): Layer.Layer<Chassis.Service, Config.ConfigError | Error, Exclude<R, Scope.Scope>> =>
  Layer.effect(Chassis.Service, create(options))

export type Interface = Chassis.Interface
export type Requirements = Scope.Scope
