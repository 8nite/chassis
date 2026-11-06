import "./index.css"
import { createAsync, query } from "@solidjs/router"
import { Title, Meta } from "@solidjs/meta"
import { For, createMemo, createSignal, onCleanup, onMount } from "solid-js"

import goLogoLight from "../../asset/go-ornate-light.svg"
import goLogoDark from "../../asset/go-ornate-dark.svg"
import { EmailSignup } from "~/component/email-signup"
import { Faq } from "~/component/faq"
import { Legal } from "~/component/legal"
import { Footer } from "~/component/footer"
import { Header } from "~/component/header"
import { config } from "~/config"
import { getLastSeenWorkspaceID } from "../workspace/common"
import { IconMiniMax, IconMiMo, IconZai, IconAlibaba, IconDeepSeek } from "~/component/icon"
import { useI18n } from "~/context/i18n"
import { useLanguage } from "~/context/language"
import { LocaleLinks } from "~/component/locale-links"

const checkLoggedIn = query(async () => {
  "use server"
  return await getLastSeenWorkspaceID().catch(() => undefined)
}, "checkLoggedIn.get")

const models = [
  { name: "Grok 4.5", training: "go.faq.a5.notUsed", retention: "go.faq.a5.retention30" },
  { name: "GPT 5.6 Luna", training: "go.faq.a5.notUsed", retention: "go.faq.a5.retention30" },
  { name: "GLM-5.2", training: "go.faq.a5.notUsed", retention: "go.faq.a5.retention0" },
  { name: "GLM-5.1", training: "go.faq.a5.notUsed", retention: "go.faq.a5.retention0" },
  { name: "Kimi K3", training: "go.faq.a5.notUsed", retention: "go.faq.a5.retention0" },
  { name: "Kimi K2.7 Code", training: "go.faq.a5.notUsed", retention: "go.faq.a5.retention0" },
  { name: "Kimi K2.6", training: "go.faq.a5.notUsed", retention: "go.faq.a5.retention0" },
  { name: "MiMo-V2.5-Pro", training: "go.faq.a5.notUsed", retention: "go.faq.a5.retention0" },
  { name: "MiMo-V2.5", training: "go.faq.a5.notUsed", retention: "go.faq.a5.retention0" },
  { name: "Qwen3.8 Max", training: "go.faq.a5.notUsed", retention: "go.faq.a5.retention0" },
  { name: "Qwen3.7 Max", training: "go.faq.a5.notUsed", retention: "go.faq.a5.retention0" },
  { name: "Qwen3.7 Plus", training: "go.faq.a5.notUsed", retention: "go.faq.a5.retention0" },
  { name: "Qwen3.6 Plus", training: "go.faq.a5.notUsed", retention: "go.faq.a5.retention0" },
  { name: "MiniMax M3", training: "go.faq.a5.notUsed", retention: "go.faq.a5.retention0" },
  { name: "MiniMax M2.7", training: "go.faq.a5.notUsed", retention: "go.faq.a5.retention0" },
  { name: "DeepSeek V4 Pro", training: "go.faq.a5.notUsed", retention: "go.faq.a5.retention0" },
  { name: "DeepSeek V4 Flash", training: "go.faq.a5.notUsed", retention: "go.faq.a5.retention0" },
  { name: "Hy3", training: "go.faq.a5.notUsed", retention: "go.faq.a5.retention0" },
] as const

