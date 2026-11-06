import type { LocationGetOutput, ChassisClient } from "@chassis/client/promise"
import type { Data } from "@chassis/client/solid"

export async function createWorktree(input: {
  api: Pick<ChassisClient, "location" | "worktree">
  data: Pick<Data, "location">
  directory: string
  project?: LocationGetOutput["project"]
  branch?: string
}) {
  const project = input.project ?? (await input.api.location.get({ location: { directory: input.directory } })).project

  const created = await input.api.worktree.create({
    projectID: project.id,
    from: project.canonical,
    branch: input.branch,
  })

  
  await input.data.location.syncInfo({ directory: created.directory })

  return created.directory
}
