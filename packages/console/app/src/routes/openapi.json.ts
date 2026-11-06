export async function GET() {
  const response = await fetch(
    "https://raw.githubusercontent.com/8nite/chassis/refs/heads/dev/packages/protocol/openapi.json",
  )
  const json = await response.json()
  return json
}
