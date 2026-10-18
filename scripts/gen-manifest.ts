import { writeFileSync } from 'node:fs';
import { SqliteDatabase } from '../src/db/sqlite/sqlite-adapter.ts';
import { MigrationManager } from '../src/db/migrations/manager.ts';
import { INITIAL_MIGRATION } from '../src/db/migrations/0001_initial.ts';
import { SystemClock } from '../src/util/clock.ts';
const db = SqliteDatabase.open({ path: ':memory:' });
new MigrationManager(db, {clock:new SystemClock(), appVersion:'0.1.0', migrations:[INITIAL_MIGRATION]}).migrate();
const q = (sql:string) => db.query<{name:string}>(sql).map(r=>r.name);
const tables = q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'search_fts_%' AND name <> 'search_fts' ORDER BY name");
const indexes = q("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_autoindex%' AND name NOT LIKE 'search_fts_%' ORDER BY name");
const triggers = q("SELECT name FROM sqlite_master WHERE type='trigger' AND name NOT LIKE 'search_%' ORDER BY name");
const arr = (name:string, values:string[]) => `export const ${name}: readonly string[] = ${JSON.stringify(values, null, 2)};\n`;
const content = `/**\n * Generated from a freshly migrated schema v1 database.\n * Used by health checks and tests to detect accidental schema drift.\n * Regenerate with: node --disable-warning=ExperimentalWarning scripts/gen-manifest.ts\n */\n\n` +
  arr('REQUIRED_TABLES_V1', tables) + '\n' + arr('REQUIRED_INDEXES_V1', indexes) + '\n' + arr('REQUIRED_TRIGGERS_V1', triggers);
writeFileSync('src/schema/v1/manifest.ts', content);
console.log('wrote manifest', tables.length, 'tables', indexes.length, 'indexes', triggers.length, 'triggers');
