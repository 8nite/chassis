import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import solidPlugin from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "url"

const theme = fileURLToPath(new URL("./public/oc-theme-preload.js", import.meta.url))

const themeScript = readFileSync(theme, "utf8")

const tailwind = tailwindcss()

const tailwindGenerate = tailwind.find((plugin) => plugin.name === "@tailwindcss/vite:generate:serve")

const tailwindHotUpdate = tailwindGenerate?.hotUpdate


if (tailwindGenerate && typeof tailwindHotUpdate === "function") {
  tailwindGenerate.hotUpdate = function (context) {
    if (!context.server) return

    return tailwindHotUpdate.call(this, context)
  }
}




const workerDeps = ["@shikijs/stream", "marked", "marked-shiki", "remend"]



const officeDeps = ["@betteroffice/docx", "@betteroffice/fonts", "@betteroffice/pptx", "@betteroffice/xlsx"]



const officeEmitted = /^(?:docx_\w+_bg|ooxml_opc_bg|pptx_wasm_bg|xlsx_wasm_bg|residentEngineWorker)\b/


const dropUnloadedOfficeFiles = {
  name: "chassis-desktop:drop-unloaded-office-files",
  apply: "build",
  generateBundle: {
    order: "post",
    handler(_, bundle) {
      const files = Object.values(bundle).filter((file) => !file.fileName.endsWith(".map"))
      const name = (file) => file.fileName.split("/").pop() ?? file.fileName
      const source = (file) => (file.type === "chunk" ? file.code : typeof file.source === "string" ? file.source : "")
      const named = (file) => files.some((other) => other !== file && source(other).includes(name(file)))

      files
        .filter((file) => officeEmitted.test(name(file)) && !named(file))
        .forEach((file) => {
          delete bundle[file.fileName]
          delete bundle[`${file.fileName}.map`]
        })
    },
  },
}


const bundleNestedWorkerDeps = {
  name: "chassis-desktop:bundle-nested-worker-deps",
  resolveId(id, importer) {
    if (!importer || !workerDeps.includes(id) || !importer.includes("node_modules")) return

    try {
      return createRequire(importer).resolve(id)
    } catch {
      return
    }
  },
}

export const channel = (() => {
  const raw = process.env.CHASSIS_CHANNEL

  if (raw === "local" || raw === "dev" || raw === "beta" || raw === "prod") return raw

  if (process.env.CHASSIS_CHANNEL === "latest") return "prod"

  return "dev"
})()


export default [
  {
    name: "chassis-desktop:config",
    config() {
      return {
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
            
            "@betteroffice/fonts-cjk": fileURLToPath(
              new URL("../gui-extensions/src/microsoft-office/fonts-cjk.ts", import.meta.url),
            ),
          },
        },
        define: {
          "import.meta.env.VITE_CHASSIS_CHANNEL": JSON.stringify(channel),
        },
        worker: {
          format: "es",
        },
        optimizeDeps: {
          exclude: [...workerDeps, ...officeDeps],
          include: ["@chassis/session-ui > mermaid", "@chassis/session-ui > mermaid > katex"],
          rolldownOptions: { plugins: [bundleNestedWorkerDeps] },
        },
      }
    },
  },
  dropUnloadedOfficeFiles,
  {
    name: "chassis-desktop:theme-preload",
    transformIndexHtml: {
      order: "pre",
      handler: inlineThemePreload,
    },
  },
  ...tailwind,
  solidPlugin(),
]

export function inlineThemePreload(html) {
  return html.replace(
    /<script id="oc-theme-preload-script" src="(?:\.\/|\/)oc-theme-preload\.js"><\/script>/,
    `<script id="oc-theme-preload-script">${themeScript}</script>`,
  )
}
