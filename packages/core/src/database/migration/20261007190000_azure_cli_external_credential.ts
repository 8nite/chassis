import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"



const migration: DatabaseMigration.Migration = {
  id: "20261007190000_azure_cli_external_credential",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        UPDATE \`credential\`
        SET \`value\` = json_remove(json_set(\`value\`, '$.type', 'external'), '$.access', '$.refresh', '$.expires')
        WHERE \`integration_id\` = 'azure'
          AND json_extract(\`value\`, '$.type') = 'oauth'
          AND json_extract(\`value\`, '$.methodID') = 'azure-cli'
      `)
    })
  },
}

export default migration
