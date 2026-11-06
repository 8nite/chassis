import { AwsV4Signer } from "aws4fetch"
import { Effect } from "effect"
import { Headers } from "effect/http"
import { Auth, type AuthInput } from "../../route/auth.js"
import { AIError, AuthenticationError } from "../../schema/index.js"
import { ProviderShared } from "../shared.js"


export interface Credentials {
  readonly region: string
  readonly accessKeyId: string
  readonly secretAccessKey: string
  readonly sessionToken?: string
}


export type CredentialSource = Credentials | Effect.Effect<Credentials, AIError>

export interface DefaultChainOptions {
  readonly region: string
  
  readonly profile?: string
}


export const defaultChain = (options: DefaultChainOptions): Effect.Effect<Credentials, AIError> =>
  Effect.tryPromise({
    try: async () => {
      const { fromNodeProviderChain } = await import("@aws-sdk/credential-providers")
      
      const identity = await fromNodeProviderChain({ ignoreCache: true, profile: options.profile })()
      return {
        region: options.region,
        accessKeyId: identity.accessKeyId,
        secretAccessKey: identity.secretAccessKey,
        ...(identity.sessionToken === undefined ? {} : { sessionToken: identity.sessionToken }),
      }
    },
    catch: (error) =>
      new AIError({
        reason: new AuthenticationError({
          message: `AWS default credential chain failed: ${ProviderShared.errorText(error)}`,
          cause: error,
        }),
      }),
  })

const signRequest = (input: {
  readonly url: string
  readonly body: string
  readonly headers: Headers.Headers
  readonly credentials: Credentials
  readonly service: string
  readonly name: string
}) =>
  Effect.tryPromise({
    try: async () => {
      const signed = await new AwsV4Signer({
        url: input.url,
        method: "POST",
        headers: Object.entries(input.headers),
        body: input.body,
        region: input.credentials.region,
        accessKeyId: input.credentials.accessKeyId,
        secretAccessKey: input.credentials.secretAccessKey,
        sessionToken: input.credentials.sessionToken,
        service: input.service,
      }).sign()
      return Object.fromEntries(signed.headers.entries())
    },
    catch: (error) =>
      ProviderShared.invalidRequest(
        `${input.name} SigV4 signing failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
  })


export const sigV4 = (
  source: CredentialSource | undefined,
  options: { readonly service?: string; readonly name?: string } = {},
) =>
  Auth.custom((input: AuthInput) => {
    return Effect.gen(function* () {
      if (!source) {
        return yield* ProviderShared.invalidRequest(
          `${options.name ?? "Bedrock Converse"} requires either route bearer auth or AWS credentials configured on the route`,
        )
      }
      const credentials = Effect.isEffect(source) ? yield* source : source
      const headersForSigning = Headers.set(input.headers, "content-type", "application/json")
      const signed = yield* signRequest({
        url: input.url,
        body: input.body,
        headers: headersForSigning,
        credentials,
        service: options.service ?? "bedrock",
        name: options.name ?? "Bedrock Converse",
      })
      return Headers.setAll(headersForSigning, signed)
    })
  })


export const auth = sigV4(undefined)

export const resolveRegion = (input: {
  readonly region?: string
  readonly credentials?: { readonly region: string }
}) =>
  input.region ?? input.credentials?.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1"

export interface ResolveAuthInput {
  readonly apiKey?: string
  readonly credentials?: Credentials
  readonly profile?: string
}

export interface ResolveAuthOptions {
  readonly service?: string
  readonly name?: string
  
  readonly mode?: "bearer" | "sigv4"
}


export const resolveAuth = (input: ResolveAuthInput, region: string, options: ResolveAuthOptions = {}) => {
  const apiKey = options.mode === "sigv4" ? undefined : (input.apiKey ?? process.env.AWS_BEARER_TOKEN_BEDROCK)
  if (apiKey !== undefined) return Auth.bearer(apiKey)
  if (input.credentials !== undefined) return sigV4({ ...input.credentials, region }, options)
  return sigV4(defaultChain({ region, profile: input.profile }), options)
}

export * as BedrockAuth from "./bedrock-auth.js"
