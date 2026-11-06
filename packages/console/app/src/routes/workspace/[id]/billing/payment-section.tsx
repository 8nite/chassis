import { Billing } from "@chassis/console-core/billing.js"
import { query, action, useParams, createAsync, useAction } from "@solidjs/router"
import { For, Match, Show, Switch } from "solid-js"
import { withActor } from "~/context/auth.withActor"
import { formatDateUTC, formatDateForTable } from "../../common"
import styles from "./payment-section.module.css"
import { useI18n } from "~/context/i18n"

function money(amount: number, currency?: string) {
  const formatter =
    currency === "inr"
      ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" })
      : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
  return formatter.format(amount / 100_000_000)
}

const getPaymentsInfo = query(async (workspaceID: string) => {
  "use server"
  return withActor(async () => {
    return await Billing.payments()
  }, workspaceID)
}, "payment.list")

const downloadReceipt = action(async (workspaceID: string, paymentID: string) => {
  "use server"
  return withActor(() => Billing.generateReceiptUrl({ paymentID }), workspaceID)
}, "receipt.download")

export function PaymentSection() {
  const params = useParams()
  const i18n = useI18n()
  const payments = createAsync(() => getPaymentsInfo(params.id!))
  const downloadReceiptAction = useAction(downloadReceipt)

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  return (
    <Show when={payments() && payments()!.length > 0}>
      <section class={styles.root}>
        <div data-slot="section-title">
          <h2>{i18n.t("workspace.payments.title")}</h2>
          <p>{i18n.t("workspace.payments.subtitle")}</p>
        </div>
        <div data-slot="payments-table">
          <table data-slot="payments-table-element">
            <thead>
              <tr>
                <th>{i18n.t("workspace.payments.table.date")}</th>
                <th>{i18n.t("workspace.payments.table.paymentId")}</th>
                <th>{i18n.t("workspace.payments.table.amount")}</th>
                <th>{i18n.t("workspace.payments.table.receipt")}</th>
              </tr>
            </thead>
            <tbody>
              <For each={payments()!}>
                {(payment) => {
                  const date = new Date(payment.timeCreated)
                  const amount =
                    payment.enrichment?.type === "subscription" && payment.enrichment.couponID ? 0 : payment.amount
                  const currency =
                    payment.enrichment?.type === "subscription" || payment.enrichment?.type === "lite"
                      ? payment.enrichment.currency
                      : undefined
                  return (
                    <tr>
                      <td data-slot="payment-date" title={formatDateUTC(date)}>
                        {formatDateForTable(date)}
                      </td>
                      <td data-slot="payment-id">{payment.id}</td>
                      <td data-slot="payment-amount" data-refunded={!!payment.timeRefunded}>
                        {money(amount, currency)}
                        <Switch>
                          <Match when={payment.enrichment?.type === "credit"}>
                            {" "}
                            ({i18n.t("workspace.payments.type.credit")})
                          </Match>
                          <Match when={payment.enrichment?.type === "subscription"}>
                            ({i18n.t("workspace.payments.type.subscription")})
                          </Match>
                        </Switch>
                      </td>
                      <td data-slot="payment-receipt">
                        {payment.paymentID ? (
                          <button
                            onClick={async () => {
                              const receiptUrl = await downloadReceiptAction(params.id!, payment.paymentID!)
                              if (receiptUrl) {
                                window.open(receiptUrl, "_blank")
                              }
                            }}
                            data-slot="receipt-button"
                          >
                            {i18n.t("workspace.payments.view")}
                          </button>
                        ) : (
                          <span>-</span>
                        )}
                      </td>
                    </tr>
                  )
                }}
              </For>
            </tbody>
          </table>
        </div>
      </section>
    </Show>
  )
}
