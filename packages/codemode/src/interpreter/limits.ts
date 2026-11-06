import { rangeError } from "./model.js"





export const MAX_STRING_LENGTH = 1 << 24

export const MAX_ARRAY_LENGTH = 10_000_000

export const MAX_PENDING_PROMISES = 10_000

export const MAX_VALUE_DEPTH = 32

export const checkStringLength = (length: number): void => {
  if (length > MAX_STRING_LENGTH) throw rangeError("Invalid string length")
}

export const checkArrayLength = (length: number): void => {
  if (length > MAX_ARRAY_LENGTH) throw rangeError("Invalid array length")
}
