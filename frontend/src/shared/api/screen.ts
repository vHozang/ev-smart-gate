export interface ListScreen<T> {
  data: { rows: T[]; loaded: number | null };
  state: { search: string; loading: boolean; fetching: boolean; error: Error | null };
  actions: { setSearch: (search: string) => void; refresh: () => Promise<unknown> };
}
