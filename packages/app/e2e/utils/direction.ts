import { expect, type Page } from "@playwright/test"
import { SERVER } from "./app"

export async function openWithDirection(page: Page, route: string, direction: "ltr" | "rtl") {
  await page.goto(`/e2e/utils/app-direction.html?${new URLSearchParams({ server: SERVER, route, direction })}`)
}


export async function openHeldStart(page: Page, route: string) {
  await page.goto(
    `/e2e/utils/app-direction.html?${new URLSearchParams({ server: SERVER, route, direction: "ltr", held: "" })}`,
  )
  const start = page.getByRole("button", { name: "Start app", exact: true, includeHidden: true })
  await expect(start).toBeVisible()

  return {
    
    start: async () => {
      await start.dispatchEvent("click")
      await expect(page.getByRole("button", { name: "Finish startup", exact: true, includeHidden: true })).toBeEnabled()
    },
    finish: () => page.getByRole("button", { name: "Finish startup", exact: true, includeHidden: true }).dispatchEvent("click"),
  }
}
