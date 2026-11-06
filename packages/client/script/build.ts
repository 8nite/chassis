import { NodeFileSystem } from "@effect/platform-node"
import { compile, emitEffectImported, emitEffectShape, emitPromise, write } from "@chassis/httpapi-codegen"
import { ClientApi, effectOmitEndpoints, groupNames, promiseOmitEndpoints } from "@chassis/protocol/client"
import { Agent } from "@chassis/schema/agent"
import { Command } from "@chassis/schema/command"
import { Config } from "@chassis/schema/config"
import { Credential } from "@chassis/schema/credential"
import { Event } from "@chassis/schema/event"
import { EventLog } from "@chassis/schema/event-log"
import { FileDiff } from "@chassis/schema/file-diff"
import { FileSystem } from "@chassis/schema/filesystem"
import { Form } from "@chassis/schema/form"
import { Instruction } from "@chassis/schema/instruction"
import { InstructionEntry } from "@chassis/schema/instruction-entry"
import { Integration } from "@chassis/schema/integration"
import { Location } from "@chassis/schema/location"
import { Mcp } from "@chassis/schema/mcp"
import { Model } from "@chassis/schema/model"
import { Money } from "@chassis/schema/money"
import { Permission } from "@chassis/schema/permission"
import { PermissionSaved } from "@chassis/schema/permission-saved"
import { Plugin } from "@chassis/schema/plugin"
import { Project } from "@chassis/schema/project"
import { Worktree } from "@chassis/schema/worktree"
import { AgentAttachment, FileAttachment, Prompt, PromptMention } from "@chassis/schema/prompt"
import { PromptInput } from "@chassis/schema/prompt-input"
import { Provider } from "@chassis/schema/provider"
import { Pty } from "@chassis/schema/pty"
import { PtyTicket } from "@chassis/schema/pty-ticket"
import { Question } from "@chassis/schema/question"
import { Reference } from "@chassis/schema/reference"
import { AbsolutePath, RelativePath } from "@chassis/schema/schema"
import { Session } from "@chassis/schema/session"
import { SessionMessage } from "@chassis/schema/session-message"
import { SessionInbox } from "@chassis/schema/session-inbox"
import { Shell } from "@chassis/schema/shell"
import { Skill } from "@chassis/schema/skill"
import { Snapshot } from "@chassis/schema/snapshot"
import { Vcs } from "@chassis/schema/vcs"
import { WebSearch } from "@chassis/schema/websearch"
import { Workspace } from "@chassis/schema/workspace"
import { SessionsCursor } from "@chassis/protocol/groups/session"
import { Effect, Schema } from "effect"
import { fileURLToPath } from "url"

