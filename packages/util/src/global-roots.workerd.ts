import os from "os"
import path from "path"




export function roots(app: string) {
  const root = path.join(os.tmpdir(), app)
  return {
    data: path.join(root, "data"),
    cache: path.join(root, "cache"),
    config: path.join(root, "config"),
    state: path.join(root, "state"),
    tmp: path.join(root, "tmp"),
  }
}
