export interface WorktreeCreateInput {
  readonly sourceDirectory: string
  
  readonly directory: string
  
  readonly branch?: string
}

export interface WorktreeRemoveInput {
  readonly directory: string
  readonly force: boolean
}

export interface WorktreeResult {
  
  readonly directory: string
}

export interface WorktreeEntry extends WorktreeResult {
  readonly type: "root" | "worktree"
}