function LimitsGraph(props: { href: string }) {
  let root!: HTMLElement
  const [visible, setVisible] = createSignal(false)

  const i18n = useI18n()

  onMount(() => {
    if (typeof IntersectionObserver === "undefined") return setVisible(true)
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting) return
        setVisible(true)
        observer.disconnect()
      },
      { threshold: 0.35 },
    )
    observer.observe(root)
    onCleanup(() => observer.disconnect())
  })

  const baseline = 100
  const graph = [
    { id: "grok-4.5", name: "Grok 4.5", req: 120, d: "50ms" },
    { id: "kimi-k3", name: "Kimi K3", req: 110, d: "75ms" },
    { id: "qwen3.8-max", name: "Qwen3.8 Max", req: 160, d: "90ms" },
    { id: "glm-5.2", name: "GLM-5.2", req: 880, d: "100ms" },
    { id: "minimax-m3", name: "MiniMax M3", req: 3200, d: "210ms" },
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", req: 3450, d: "270ms" },
    { id: "gpt-5.6-luna", name: "GPT 5.6 Luna", req: 4100, baseReq: 2050, d: "290ms" },
    { id: "qwen3.7-plus", name: "Qwen3.7 Plus", req: 4300, d: "300ms" },
    { id: "hy3", name: "Hy3", req: 4300, d: "320ms" },
    { id: "mimo-v2.5", name: "MiMo-V2.5", req: 30100, d: "340ms" },
    {
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      req: 63300,
      baseReq: 31650,
      edge: true,
      d: "340ms",
    },
  ]

  const w = 1040
  const chartW = 720
  const left = 40
  const right = 60
  const top = 18
  const bottom = 44
  const plot = chartW - left - right

  const ratio = (n: number) => n / baseline
  const rmax = Math.max(1, ...graph.map((m) => ratio(m.req)))
  const log = (n: number) => Math.log10(Math.max(n, 1))
  const base = 24
  const p = 2.2
  const x = (r: number) => left + base + Math.pow(log(r) / log(rmax), p) * (plot - base)
  const ticks = [1, 5, 10, 25, 50, 100, 250].filter((t) => t <= rmax)
  const labels = (() => {
    const set = new Set<number>()
    let last = -Infinity
    for (const t of ticks) {
      if (t === 1) {
        set.add(t)
        last = x(t)
        continue
      }
      const pos = x(t)
      if (pos - last < 44) continue
      set.add(t)
      last = pos
    }
    return set
  })()
  const shown = ticks.filter((t) => labels.has(t))
  const bh = 8
  const gap = 20
  const step = bh + gap
  const gy = (i: number) => top + 22 + step * i
  const h = gy(graph.length - 1) + bottom
  const my = graph.length < 2 ? gy(0) : (gy(0) + gy(graph.length - 1)) / 2
  const px = (n: number) => `${(n / w) * 100}%`
  const py = (n: number) => `${(n / h) * 100}%`
  const lx = px(left - 16)
  const ty = py(h - 18)

  return (
    <figure
      data-component="limit-graph"
      aria-label={i18n.t("go.graph.label")}
      data-visible={visible() ? "" : undefined}
      ref={root}
    >
      <div data-slot="plot">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          role="img"
          aria-hidden="true"
          style={{ height: `${h}px` }}
        >
          <g data-slot="grid">
            <For each={ticks}>{(t) => <line x1={x(t)} y1={top} x2={x(t)} y2={h - bottom} data-grid />}</For>
          </g>

          <line x1={left} y1={top} x2={left} y2={h - bottom} data-stub />

          <g data-slot="bars">
            <For each={graph}>
              {(m, i) => (
                <g style={{ "--d": m.d } as any}>
                  <rect
                    x={left}
                    y={gy(i()) - bh / 2}
                    width={Math.max(0, x(ratio(m.baseReq ?? m.req)) - left)}
                    height={bh}
                    data-bar
                    data-kind="go"
                    data-model={m.id}
                  />
                  {m.baseReq && (
                    <rect
                      x={x(ratio(m.baseReq)) + 2}
                      y={gy(i()) - bh / 2}
                      width={Math.max(0, x(ratio(m.req)) - x(ratio(m.baseReq)) - 2)}
                      height={bh}
                      data-bar
                      data-kind="promo"
                      data-model={m.id}
                    />
                  )}
                </g>
              )}
            </For>
          </g>
        </svg>

        <div data-slot="ylabels" aria-hidden="true">
          <span data-ylabel style={{ "--x": lx, "--y": py(my) } as any}>
            {i18n.t("go.graph.go")}
          </span>
        </div>

        <div data-slot="xlabels" aria-hidden="true">
          <For each={shown}>
            {(t) => (
              <span data-xlabel data-tick={t} style={{ "--x": px(x(t)), "--y": ty } as any}>
                {i18n.t("go.graph.tick", { n: t })}
              </span>
            )}
          </For>
        </div>

        <div data-slot="pills" aria-hidden="true">
          <For each={graph}>
            {(m, i) => (
              <span
                data-item
                data-kind="go"
                data-model={m.id}
                data-edge={"edge" in m ? "" : undefined}
                style={{ "--x": px(x(ratio(m.req))), "--y": py(gy(i())), "--d": m.d } as any}
              >
                <span data-value>{m.req.toLocaleString()}</span>
                <span data-name>{m.name}</span>
                {m.baseReq && <span data-bonus>2x usage</span>}
              </span>
            )}
          </For>
        </div>
      </div>

      <figcaption>
        <div data-slot="caption-row">
          <div data-slot="caption-left">
            <div data-slot="caption-meta">
              <span data-slot="caption-label">{i18n.t("go.graph.label")}</span>
              <a data-slot="caption-link" href={props.href}>
                {i18n.t("go.graph.usageLimits")}
              </a>
            </div>
          </div>
        </div>
      </figcaption>
    </figure>
  )
}