const promiseContract = compile(ClientApi, { groupNames, omitEndpoints: promiseOmitEndpoints })
const effectContract = compile(ClientApi, { groupNames, omitEndpoints: effectOmitEndpoints })
const effectTypeReferences = [
  ...namespaceTypes("Agent", "@chassis/schema/agent", Agent),
  ...namespaceTypes("Command", "@chassis/schema/command", Command),
  ...namespaceTypes("Config", "@chassis/schema/config", Config),
  ...namespaceTypes("Credential", "@chassis/schema/credential", Credential),
  ...namespaceTypes("Event", "@chassis/schema/event", Event),
  ...namespaceTypes("EventLog", "@chassis/schema/event-log", EventLog),
  ...namespaceTypes("FileDiff", "@chassis/schema/file-diff", FileDiff),
  ...namespaceTypes("FileSystem", "@chassis/schema/filesystem", FileSystem),
  ...namespaceTypes("Form", "@chassis/schema/form", Form),
  ...namespaceTypes("Instruction", "@chassis/schema/instruction", Instruction),
  ...namespaceTypes("InstructionEntry", "@chassis/schema/instruction-entry", InstructionEntry),
  ...namespaceTypes("Integration", "@chassis/schema/integration", Integration),
  typeReference("Location.PublicRef", "@chassis/schema/location", Location.PublicRef),
  typeReference("Location.PublicInfo", "@chassis/schema/location", Location.PublicInfo),
  ...namespaceTypes("Mcp", "@chassis/schema/mcp", Mcp),
  ...namespaceTypes("Model", "@chassis/schema/model", Model),
  ...namespaceTypes("Money", "@chassis/schema/money", Money),
  ...namespaceTypes("Permission", "@chassis/schema/permission", Permission),
  ...namespaceTypes("PermissionSaved", "@chassis/schema/permission-saved", PermissionSaved),
  ...namespaceTypes("Plugin", "@chassis/schema/plugin", Plugin),
  ...namespaceTypes("Project", "@chassis/schema/project", Project),
  ...namespaceTypes("Worktree", "@chassis/schema/worktree", Worktree),
  ...namespaceTypes("PromptInput", "@chassis/schema/prompt-input", PromptInput),
  ...namespaceTypes("Provider", "@chassis/schema/provider", Provider),
  ...namespaceTypes("Pty", "@chassis/schema/pty", Pty),
  ...namespaceTypes("PtyTicket", "@chassis/schema/pty-ticket", PtyTicket),
  ...namespaceTypes("Question", "@chassis/schema/question", Question),
  ...namespaceTypes("Reference", "@chassis/schema/reference", Reference),
  ...namespaceTypes("Session", "@chassis/schema/session", Session),
  ...namespaceTypes("SessionMessage", "@chassis/schema/session-message", SessionMessage),
  ...namespaceTypes("SessionInbox", "@chassis/schema/session-inbox", SessionInbox),
  ...namespaceTypes("Shell", "@chassis/schema/shell", Shell),
  ...namespaceTypes("Skill", "@chassis/schema/skill", Skill),
  ...namespaceTypes("Snapshot", "@chassis/schema/snapshot", Snapshot),
  ...namespaceTypes("Vcs", "@chassis/schema/vcs", Vcs),
  ...namespaceTypes("WebSearch", "@chassis/schema/websearch", WebSearch),
  ...namespaceTypes("Workspace", "@chassis/schema/workspace", Workspace),
  typeReference("Prompt", "@chassis/schema/prompt", Prompt),
  typeReference("PromptMention", "@chassis/schema/prompt", PromptMention),
  typeReference("FileAttachment", "@chassis/schema/prompt", FileAttachment),
  typeReference("AgentAttachment", "@chassis/schema/prompt", AgentAttachment),
  typeReference("AbsolutePath", "@chassis/schema/schema", AbsolutePath),
  typeReference("RelativePath", "@chassis/schema/schema", RelativePath),
  typeReference("SessionsCursor", "@chassis/protocol/groups/session", SessionsCursor),
]

await Effect.runPromise(
  Effect.all(
    [
      write(
        emitPromise(promiseContract, {
          mutableOutputs: true,
        }),
        fileURLToPath(new URL("../src/promise/generated", import.meta.url)),
      ),
      write(
        emitEffectImported(effectContract, {
          module: "../../contract",
          api: "ClientApi",
          shapeModule: "../api/api.js",
        }),
        fileURLToPath(new URL("../src/effect/generated", import.meta.url)),
      ),
      write(
        emitEffectShape(effectContract, {
          typeReferences: effectTypeReferences,
          outputTypes: {
            "event.subscribe": {
              name: "ChassisEvent",
              import: 'import type { ChassisEvent } from "@chassis/protocol/groups/event"',
            },
          },
        }),
        fileURLToPath(new URL("../src/effect/api", import.meta.url)),
      ),
    ],
    { concurrency: 3, discard: true },
  ).pipe(Effect.provide(NodeFileSystem.layer)),
)

function namespaceTypes(namespace: string, module: string, values: object) {
  return Object.entries(values).flatMap(([name, schema]) =>
    Schema.isSchema(schema) ? [typeReference(`${namespace}.${name}`, module, schema)] : [],
  )
}

function typeReference(name: string, module: string, schema: Schema.Top) {
  return {
    schema,
    name,
    import: `import type { ${name.split(".")[0]} } from ${JSON.stringify(module)}`,
  }
}
