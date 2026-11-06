import type { APIRoute } from "astro"
import { renderLlmsTxt } from "../docs/lib/llms"

export const prerender = true

export const GET: APIRoute = ({ site }) =>
  new Response(renderLlmsTxt(site ?? new URL("http://127.0.0.1:3000")), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
