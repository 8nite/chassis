export type MermaidDiagramKind = "flowchart" | "sequence" | "state" | "timeline" | "gitGraph" | "gantt"


export class MermaidSyntaxError extends Error {
  readonly _tag = "MermaidSyntaxError"

  constructor(
    readonly kind: MermaidDiagramKind,
    readonly lineNumber: number,
    readonly sourceLine: string,
    reason = "Unsupported syntax",
  ) {
    super(`${reason} in ${kind} diagram at line ${lineNumber}: "${sourceLine}"`)
    this.name = "MermaidSyntaxError"
  }
}