export default function Home() {
  const workspaceID = createAsync(() => checkLoggedIn())
  const subscribeUrl = createMemo(() => (workspaceID() ? `/workspace/${workspaceID()}/go` : "/auth"))
  const i18n = useI18n()
  const language = useLanguage()
  return (
    <main data-page="go">
      {}
      <Title>{i18n.t("go.title")}</Title>
      <Meta name="description" content={i18n.t("go.meta.description")} />
      <LocaleLinks path="/go" />
      <Meta property="og:type" content="website" />
      <Meta property="og:url" content={`${config.baseUrl}${language.route("/go")}`} />
      <Meta property="og:title" content={i18n.t("go.title")} />
      <Meta property="og:description" content={i18n.t("go.meta.description")} />
      <Meta property="og:image" content="/social-share-black.png" />
      <Meta name="twitter:card" content="summary_large_image" />
      <Meta name="twitter:title" content={i18n.t("go.title")} />
      <Meta name="twitter:description" content={i18n.t("go.meta.description")} />
      <Meta name="twitter:image" content="/social-share-black.png" />
      <Meta name="chassis:auth" content={workspaceID() ? "true" : "false"} />

      <div data-component="container">
        <Header go hideGetStarted />

        <div data-component="content">
          <section data-component="hero">
            <div data-component="desktop-app-banner">
              <span data-slot="badge">{i18n.t("home.banner.badge")}</span>
              <div data-slot="content">
                <span data-slot="text">{i18n.t("go.banner.text")}</span>
              </div>
            </div>
            <div data-slot="hero-copy">
              <img data-slot="zen logo light" src={goLogoLight} alt="" />
              <img data-slot="zen logo dark" src={goLogoDark} alt="" />
              <h1>{i18n.t("go.hero.title")}</h1>
              <p>{i18n.t("go.hero.body")}</p>
              <div data-slot="model-logos">
                {}
                <div>
                  <IconMiniMax width="24" height="24" />
                </div>
                <div>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M12.6241 11.346L20.3848 3.44816C20.5309 3.29931 20.4487 3 20.2601 3H16.0842C16.0388 3 15.9949 3.01897 15.9594 3.05541L7.59764 11.5629C7.46721 11.6944 7.27446 11.5771 7.27446 11.3666V3.25183C7.27446 3.11242 7.18515 3 7.07594 3H4.19843C4.08932 3 4 3.11242 4 3.25183V20.7482C4 20.8876 4.08932 21 4.19843 21H7.07594C7.18515 21 7.27446 20.8876 7.27446 20.7482V17.1834C7.27446 17.1073 7.30136 17.0344 7.34815 16.987L9.94075 14.3486C10.0031 14.2853 10.0895 14.2757 10.159 14.3232L17.0934 19.5573C18.2289 20.3412 19.4975 20.8226 20.786 20.9652C20.9008 20.9778 21 20.8606 21 20.7133V17.3559C21 17.2276 20.9249 17.1232 20.8243 17.1073C20.0659 16.9853 19.326 16.6845 18.6569 16.222L12.6538 11.764C12.5291 11.6785 12.5135 11.4584 12.6241 11.346Z"
                      fill="currentColor"
                    />
                  </svg>
                </div>
                <div>
                  <IconZai width="24" height="24" />
                </div>
                <div>
                  <IconAlibaba width="24" height="24" />
                </div>
                <div>
                  <IconDeepSeek width="24" height="24" />
                </div>
                <div>
                  <IconMiMo width="24" height="24" />
                </div>
                {}
              </div>
              <a href={subscribeUrl()}>
                <span>
                  <For
                    each={i18n
                      .t("go.cta.template")
                      .split(/(\{\{text\}\}|\{\{price\}\})/g)
                      .filter(Boolean)}
                  >
                    {(part) => {
                      if (part === "{{text}}") return <span>{i18n.t("go.cta.text")}</span>
                      if (part === "{{price}}") {
                        return <span data-slot="cta-price">{i18n.t("go.cta.price")}</span>
                      }
                      return part
                    }}
                  </For>
                </span>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M6.5 12L17 12M13 16.5L17.5 12L13 7.5"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="square"
                  />
                </svg>
              </a>
            </div>
            <div data-slot="pricing-copy">
              <p>{i18n.t("go.pricing.body")}</p>
            </div>
          </section>

          <section data-component="comparison">
            <LimitsGraph href={language.route("/docs/go/#usage-limits")} />
          </section>

          <section data-component="problem">
            <div data-slot="section-title">
              <h3>{i18n.t("go.problem.title")}</h3>
              <p>{i18n.t("go.problem.body")}</p>
            </div>
            <p>{i18n.t("go.problem.subtitle")}</p>
            <ul>
              <li>
                <span>[*]</span> {i18n.t("go.problem.item1")}
              </li>
              <li>
                <span>[*]</span> {i18n.t("go.problem.item2")}
              </li>
              <li>
                <span>[*]</span> {i18n.t("go.problem.item3")}
              </li>
              <li>
                <span>[*]</span> {i18n.t("go.problem.item4")}
              </li>
            </ul>
          </section>

          <section data-component="how">
            <div data-slot="section-title">
              <h3>{i18n.t("go.how.title")}</h3>
              <p>{i18n.t("go.how.body")}</p>
            </div>
            <ul>
              <li>
                <span>[1]</span>
                <div>
                  <strong>{i18n.t("go.how.step1.title")}</strong> - {i18n.t("go.how.step1.beforeLink")}{" "}
                  <a href={language.route("/docs/go/#how-it-works")} title={i18n.t("go.how.step1.link")}>
                    {i18n.t("go.how.step1.link")}
                  </a>
                </div>
              </li>
              <li>
                <span>[2]</span>
                <div>
                  <strong>{i18n.t("go.how.step2.title")}</strong> -{" "}
                  <a href={language.route("/docs/go/#pricing")}>{i18n.t("go.how.step2.link")}</a>{" "}
                  {i18n.t("go.how.step2.afterLink")}
                </div>
              </li>
              <li>
                <span>[3]</span>
                <div>
                  <strong>{i18n.t("go.how.step3.title")}</strong> - {i18n.t("go.how.step3.body")}
                </div>
              </li>
            </ul>
          </section>

          <section data-component="faq">
            <div data-slot="section-title">
              <h3>{i18n.t("common.faq")}</h3>
            </div>
            <ul>
              <li>
                <Faq question={i18n.t("go.faq.q1")}>{i18n.t("go.faq.a1")}</Faq>
              </li>
              <li>
                <Faq question={i18n.t("go.faq.q2")}>
                  {i18n.t("go.faq.a2")}
                  <ul data-slot="faq-models">
                    <For each={models}>{(model) => <li>{model.name}</li>}</For>
                  </ul>
                </Faq>
              </li>
              <li>
                <Faq question={i18n.t("go.faq.q9")}>{i18n.t("go.faq.a9")}</Faq>
              </li>
              <li>
                <Faq question={i18n.t("go.faq.q3")}>{i18n.t("go.faq.a3")}</Faq>
              </li>
              <li>
                <Faq question={i18n.t("go.faq.q4")}>
                  {i18n.t("go.faq.a4.p1.beforePricing")}{" "}
                  <a href={language.route("/docs/go/#pricing")}>{i18n.t("go.faq.a4.p1.pricingLink")}</a>{" "}
                  {i18n.t("go.faq.a4.p1.afterPricing")} {i18n.t("go.faq.a4.p2.beforeAccount")}{" "}
                  <a href={subscribeUrl()}>{i18n.t("go.faq.a4.p2.accountLink")}</a>. {i18n.t("go.faq.a4.p3")}
                </Faq>
              </li>
              <li>
                <Faq question={i18n.t("go.faq.q5")}>
                  <div data-slot="faq-model-table">
                    <table>
                      <thead>
                        <tr>
                          <th>{i18n.t("go.faq.a5.model")}</th>
                          <th>{i18n.t("go.faq.a5.training")}</th>
                          <th>{i18n.t("go.faq.a5.retention")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={models}>
                          {(model) => (
                            <tr>
                              <td>{model.name}</td>
                              <td>{i18n.t(model.training)}</td>
                              <td>{i18n.t(model.retention)}</td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                  <div data-slot="faq-retention-notes">
                    <p>
                      <strong>Grok 4.5:</strong> {i18n.t("go.faq.a5.grokRetention")}{" "}
                      <a href="https://docs.x.invalid/developers/faq/security#what-is-zero-data-retention-zdr">
                        {i18n.t("go.faq.a5.learnMore")}
                      </a>
                      .
                    </p>
                    <p>
                      <strong>GPT 5.6 Luna:</strong> {i18n.t("go.faq.a5.gptRetention")}{" "}
                      <a href="https://developers.openai.com/api/docs/guides/your-data#data-retention-controls-for-abuse-monitoring">
                        {i18n.t("go.faq.a5.learnMore")}
                      </a>
                      .
                    </p>
                    <p>
                      <strong>DeepSeek V4 Flash:</strong> {i18n.t("go.faq.a5.deepseekRetention")}
                    </p>
                  </div>
                </Faq>
              </li>
              <li>
                <Faq question={i18n.t("go.faq.q6")}>{i18n.t("go.faq.a6")}</Faq>
              </li>
              <li>
                <Faq question={i18n.t("go.faq.q7")}>{i18n.t("go.faq.a7")}</Faq>
              </li>
              <li>
                <Faq question={i18n.t("go.faq.q8")}>{i18n.t("go.faq.a8")}</Faq>
              </li>
            </ul>
          </section>

          <EmailSignup />

          <Footer />
        </div>
      </div>

      <Legal />
    </main>
  )
}
