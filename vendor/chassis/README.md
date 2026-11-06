# Vendored Chassis packages

These are the `@chassis/pty*` npm packages vendored into this workspace so the
repo no longer depends on the npm registry for them at dev/install time.
Each subdirectory is a workspace package (see root `package.json` workspaces).

## What is vendored

| Package | Version | Contents |
| --- | --- | --- |
| `@chassis/pty` | 0.3.1 | npm wrapper (`index.js`, `bin/`) + `pty-source/` Rust snapshot |
| `@chassis/pty-linux-x64-gnu` | 0.3.1 | linux-x64 binary package |
| `@chassis/pty-linux-x64-musl` | 0.3.1 | linux-x64-musl binary package |

Source snapshot (as of vendoring):

- pty `pty-source/` from `anomalyco/chassis-pty` tag `v0.3.1`
  (`.vendored-version` + `.vendored-commit` record the pin).

Legacy `@chassis/sdk` (`/v2`), `@chassis/plugin`, `@chassis/protocol`,
`@chassis/schema`, and `@chassis/client` vendor snapshots were removed:
`packages/enterprise` now uses `@chassis/client/promise` types
(`SessionInfo`, `SessionMessageInfo`, `ModelInfo`, `FileDiffInfo`) directly,
so no `/v2` import suffix is needed.

## Managing the source

To rebuild pty binaries from `pty-source/`, see `pty-source/README.md`
(`cargo build`; needs `zig` for the ghostty-vt step) and copy the resulting
binary into the matching `@chassis/pty-<platform>/bin/` package.
For platforms without a published `@chassis/pty-*` package, point
`CHASSIS_PTY_BIN` at a locally built binary instead (CLI build and tests
pick it up via `packages/cli/script/chassis-pty.ts`).

## Refresh

To refresh to a new upstream tag, sparse-checkout the tag and copy over,
then `bun install`:

```sh
# pty rust source from anomalyco/chassis-pty
git archive <tag> | tar -x -C vendor/chassis/pty-source
bun install
```
