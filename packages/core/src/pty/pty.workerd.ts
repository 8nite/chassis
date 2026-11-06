import type { Proc } from "./pty.js"

export type { Disp, Exit, Opts, Proc } from "./pty.js"



export function spawn(): Proc {
  throw new Error("Pseudo-terminals are unavailable on the workerd runtime")
}
