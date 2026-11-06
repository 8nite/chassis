import type { QueryClient } from "@tanstack/solid-query"
import type { WorktreeDirectory } from "@chassis/client/promise"
import type { ServerApi } from "@/runtime/server/api"
import type { ServerScope } from "@/runtime/server/scope"
import type { Project } from "@/runtime/server/types"
import { sameDirectory } from "@chassis/util/path"

export function worktreeInventoryKey(scope: ServerScope, projectID: string) {
  return [scope, "worktree", projectID] as const
}

export function worktreeInventoryViewKey(scope: ServerScope, projectID?: string) {
  return [scope, "settings-workspace-inventory", projectID ?? null] as const
}


export function withWorktreeInventory(project: Project, worktrees: readonly WorktreeDirectory[] | undefined): Project {
  if (!worktrees) return project

  return {
    ...project,
    worktrees: [...worktrees],
    sandboxes: worktrees
      .map((item) => item.directory)
      .filter((directory) => !sameDirectory(project.worktree, directory)),
  }
}


export function createWorktreeInventory(input: {
  scope: ServerScope
  queryClient: QueryClient
  api: () => Pick<ServerApi["worktree"], "list" | "refresh">
  updated: (projectID: string, worktrees: WorktreeDirectory[]) => void
}) {
  const options = (projectID: string) => ({
    queryKey: worktreeInventoryKey(input.scope, projectID),
    queryFn: () =>
      input
        .api()
        .list({ projectID })
        .then((items) => {
          input.updated(projectID, items)

          return items
        }),
    
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  })

  return {
    cached: (projectID: string) =>
      input.queryClient.getQueryData<WorktreeDirectory[]>(worktreeInventoryKey(input.scope, projectID)),
    list: (projectID: string) =>
      input.queryClient.fetchQuery({ ...options(projectID), staleTime: 0 }).catch(() => undefined),
    refresh: (projectID: string) =>
      input
        .api()
        .refresh({ projectID })
        .catch(() => undefined),
  }
}
