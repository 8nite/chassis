import { Plugin } from "@chassis/plugin/tui"
import { createMermaidCodeBlockRenderer } from "./markdown.js"
import { resolveChassisDiagramPalette } from "./palette.js"

export default Plugin.define({
  id: "chassis.merman",
  setup(context) {
    context.markdown.registerCodeBlockRenderer(
      "mermaid",
      createMermaidCodeBlockRenderer(context.renderer, () => ({
        colors: resolveChassisDiagramPalette(context.theme, context.themeMode),
      })),
    )
  },
})
