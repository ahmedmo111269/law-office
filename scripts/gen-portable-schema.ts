/**
 * Generates `src/schema/v1/portable-schema.ts` from the real migrated schema.
 *
 *   node --disable-warning=ExperimentalWarning scripts/gen-portable-schema.ts
 *
 * Column metadata comes from PRAGMA output; CHECK expressions are extracted
 * from the stored DDL text so the portable profile evaluates exactly the same
 * predicates as SQLite instead of a hand-maintained approximation.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { LawOfficeDatabase } from '../src/app/law-office-database.ts';
import { LAW_OFFICE_APPLICATION_ID } from '../src/db/constants.ts';
import type {
  PortableCheck,
  PortableColumn,
  PortableForeignKey,
  PortableIndex,
  PortableTable,
} from '../src/schema/portable-types.ts';

const { database: db } = LawOfficeDatabase.open({
  path: ':memory:',
  appVersion: '0.1.0-gen',
});

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let quote: string | null = null;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;
    if (quote) {
      current += char;
      if (char === quote) {
        if (input[index + 1] === quote) {
          current += input[index + 1]!;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function extractBalanced(
  input: string,
  start: number,
): { body: string; end: number } {
  let depth = 0;
  let quote: string | null = null;
  for (let index = start; index < input.length; index += 1) {
    const char = input[index]!;
    if (quote) {
      if (char === quote) {
        if (input[index + 1] === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (char === "'") {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0)
        return { body: input.slice(start + 1, index), end: index };
    }
  }
  throw new Error(`unbalanced parentheses: ${input.slice(start, start + 80)}`);
}

function extractChecks(text: string, column: string | null): PortableCheck[] {
  const checks: PortableCheck[] = [];
  let index = 0;
  const upper = text.toUpperCase();
  while ((index = upper.indexOf('CHECK', index)) !== -1) {
    let cursor = index + 5;
    while (/\s/.test(text[cursor] ?? '')) cursor += 1;
    if (text[cursor] !== '(')
      throw new Error(
        `CHECK without parenthesis near ${text.slice(index, index + 40)}`,
      );
    const { body, end } = extractBalanced(text, cursor);
    checks.push({ expression: body.trim(), column });
    index = end + 1;
  }
  return checks;
}

function parseDefault(text: string): {
  value: string | number | null | undefined;
  rest: string;
} {
  const match = /\bDEFAULT\s+(\([^)]*\)|'(?:''|[^'])*'|[A-Za-z0-9_.+-]+)/i.exec(
    text,
  );
  if (!match) return { value: undefined, rest: text };
  const raw = match[1]!;
  let value: string | number | null;
  if (raw.startsWith("'")) value = raw.slice(1, -1).replace(/''/g, "'");
  else if (/^NULL$/i.test(raw)) value = null;
  else if (/^[0-9.+-]+$/.test(raw)) value = Number(raw);
  else value = raw.replace(/^\(|\)$/g, '');
  const rest = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;
  return { value, rest };
}

const tables: PortableTable[] = [];
const rows = db.db.query<{ name: string; sql: string }>(
  `SELECT name, sql FROM sqlite_master
   WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'search_fts'
     AND name NOT LIKE 'search_fts_%'
   ORDER BY name`,
);

for (const row of rows) {
  const sql = row.sql;
  const bodyMatch =
    /^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["'`]?([A-Za-z0-9_]+)["'`]?\s*\(/i.exec(
      sql,
    );
  if (!bodyMatch) throw new Error(`cannot parse CREATE TABLE for ${row.name}`);
  const open = sql.indexOf('(', bodyMatch.index + bodyMatch[0].length - 1) + 0;
  const openIndex = sql.indexOf('(', sql.toUpperCase().indexOf('CREATE TABLE'));
  if (openIndex < 0) throw new Error('no body');
  void open;
  const { body } = extractBalanced(sql, openIndex);
  const segments = splitTopLevel(body);

  const pragma = db.db.query<{
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }>(`PRAGMA table_info("${row.name}")`);

  const checks: PortableCheck[] = [];
  const tableConstraints: string[] = [];
  const inlineUnique = new Set<string>();
  const inlineReferences = new Map<string, { table: string; column: string }>();
  const columnTypes = new Map<string, string>();

  for (const segment of segments) {
    const head = segment.trimStart();
    if (
      /^(CONSTRAINT\b.*)?(CHECK|UNIQUE|PRIMARY\s+KEY|FOREIGN\s+KEY)\b/i.test(
        head,
      )
    ) {
      const withoutName = head.replace(/^CONSTRAINT\s+\S+\s+/i, '');
      if (/^CHECK\b/i.test(withoutName)) {
        checks.push(...extractChecks(withoutName, null));
      } else if (/^UNIQUE\b/i.test(withoutName)) {
        const paren = withoutName.indexOf('(');
        if (paren >= 0) {
          const { body: cols } = extractBalanced(withoutName, paren);
          for (const column of splitTopLevel(cols))
            inlineUnique.add(column.replace(/["'`]/g, '').trim());
        }
      }
      tableConstraints.push(withoutName);
      continue;
    }
    const columnMatch = /^["'`]?([A-Za-z0-9_]+)["'`]?\s+([A-Za-z]+)?/i.exec(
      head,
    );
    if (!columnMatch)
      throw new Error(
        `cannot parse column in ${row.name}: ${head.slice(0, 60)}`,
      );
    const columnName = columnMatch[1]!;
    const columnType = (columnMatch[2] ?? 'ANY').toUpperCase();
    columnTypes.set(columnName, columnType);
    const rest = head.slice(columnMatch[0].length);
    const { rest: withoutDefault } = parseDefault(rest);
    checks.push(...extractChecks(withoutDefault, columnName));
    if (/\bUNIQUE\b/i.test(withoutDefault)) inlineUnique.add(columnName);
    const reference =
      /\bREFERENCES\s+["'`]?([A-Za-z0-9_]+)["'`]?\s*\(\s*["'`]?([A-Za-z0-9_]+)["'`]?\s*\)/i.exec(
        withoutDefault,
      );
    if (reference)
      inlineReferences.set(columnName, {
        table: reference[1]!,
        column: reference[2]!,
      });
  }

  const columns: PortableColumn[] = pragma.map((column) => ({
    name: column.name,
    type: (['TEXT', 'INTEGER', 'REAL', 'BLOB'].includes(
      columnTypes.get(column.name) ?? '',
    )
      ? columnTypes.get(column.name)
      : 'ANY') as PortableColumn['type'],
    notNull: column.notnull === 1,
    defaultValue:
      column.dflt_value === null
        ? undefined
        : /^'.*'$/.test(column.dflt_value)
          ? column.dflt_value.slice(1, -1).replace(/''/g, "'")
          : /^-?[0-9.]+$/.test(column.dflt_value)
            ? Number(column.dflt_value)
            : column.dflt_value,
    primaryKeyOrder: column.pk,
    references: inlineReferences.get(column.name) ?? null,
    unique: inlineUnique.has(column.name),
  }));

  // Foreign keys from PRAGMA (authoritative, handles composite keys).
  const fkRows = db.db.query<{
    id: number;
    seq: number;
    table: string;
    from: string;
    to: string;
    on_delete: string;
  }>(`PRAGMA foreign_key_list("${row.name}")`);
  const fkGroups = new Map<number, typeof fkRows>();
  for (const fk of fkRows) {
    const group = fkGroups.get(fk.id) ?? [];
    group.push(fk);
    fkGroups.set(fk.id, group);
  }
  const foreignKeys: PortableForeignKey[] = [...fkGroups.values()].map(
    (group) => {
      const sorted = [...group].sort((a, b) => a.seq - b.seq);
      return {
        columns: sorted.map((item) => item.from),
        referencedTable: sorted[0]!.table,
        referencedColumns: sorted.map((item) => item.to),
        onDelete: sorted[0]!.on_delete as PortableForeignKey['onDelete'],
      };
    },
  );

  const indexRows = db.db.query<{
    name: string;
    unique: number;
    partial: number;
    origin: string;
  }>(`PRAGMA index_list("${row.name}")`);
  const indexes: PortableIndex[] = [];
  for (const index of indexRows) {
    const info = db.db.query<{ name: string }>(
      `PRAGMA index_info("${index.name}")`,
    );
    indexes.push({
      name: index.name,
      columns: info.map((item) => item.name),
      unique: index.unique === 1,
      where: index.partial === 1 ? partialPredicate(sql, index.name) : null,
    });
  }

  const names = new Set(columns.map((column) => column.name));
  const syncable =
    names.has('deleted_at') &&
    names.has('revision') &&
    names.has('sync_status');
  tables.push({
    name: row.name,
    columns,
    primaryKey: pragma
      .filter((column) => column.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((column) => column.name),
    indexes,
    foreignKeys,
    checks,
    syncable,
    appendOnly:
      names.has('seq') && /_history$|_snapshot$|^audit_log$/.test(row.name),
  });
}

function partialPredicate(sql: string, indexName: string): string | null {
  const pattern = new RegExp(
    `CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?["'\`]?${indexName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'\`]?[^;]*?\\bWHERE\\b([^;]+);`,
    'i',
  );
  const match = pattern.exec(sql);
  return match ? match[1]!.trim() : null;
}

// Partial indexes are declared in separate CREATE INDEX statements, not inside
// the table body; resolve predicates from sqlite_master directly.
for (const table of tables) {
  for (let index = 0; index < table.indexes.length; index += 1) {
    const entry = table.indexes[index]!;
    if (entry.where !== null) continue;
    const master = db.db.get<{ sql: string | null }>(
      'SELECT sql FROM sqlite_master WHERE type = ? AND name = ?',
      ['index', entry.name],
    );
    if (master?.sql && /\bWHERE\b/i.test(master.sql)) {
      (table.indexes as PortableIndex[])[index] = {
        ...entry,
        where: master.sql
          .split(/\bWHERE\b/i)[1]!
          .trim()
          .replace(/;$/, '')
          .trim(),
      };
    }
  }
}

const output = `/**
 * GENERATED FILE — do not edit by hand.
 * Source: migrated schema v2 (SQLite ${db.db.get<{ v: string }>('SELECT sqlite_version() AS v')?.v}).
 * Regenerate: node --disable-warning=ExperimentalWarning scripts/gen-portable-schema.ts
 *
 * This descriptor is the engine-neutral schema used by the IndexedDB profile
 * and by the portable constraint engine. CHECK expressions are copied verbatim
 * from the DDL and evaluated by src/portable/expression.ts.
 */
import type { PortableSchema } from '../portable-types.ts';

export const PORTABLE_SCHEMA: PortableSchema = ${JSON.stringify(
  {
    schemaVersion: 2,
    applicationId: LAW_OFFICE_APPLICATION_ID,
    tables,
  },
  null,
  2,
)};
`;
mkdirSync('src/schema/v2', { recursive: true });
writeFileSync('src/schema/v2/portable-schema.ts', output);
process.stdout.write(
  `portable schema: ${tables.length} tables, ${tables.reduce((sum, table) => sum + table.indexes.length, 0)} indexes, ` +
    `${tables.reduce((sum, table) => sum + table.checks.length, 0)} checks, ` +
    `${tables.reduce((sum, table) => sum + table.foreignKeys.length, 0)} foreign keys\n`,
);
db.close();
