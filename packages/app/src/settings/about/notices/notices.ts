import apache from "./apache-2.0.txt?raw"
import betterOfficeNotice from "./betteroffice-notice.txt?raw"
import { crates, crateTexts } from "./crates"


export const notices = [
  {
    name: "BetterOffice",
    detail: "@betteroffice/docx, @betteroffice/xlsx, @betteroffice/pptx, @betteroffice/fonts",
    detailKey: undefined,
    url: "https://github.com/openooxml/betteroffice",
    license: "Apache License 2.0",
    notice: `${betterOfficeNotice.trim()}\nCopyright 2026 The OpenOOXML contributors`,
    text: apache,
  },
  {
    name: "eigenpal docx editor",
    detail: undefined,
    detailKey: "settings.about.notices.eigenpal" as const,
    url: "https://github.com/eigenpal/docx-editor",
    license: "Apache License 2.0",
    notice: "Copyright 2026 EigenPal Inc.",
    text: apache,
  },
]


export const crateNotices = {
  crates,
  texts: [...crateTexts, { id: "apache-2.0", license: "Apache-2.0", title: "Apache License 2.0", text: apache }],
}
