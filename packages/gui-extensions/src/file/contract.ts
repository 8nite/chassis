import type { Component, JSX } from "solid-js"
import type { ArtifactKind } from "@chassis/util/artifact"
import type { ChangeKind } from "../review/contract"
import { Contract, Registry, type MountedSession, type SessionScreen } from "../sdk"

export interface FileTreeProps {
  
  readonly screen: SessionScreen
  readonly session: MountedSession
  
  readonly allowed: readonly string[]
  readonly kinds?: ReadonlyMap<string, ChangeKind>
  readonly active?: string
  onFileClick(path: string): void
}

export interface FileListProps {
  
  readonly screen: SessionScreen
  readonly session: MountedSession
  readonly files: readonly string[]
  readonly kinds?: ReadonlyMap<string, ChangeKind>
  readonly active?: string
  
  readonly highlighted?: string
  onFileClick(path: string): void
}


export interface FileTree {
  Tree(props: FileTreeProps): JSX.Element
  List(props: FileListProps): JSX.Element
}

export const FileTree = Contract.define<FileTree, "file.tree">("file.tree")

export interface OpenInAppProps {
  
  readonly screen: SessionScreen
  readonly session: MountedSession
}


export interface OpenInApp {
  
  Button(props: OpenInAppProps): JSX.Element
}

export const OpenInApp = Contract.define<OpenInApp, "file.openInApp">("file.openInApp")

export interface FileViewerProps {
  
  readonly bytes: Uint8Array
  
  onDetails(details: readonly string[]): void
  
  onError(reason?: string): void
}


export interface FileViewer {
  
  readonly kinds: readonly ArtifactKind[]
  
  problem?(bytes: Uint8Array): string | undefined
  
  readonly View: Component<FileViewerProps>
}

export const FileViewer = Registry.define<FileViewer>("file.viewer")
