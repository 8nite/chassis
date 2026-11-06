import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { isMixedContent } from "./browser"
import { legacyPairingLink, pairingLink, redeemPairingLink, type Pairing } from "./pairing"

export type Redemption = { readonly pairing: Pairing } | { readonly error: string }


export type RedeemPairing = (value: string) => Promise<Redemption | undefined>


type Redeemed = { code?: string; pairing?: Pairing }




export function useRedeemPairing(): RedeemPairing {
  const language = useLanguage()
  const platform = usePlatform()
  const last: Redeemed = {}

  return async (value) => {
    const link = pairingLink(value)

    if (!link) return legacyPairingLink(value) ? { error: language.t("server.connect.link.legacy") } : undefined

    
    
    if (last.pairing && last.code === link.code) {
      const url = link.urls.includes(last.pairing.url) ? last.pairing.url : (link.urls[0] ?? last.pairing.url)

      return { pairing: { url, password: last.pairing.password } }
    }

    const result = await redeemPairingLink(link)

    if (result.type === "paired") {
      last.code = link.code
      last.pairing = result.pairing

      return { pairing: result.pairing }
    }

    if (result.type === "expired") return { error: language.t("server.connect.link.expired") }

    
    if (platform.platform === "web" && link.urls.every((url) => isMixedContent(location.href, url)))
      return { error: language.t("server.connect.mixedContent") }

    return { error: language.t("server.connect.link.unreachable", { url: link.urls.join(", ") }) }
  }
}
