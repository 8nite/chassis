

const nativeEncode: (() => string) | undefined = Uint8Array.prototype.toBase64
const nativeDecode: ((value: string) => Uint8Array) | undefined = Uint8Array.fromBase64


export function bytesToBase64(bytes: Uint8Array) {
  if (nativeEncode) return bytes.toBase64()

  const parts: string[] = []

  for (let index = 0; index < bytes.length; index += 0x8000) {
    parts.push(String.fromCharCode(...bytes.subarray(index, index + 0x8000)))
  }

  return btoa(parts.join(""))
}


export function base64ToBytes(value: string) {
  if (nativeDecode) return Uint8Array.fromBase64(value)

  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)

  return bytes
}
