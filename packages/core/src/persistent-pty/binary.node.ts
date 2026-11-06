
export const available = process.platform !== "win32"

export async function resolveBinary() {
  return process.env.CHASSIS_PTY_BIN || "chassis-pty"
}
