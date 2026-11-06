import { Schema } from "effect"
import { Extension, Store } from "../sdk"
import en from "./i18n/en"

const Chats = Schema.Struct({
  chats: Schema.Array(
    Schema.Struct({ id: Schema.String, question: Schema.String, answer: Schema.optional(Schema.String) }),
  ),
})

export default Extension.define({
  id: "btw",
  stores: {
    
    chats: Store.session(Chats, { chats: [] }),
  },
  i18n: {
    en,
  },
})
