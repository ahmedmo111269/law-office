/**
 * Engine-neutral schema description shared by the SQLite and IndexedDB
 * profiles. Generated from the migrated v1 schema by `scripts/gen-portable-schema.ts`.
 *
 * It is intentionally serializable: the same descriptor drives IndexedDB
 * object stores/indexes, the portable constraint engine, backup manifests and
 * documentation. It is NOT a SQL text translator.
 */

export type PortableValue = string | number | null;

export interface PortableColumn {
  readonly name: string;
  readonly type: 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB' | 'ANY';
  readonly notNull: boolean;
  readonly defaultValue?: PortableValue | undefined;
  /** 1-based position inside a composite primary key; 0 when not a key. */
  readonly primaryKeyOrder: number;
  readonly references: { readonly table: string; readonly column: string } | null;
  readonly unique: boolean;
}

export interface PortableCheck {
  /** Exact expression text from the DDL, without the `CHECK` keyword. */
  readonly expression: string;
  /** Owned by a single column (reported in errors) or a table constraint. */
  readonly column: string | null;
}

export interface PortableIndex {
  readonly name: string;
  readonly columns: readonly string[];
  readonly unique: boolean;
  /** SQLite partial index predicate; IndexedDB has no partial indexes. */
  readonly where: string | null;
}

export interface PortableForeignKey {
  readonly columns: readonly string[];
  readonly referencedTable: string;
  readonly referencedColumns: readonly string[];
  readonly onDelete: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION' | 'SET DEFAULT';
}

export interface PortableTable {
  readonly name: string;
  readonly columns: readonly PortableColumn[];
  readonly primaryKey: readonly string[];
  readonly indexes: readonly PortableIndex[];
  readonly foreignKeys: readonly PortableForeignKey[];
  readonly checks: readonly PortableCheck[];
  /** Tables without sync/audit headers (system metadata, derived search). */
  readonly syncable: boolean;
  readonly appendOnly: boolean;
}

export interface PortableSchema {
  readonly schemaVersion: number;
  readonly applicationId: number;
  readonly tables: readonly PortableTable[];
}

export function tableByName(
  schema: PortableSchema,
  name: string,
): PortableTable | undefined {
  return schema.tables.find((table) => table.name === name);
}

export function primaryKeyOf(table: PortableTable): string {
  const key = table.primaryKey[0];
  if (!key) throw new Error(`table ${table.name} has no primary key`);
  return key;
}
