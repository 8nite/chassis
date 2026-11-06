# Chassis

Chassis is an open source AI coding agent. Available as a terminal interface, desktop app, and web app.

- Website: https://
- Docs source in this repo: `services/www/src/docs/content/`

## Install from source

Prerequisites: [Bun](https://bun.sh) (see the `packageManager` field in `package.json` for the pinned version).

```bash
git clone https://github.com/8nite/chassis.git
cd chassis
bun install

export CHASSIS_CHANNEL=local
export CHASSIS_VERSION=$(bun -e "console.log(require('./package.json').version)")
cd packages/cli
bun run build --single --skip-install

cp dist/cli-*/bin/chassis ~/.local/bin/chassis
chassis --version
```

Start the background service (serves the web UI, default `http://127.0.0.1:4096`):

```bash
chassis service start
chassis service status
```

## Quickstart

```bash
chassis


chassis /path/to/project


chassis serve --port 4096
chassis pair
```

Connect a provider in the TUI with `/connect`, or see [Providers](services/www/src/docs/content/providers.mdx) and [Console](services/www/src/docs/content/console/index.mdx). Common customization: [config](services/www/src/docs/content/config.mdx), [plugins](services/www/src/docs/content/plugins.mdx), [MCP servers](services/www/src/docs/content/mcp-servers.mdx), [commands](services/www/src/docs/content/commands.mdx), [skills](services/www/src/docs/content/skills.mdx).

## Repository layout

| Path | What |
| --- | --- |
| `packages/cli/` | `chassis` CLI + TUI (`@chassis/cli`) |
| `packages/tui/` | terminal UI components |
| `packages/app/` | web app (Solid + Vite, served by `chassis serve`) |
| `packages/desktop/` | Electron desktop app |
| `packages/core/` | session runtime: admission, execution, compaction, persistence |
| `packages/ai/` | Effect Schema-first LLM client (text, image, video, speech, transcription) + provider routes |
| `packages/codemode/` | confined JS-like interpreter over schema-described tools |
| `packages/protocol/` | HTTP endpoint definitions assembled into Server `HttpApi` |
| `packages/schema/` | public domain shapes + durable event payloads |
| `packages/server/` | concrete API implementation |
| `packages/client/` / `packages/sdk/` | generated Promise + Effect clients / in-process host |
| `packages/plugin/` | Promise + Effect plugin authoring APIs and loader |
| `packages/session-ui/` | shared session/timeline UI |
| `services/www/` |  website + docs (Astro) |
| `specs/` | cross-module contracts ([session](specs/session.md), [tools](specs/tools.md), decisions) |
| `nix/` | Nix derivations |
| `script/` | format, generate, lint, SDK-docs scripts |

Authority follows `specs/README.md`: Protocol owns endpoints, Schema owns shapes, Core owns runtime behavior.

## Development

Prerequisites: Bun. Each `packages/*` and `services/*` directory is its own workspace — run commands from the package directory.

```bash

cd packages/cli
bun install
bun run dev
bun test
bun run typecheck


bun dev serve --port 4096
cd packages/app && bun dev -- --port 4444


cd services/www && bun dev
bun typecheck && bun run check:generated && bun run build
```

## License

MIT. See package `license` fields (`@chassis/cli`, `@chassis/app`, etc.).
