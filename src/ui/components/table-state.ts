export type TableDensity = 'compact' | 'comfortable';

export interface TableSort {
  readonly key: string;
  readonly dir: 'asc' | 'desc';
}

export interface TableState {
  readonly order: string[];
  readonly hidden: string[];
  readonly widths: Record<string, number>;
  readonly pinned: string[];
  readonly pageSize: number;
  readonly density: TableDensity;
  readonly sort: TableSort | null;
  readonly search?: string;
  readonly filters?: Record<string, string>;
}

export function defaultTableState(order: readonly string[], sort: TableSort | null = null): TableState {
  return {
    order: [...order],
    hidden: [],
    widths: {},
    pinned: [],
    pageSize: 25,
    density: 'comfortable',
    sort,
  };
}

export interface SavedTableView {
  readonly id: string;
  readonly name: string;
  readonly state: TableState;
  readonly createdAt: string;
}

export const PAGE_SIZES = [10, 25, 50, 100] as const;
