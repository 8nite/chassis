

export type WindowBootstrap = {
  id: string
  firstLaunchPending?: boolean
  
  packaged?: boolean
}

const prefix = "--chassis-window="

export function windowBootstrapArgument(bootstrap: WindowBootstrap) {
  return prefix + encodeURIComponent(JSON.stringify(bootstrap))
}

export function windowBootstrapFromArguments(args: readonly string[]): WindowBootstrap {
  const value = args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)

  if (!value) throw new Error("Window bootstrap argument not found")

  return JSON.parse(decodeURIComponent(value))
}
