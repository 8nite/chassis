import { Schema } from "effect"
import { Ipc } from "../sdk"


export const Pairing = Ipc.define({
  id: "pairing",
  methods: {
    
    screenActive: { output: Schema.Boolean },
    
    setScreenActive: { input: Schema.Boolean },
  },
})
