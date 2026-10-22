export interface ListScreen<T> {
  data: { rows: T[]; loaded: number | null };
  state: { search: string; loading: boolean; fetching: boolean; error: Error | null };
  actions: { setSearch: (search: string) => void; refresh: () => Promise<unknown> };
}

export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
  coverage: 'complete' | 'partial';
  total: number | null;
}
