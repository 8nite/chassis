import {
  batch,
  createMemo,
  createEffect,
  createRenderEffect,
  createRoot,
  createSignal,
  getOwner,
  on,
  onCleanup,
  untrack,
  type Accessor,
} from "solid-js"
import type {
  BackgroundTask,
  Comments,
  Composer,
  Files,
  LineRange,
  ServerRef,
  MountedSession,
  SessionScreen,
} from "@chassis/gui-extensions/sdk"
import { useComments } from "@/composer/comments"
import { useComposerState } from "@/composer/persistence"
import { useServer } from "@/runtime/server/current"
import { ServerConnection, serverName } from "@/runtime/server/registry"
import { sessionInWorkspace, sessionProject, type SessionModel } from "@/session/model"
import { useFile } from "@/workspaces/files/model"
import { useWorkspaceLocation } from "@/workspaces/location"
import { pathKey } from "@/workspaces/path-key"
import { useExtensionAttachment } from "./host-apis"

const noTasks: readonly BackgroundTask[] = []


type ObjectRoot = { dispose?: () => void }


export function createMountedSession(session: SessionModel) {
  const file = useFile()
  const comments = useComments()
  const composer = useComposerState()
  const server = useServer()
  const location = useWorkspaceLocation()
  const attachment = useExtensionAttachment()
  
  const [background, setBackground] = createSignal<Accessor<readonly BackgroundTask[]>>()

  const serverRef: ServerRef = {
    get id() {
      return server.key
    },
    get name() {
      return serverName(server.conn) || server.key
    },
    get url() {
      return server.ctx.sdk.url
    },
    get password() {
      return server.conn.http.password
    },
    get client() {
      return server.ctx.sdk.api
    },
    get data() {
      return server.ctx.data
    },
    get local() {
      return server.isLocal
    },
    get builtin() {
      return ServerConnection.builtin(server.conn)
    },
    get compatible() {
      return !server.health?.incompatible
    },
    get connected() {
      return server.ctx.sdk.connection.status() === "connected"
    },
  }

  const files: Files = {
    get root() {
      return location().directory
    },
    ready: file.ready,
    resolve: file.normalize,
    absolute: file.absolute,
    get: file.get,
    missing: file.notFound,
    sync: (path, options) => file.load(path, options),
    exists: file.exists,
    search: (query, options) =>
      options?.kind === "any" ? file.searchFilesAndDirectories(query, options) : file.searchFiles(query, options),
    selection: {
      
      get: (path) => file.selectedLines(path) as LineRange | null | undefined,
      set: (path, range) => void file.setSelectedLines(path, range),
    },
    scroll: {
      get: (path) => ({
        
        top: file.scrollTop(path) as number | undefined,
        
        left: file.scrollLeft(path) as number | undefined,
      }),
      set(path, value) {
        if (value.top !== undefined) file.setScrollTop(path, value.top)

        if (value.left !== undefined) file.setScrollLeft(path, value.left)
      },
    },
    tree: {
      list: file.tree.children,
      state: file.tree.state,
      sync: (path, options) => (options?.force ? file.tree.refresh(path) : file.tree.list(path)),
      expand: (path, options) => void file.tree.expand(path, options),
      collapse: (path) => void file.tree.collapse(path),
    },
  }

  const commentFile = (id: string) => comments.all().find((item) => item.id === id)?.file

  const comment: Comments = {
    list: (path) => (path ? comments.list(path) : comments.all()),
    add: comments.add,
    update(id, text) {
      const path = commentFile(id)

      if (path) comments.update(path, id, text)
    },
    remove(id) {
      const path = commentFile(id)

      if (path) comments.remove(path, id)
    },
    focus: { current: comments.focus, set: (value) => void comments.setFocus(value) },
    active: { current: comments.active, set: (value) => void comments.setActive(value) },
  }

  const composerRef: Composer = {
    attach: (part) => composer.context.add(part),
    update: (id, patch) => composer.context.updateComment(id, patch),
    detach: (id) => composer.context.removeComment(id),
  }

  
  
  const create = (input: { id: string; directory: string; tab: string; visit: object }): MountedSession => {
    const id = input.id
    const directory = input.directory
    const info = () => server.ctx.data.session.get(id)

    
    
    const project = createMemo(() => {
      const value = info()

      return (
        (value && server.ctx.projects.detailsForSession(value)) || sessionProject(server.ctx.data, value, directory)
      )
    })

    
    const listedProject = createMemo(() => {
      const key = pathKey(directory)

      return server.ctx.projects
        .list()
        .find((item) => pathKey(item.worktree) === key || item.sandboxes?.some((sandbox) => pathKey(sandbox) === key))
    })

    const local = createMemo(() => !sessionInWorkspace(server.ctx.sync.data.project, info(), directory))

    const view: MountedSession = Object.freeze({
      key: `${server.key}\n${id}`,
      id,
      tab: input.tab,
      visit: input.visit,
      server: serverRef,
      get pending() {
        return server.ctx.data.session.creating(id)
      },
      get location() {
        return info()?.location
      },
      get project() {
        return project()
      },
      get listedProject() {
        return listedProject()
      },
      directory,
      get local() {
        return local()
      },
      
      get background() {
        return mounted() === view ? (background()?.() ?? noTasks) : noTasks
      },
    })

    return view
  }

  
  const screen: SessionScreen = Object.freeze({
    file: files,
    comment,
    composer: composerRef,
  })

  const owner = getOwner()
  const root: ObjectRoot = {}

  onCleanup(() => root.dispose?.())

  
  
  const mounted = createMemo<MountedSession>((previous) => {
    const id = session.identity.sessionID() ?? ""
    const directory = session.workspace.directory()
    const tab = session.layout.tabKey() ?? ""

    if (previous && !id) return previous

    if (previous && previous.id === id && previous.directory === directory && previous.tab === tab) return previous

    const visit = previous?.id === id ? previous.visit : {}

    return untrack(() =>
      createRoot((dispose) => {
        root.dispose?.()
        root.dispose = dispose

        return create({ id, directory, tab, visit })
      }, owner),
    )
  })

  
  createRenderEffect(on(mounted, (view) => attachment.preload(view)))
  
  
  createEffect(() =>
    batch(() => {
      onCleanup(attachment.screen(screen))
      onCleanup(attachment.mount(mounted))
    }),
  )

  return {
    screen,
    view: mounted,
    bindBackground: (tasks: Accessor<readonly BackgroundTask[]>) => setBackground(() => tasks),
  }
}
