import type { LLMRequest } from "../schema/index.js"

export interface EndpointInput<Body, Request = LLMRequest> {
  readonly request: Request
  readonly body: Body
}

export type EndpointPart<Body, Request = LLMRequest> = string | ((input: EndpointInput<Body, Request>) => string)


export interface Definition<Body, Request = LLMRequest> {
  readonly baseURL?: string
  readonly path: EndpointPart<Body, Request>
  readonly query?: Record<string, string>
}

export type EndpointPatch<Body, Request = LLMRequest> = Partial<Definition<Body, Request>>


export const path = <Body, Request = LLMRequest>(
  value: EndpointPart<Body, Request>,
  options: Omit<Definition<Body, Request>, "path"> = {},
): Definition<Body, Request> => ({
  ...options,
  path: value,
})

export const merge = <Body, Request = LLMRequest>(
  base: Definition<Body, Request>,
  patch: EndpointPatch<Body, Request>,
): Definition<Body, Request> => ({
  ...base,
  ...patch,
  baseURL: patch.baseURL ?? base.baseURL,
  path: patch.path ?? base.path,
  query: patch.query === undefined ? base.query : { ...base.query, ...patch.query },
})

export const trimBaseUrl = (value: string) => value.replace(/\/+$/, "")

const renderPart = <Body, Request>(part: EndpointPart<Body, Request>, input: EndpointInput<Body, Request>) =>
  typeof part === "function" ? part(input) : part

export const render = <Body, Request = LLMRequest>(
  endpoint: Definition<Body, Request>,
  input: EndpointInput<Body, Request>,
) => {
  const url = new URL(`${trimBaseUrl(endpoint.baseURL ?? "")}${renderPart(endpoint.path, input)}`)
  for (const [key, value] of Object.entries(endpoint.query ?? {})) url.searchParams.set(key, value)
  return url
}

export * as Endpoint from "./endpoint.js"
