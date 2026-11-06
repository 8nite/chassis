import { defineConfig } from "electron-vite"
import type { Plugin } from "vite"

const channel = (() => {
  const raw = process.env.CHASSIS_CHANNEL

  if (raw === "local" || raw === "dev" || raw === "beta" || raw === "prod") return raw

  if (process.env.CHASSIS_CHANNEL === "latest") return "prod"

  return "dev"
})()

const nodePtyPkg = `@lydell/node-pty-${process.platform}-${process.arch}`

const appPlugin = (await import("@chassis/app/vite")).default

const sentry =
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
    ? (await import("@sentry/vite-plugin")).sentryVitePlugin({
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        telemetry: false,
        release: {
          name: process.env.SENTRY_RELEASE ?? process.env.VITE_SENTRY_RELEASE,
        },
        sourcemaps: {
          assets: "./out/renderer/**",
          filesToDeleteAfterUpload: "./out/renderer/**/*.map",
        },
      })
    : false





const initialGraph = new Set<string>()

const initialChunk: Plugin = {
  name: "chassis-desktop:initial-chunk",
  renderStart() {
    const entries = [...this.getModuleIds()].filter((id) => this.getModuleInfo(id)?.isEntry)
    initialGraph.clear()
    entries.forEach((id) => initialGraph.add(id))

    
    for (const id of initialGraph) this.getModuleInfo(id)?.importedIds.forEach((imported) => initialGraph.add(imported))
  },
}

export default defineConfig(({ command }) => ({
  main: {
    resolve: {
      dedupe: ["effect"],
    },
    define: {
      
      "import.meta.env.CHASSIS_CHANNEL": JSON.stringify(channel === "local" ? "dev" : channel),
    },
    build: {
      minify: command === "build",
      rolldownOptions: {
        input: { index: "src/main/index.ts" },
        
        
        output: {
          format: "es",
          
          
          chunkFileNames: "[name]-[hash].js",
          banner: `
// -- CommonJS Shims --
import __cjs_mod__ from 'node:module';
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require = __cjs_mod__.createRequire(import.meta.url);
`,
        },
      },
      externalizeDeps: {
        
        exclude: ["effect", "@effect/platform-node", "@effect/platform-node-shared", "drizzle-orm"],
        include: [nodePtyPkg],
      },
    },
    plugins: [
      {
        name: "chassis:node-pty-narrower",
        enforce: "pre",
        resolveId(s) {
          if (s === "@lydell/node-pty") return nodePtyPkg

          return undefined
        },
      },
    ],
  },
  preload: {
    build: {
      minify: command === "build",
      rolldownOptions: {
        input: { index: "src/preload/index.ts" },
        output: {
          format: "cjs",
          
          
          
          entryFileNames: "[name].cjs",
        },
      },
    },
  },
  renderer: {
    experimental: {
      bundledDev: true,
    },
    define: {
      "import.meta.env.CHASSIS_VERSION": JSON.stringify(process.env.CHASSIS_VERSION),
      "import.meta.env.VITE_CHASSIS_CHANNEL": JSON.stringify(channel),
      "import.meta.env.CHASSIS_TEST_ONBOARDING": JSON.stringify(
        command === "serve" && process.env.CHASSIS_TEST_ONBOARDING === "1",
      ),
    },
    plugins: [appPlugin, initialChunk, sentry],
    publicDir: "../../../app/public",
    root: "src/renderer",
    build: {
      minify: command === "build",
      sourcemap: true,
      rolldownOptions: {
        input: {
          main: "src/renderer/index.html",
        },
        output: {
          codeSplitting: {
            groups: [{ name: (id) => (initialGraph.has(id) ? "app" : null), priority: 10 }],
          },
        },
      },
    },
  },
}))
