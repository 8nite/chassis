import { Context, Effect, Layer } from "effect"
import { Agent } from "./agent.js"
import { AISDK } from "./aisdk.js"
import { Model } from "./model.js"
import { Provider } from "./provider.js"
import { Command } from "./command.js"
import { Config } from "./config.js"
import { LayerNode } from "@chassis/util/effect/layer-node"
import { Node } from "@chassis/util/effect/app-node"
import { FileMutation } from "./file-mutation.js"
import { Environment } from "./environment/index.js"
import { Formatter } from "./formatter.js"
import { FileSystem } from "./filesystem.js"
import { FileSystemSearch } from "./filesystem/search.js"
import { Generate } from "./generate.js"
import { Form } from "./form.js"
import { Image } from "./image.js"
import { LocationWatcher } from "./filesystem/location-watcher.js"
import { Integration } from "./integration.js"
import { Location } from "./location.js"
import { LocationLifecycle } from "./location-lifecycle.js"
import { FileAccess } from "./file-access.js"
import { ModelResolver } from "./model-resolver.js"
import { Mcp } from "./mcp/index.js"
import { Permission } from "./permission.js"
import { Plugin } from "./plugin.js"
import { PluginHooks } from "./plugin/hooks.js"
import { InstancePlugins } from "./plugin/instance.js"
import { PluginSupervisor } from "./plugin/supervisor.js"
import { WorktreeStrategies } from "./worktree/strategies.js"
import { Pty } from "./pty.js"
import { Shell } from "./shell.js"
import { ShellSelect } from "./shell/select.js"
import { Reference } from "./reference.js"
import { Rpc } from "./rpc.js"
import { WebSearch } from "./websearch.js"
import { ReferenceInstructions } from "./reference/instructions.js"
import { SessionRunnerLLM } from "./session/runner/llm.js"
import { SessionRunnerModel } from "./session/runner/model.js"
import { SessionCompaction } from "./session/compaction.js"
import { SessionTitle } from "./session/title.js"
import { SessionContext } from "./session/context.js"
import { Skill } from "./skill.js"
import { SkillInstructions } from "./skill/instructions.js"
import { Snapshot } from "./snapshot.js"
import { InstructionDiscovery } from "./instruction-discovery.js"
import { InstructionBuiltIns } from "./instructions/builtins.js"
import { InstructionEntry } from "./session/instruction-entry.js"
import { SessionInstructions } from "./session/instructions.js"
import { McpTool } from "./tool/mcp.js"
import { ReadToolFileSystem } from "./tool/read-filesystem.js"
import { Tool } from "./tool.js"
import { ToolOutput } from "./tool-output.js"
import { Vcs } from "./vcs.js"

export * as Instance from "./instance.js"
export { Service, node, type Interface } from "./instance/service.js"

const nodes = [
  Location.node,
  LocationLifecycle.node,
  Environment.node,
  Config.node,
  Agent.node,
  Command.node,
  Reference.node,
  Rpc.node,
  WebSearch.node,
  Integration.node,
  Provider.node,
  Model.node,
  ModelResolver.node,
  AISDK.node,
  Plugin.node,
  PluginHooks.node,
  InstancePlugins.node,
  PluginSupervisor.node,
  WorktreeStrategies.node,
  FileSystemSearch.node,
  FileSystem.node,
  ShellSelect.node,
  Pty.node,
  Shell.node,
  Skill.node,
  InstructionBuiltIns.node,
  InstructionDiscovery.node,
  FileAccess.node,
  FileMutation.node,
  Formatter.node,
  Mcp.node,
  Permission.node,
  Tool.node,
  ToolOutput.node,
  Image.node,
  SkillInstructions.node,
  ReferenceInstructions.node,
  InstructionEntry.node,
  Form.node,
  Generate.node,
  ReadToolFileSystem.node,
  McpTool.node,
  SessionInstructions.node,
  SessionRunnerModel.node,
  SessionCompaction.node,
  SessionTitle.node,
  SessionContext.node,
  Snapshot.node,
  SessionRunnerLLM.node,
  Vcs.node,
  
  LocationWatcher.node,
] as const satisfies readonly Node.LocationGraph<never, unknown>[]

export const graph = LayerNode.group(nodes)

export type Services = LayerNode.Output<typeof graph>
export type Error = FileSystem.DirectoryNotFoundError

export interface Options {
  
  readonly plugins?: InstancePlugins.List
  
  
  
  
  
  
  
  
  
  readonly discovery?: boolean
  readonly replacements?: LayerNode.Replacements
}








const vanillaReplacements: LayerNode.Replacements = [
  Config.node.replace(Config.configured({ project: false, global: false })),
  InstructionDiscovery.node.replace(InstructionDiscovery.configured({ project: false, global: false })),
]


export function layer(ref: Location.Ref, options: Options = {}): Layer.Layer<Services, Error> {
  const startedAt = performance.now()
  
  
  const replacements: LayerNode.Replacements = [
    ...(options.discovery === false ? vanillaReplacements : []),
    ...(options.replacements ?? []),
    Location.node.replace(Location.boundNode(ref)),
    InstancePlugins.node.replace(InstancePlugins.bound(options.plugins ?? [])),
  ]

  return LayerNode.compile(graph, { replacements, shared: Node.tags.values.global }).pipe(
    
    Layer.catchCause(
      (cause): Layer.Layer<Services, Error> =>
        Layer.unwrap(
          Effect.failCause(cause).pipe(
            Effect.catch(
              (error): Effect.Effect<never, Error> =>
                error instanceof FileSystem.DirectoryNotFoundError ? Effect.fail(error) : Effect.die(error),
            ),
          ),
        ),
    ),
    Layer.tap((context) => Effect.addFinalizer(() => Context.get(context, LocationLifecycle.Service).shutdown)),
    Layer.tap(() =>
      Effect.logInfo("location services booted", {
        directory: ref.directory,
        workspaceID: ref.workspaceID,
        durationMs: Math.round(performance.now() - startedAt),
      }),
    ),
  )
}
