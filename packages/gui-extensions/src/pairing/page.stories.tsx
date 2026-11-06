import { PairingHost, pairingClient, pairingServer } from "../../../storybook/.storybook/mocks/gui-extensions/pairing"
import PairingPage from "./page"

const story = (urls: readonly string[], links?: { custom?: string; selected?: string }, main = true) => ({
  render: () => {
    const server = pairingServer(urls)
    const client = pairingClient()

    return (
      <PairingHost links={links}>
        <PairingPage
          server={() => server}
          pairing={() =>
            main ? { status: "active", value: client, generation: 1 } : { status: "inactive", reason: "disabled" }
          }
        />
      </PairingHost>
    )
  },
})

export default {
  title: "Extensions/Pairing",
  id: "extensions-pairing",
  parameters: {
    docs: {
      description: {
        component: "Settings → Pairing on desktop: the addresses a pairing link can use, and its QR code.",
      },
    },
  },
}


export const NetworkAddresses = story([
  "http://127.0.0.1:49374",
  "http://192.168.10.248:49374",
  "http://100.87.251.43:49374",
])


export const CustomAddress = story(["http://127.0.0.1:49374", "http://192.168.10.248:49374"], {
  custom: "https://chassis.example.com",
})


export const OnlyThisComputer = story(["http://127.0.0.1:49374"])


export const WithoutMainProcess = story(["http://127.0.0.1:49374", "http://192.168.10.248:49374"], undefined, false)
