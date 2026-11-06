import { Agent } from "@chassis/core/agent"
import { AISDK } from "@chassis/core/aisdk"
import { Command } from "@chassis/core/command"
import { Config } from "@chassis/core/config"
import { Credential } from "@chassis/core/credential"
import { Database } from "@chassis/core/database/database"
import { FileAccess } from "@chassis/core/file-access"
import { LayerNodePlatform } from "@chassis/util/effect/app-node-platform"
import { AppProcess } from "@chassis/util/process"
import { LayerNode } from "@chassis/util/effect/layer-node"
import { Bus } from "@chassis/core/bus"
import { FileSystem } from "@chassis/core/filesystem"
import { FSUtil } from "@chassis/util/fs-util"
import { Form } from "@chassis/core/form"
import { Generate } from "@chassis/core/generate"
import { Integration } from "@chassis/core/integration"
import { KV } from "@chassis/core/kv"
import { Location } from "@chassis/core/location"
import { ManagedPolicy } from "@chassis/core/managed-policy"
import { Mcp } from "@chassis/core/mcp/index"
import { Model } from "@chassis/core/model"
import { Npm } from "@chassis/util/npm"
import { Plugin } from "@chassis/core/plugin"
import { PluginHooks } from "@chassis/core/plugin/hooks"
import { Provider } from "@chassis/core/provider"
import { Session } from "@chassis/core/session"
import { PersistentPty } from "@chassis/core/persistent-pty"
import { LocationServiceMap } from "@chassis/core/location-service-map"
import { AppNodeBuilder } from "@chassis/core/effect/app-node-builder"
import { Permission } from "@chassis/core/permission"
import { Reference } from "@chassis/core/reference"
import { Rpc } from "@chassis/core/rpc"
import { Skill } from "@chassis/core/skill"
import { SkillDiscovery } from "@chassis/core/skill/discovery"
import { Watcher } from "@chassis/core/filesystem/watcher"
import { Tool } from "@chassis/core/tool"
import { Vcs } from "@chassis/core/vcs"
import { WebSearch } from "@chassis/core/websearch"
import { Worktree } from "@chassis/core/worktree"
import { WorktreeStrategies } from "@chassis/core/worktree/strategies"
import { Effect, Layer } from "effect"
import { tempLocationLayer } from "../fixture/location"
import { emptyMcpLayer } from "../fixture/mcp"

const npmLayer = Layer.succeed(
  Npm.Service,
  Npm.Service.of({
    add: (name) => Effect.succeed({ directory: "", name }),
    resolve: (name) => Effect.succeed({ directory: "", name }),
    check: () => Effect.succeed(false),
    update: (name) => Effect.succeed({ directory: "", name }),
    which: () => Effect.undefined,
  }),
)

const generateLayer = Layer.succeed(Generate.Service, Generate.Service.of({ text: () => Effect.succeed("") }))

const configLayer = Config.testLayer()

const permissionLayer = Layer.succeed(
  Permission.Service,
  Permission.Service.of({
    close: Effect.void,
    ask: (input) => Effect.succeed({ id: input.id ?? Permission.ID.create(), effect: "ask" }),
    assert: () => Effect.void,
    reply: () => Effect.void,
    get: () => Effect.succeed(undefined),
    forSession: () => Effect.succeed([]),
    list: () => Effect.succeed([]),
  }),
)

export const makePluginTestLayer = (permission = permissionLayer) =>
  AppNodeBuilder.build(
    LayerNode.group([
      AppProcess.node,
      FileSystem.node,
      FSUtil.node,
      Location.node,
      Npm.node,
      Credential.node,
      Config.node,
      Database.node,
      FileAccess.node,
      Bus.node,
      Form.node,
      Generate.node,
      LayerNodePlatform.httpClient,
      Plugin.node,
      Agent.node,
      AISDK.node,
      Provider.node,
      Model.node,
      Command.node,
      Integration.node,
      KV.node,
      ManagedPolicy.node,
      Mcp.node,
      Session.node,
      PersistentPty.node,
      LocationServiceMap.node,
      Permission.node,
      PluginHooks.node,
      Reference.node,
      Rpc.node,
      Skill.node,
      SkillDiscovery.node,
      Tool.node,
      Vcs.node,
      Watcher.node,
      WebSearch.node,
      Worktree.node,
      WorktreeStrategies.node,
    ]),
    [
      Location.node.replace(tempLocationLayer),
      Npm.node.replace(npmLayer),
      Config.node.replace(configLayer),
      Mcp.node.replace(emptyMcpLayer),
      Generate.node.replace(generateLayer),
      Permission.node.replace(permission),
    ],
  ).pipe(Layer.provideMerge(configLayer))

export const PluginTestLayer = makePluginTestLayer()
