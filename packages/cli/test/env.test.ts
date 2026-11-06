import { expect, test } from "bun:test"
import { Env } from "../src/env"

test("session environment omits server credentials", () => {
  const previousPassword = process.env.CHASSIS_PASSWORD
  const previousLegacyPassword = process.env.CHASSIS_SERVER_PASSWORD
  const previousValue = process.env.CHASSIS_SESSION_ENV_TEST
  process.env.CHASSIS_PASSWORD = "password"
  process.env.CHASSIS_SERVER_PASSWORD = "legacy"
  process.env.CHASSIS_SESSION_ENV_TEST = "included"

  const environment = Env.session()

  if (previousPassword === undefined) delete process.env.CHASSIS_PASSWORD
  else process.env.CHASSIS_PASSWORD = previousPassword
  if (previousLegacyPassword === undefined) delete process.env.CHASSIS_SERVER_PASSWORD
  else process.env.CHASSIS_SERVER_PASSWORD = previousLegacyPassword
  if (previousValue === undefined) delete process.env.CHASSIS_SESSION_ENV_TEST
  else process.env.CHASSIS_SESSION_ENV_TEST = previousValue

  expect(environment.CHASSIS_PASSWORD).toBeUndefined()
  expect(environment.CHASSIS_SERVER_PASSWORD).toBeUndefined()
  expect(environment.CHASSIS_SESSION_ENV_TEST).toBe("included")
})
