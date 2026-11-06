export const documentPolicyHeader = "Document-Policy"

export const jsCallStacksDocumentPolicy = "include-js-call-stacks-in-crash-reports"







export function addRendererHeaders(headers: Record<string, string | string[]>, options: { document: boolean }) {
  upsertHeader(headers, "Access-Control-Allow-Origin", ["*"])

  if (!hasHeader(headers, "Access-Control-Allow-Headers")) {
    upsertHeader(headers, "Access-Control-Allow-Headers", ["*, authorization"])
  }

  if (!hasHeader(headers, "Access-Control-Max-Age")) {
    
    upsertHeader(headers, "Access-Control-Max-Age", ["7200"])
  }

  if (options.document) upsertHeader(headers, documentPolicyHeader, [jsCallStacksDocumentPolicy])
}

export function hasHeader(headers: Record<string, string | string[]>, key: string) {
  return Object.keys(headers).some((header) => header.toLowerCase() === key.toLowerCase())
}

export function upsertHeader(headers: Record<string, string | string[]>, key: string, value: string | string[]) {
  const current = Object.keys(headers).find((header) => header.toLowerCase() === key.toLowerCase())
  headers[current ?? key] = value
}
