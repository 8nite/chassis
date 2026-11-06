



export const marks: { entry: number } & Partial<
  Record<"ready" | "window" | "served" | "bundle" | "onboarding" | "logging" | "crash" | "storage" | "init" | "layers", number>
> = { entry: Date.now() }
