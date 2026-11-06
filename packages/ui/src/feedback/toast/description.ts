


export const toastDescriptionLimit = 2000

export function boundToastDescription<T extends { description?: string }>(options: T): T {
  if (!options.description || options.description.length <= toastDescriptionLimit) return options

  return { ...options, description: `${options.description.slice(0, toastDescriptionLimit)}…` }
}
