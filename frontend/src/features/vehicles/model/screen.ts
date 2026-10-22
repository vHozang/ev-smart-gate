import type { Vehicle } from './schema';
export interface VehiclesScreen {
  data: { rows: Vehicle[]; loaded: number | null };
  state: {
    search: string;
    loading: boolean;
    fetching: boolean;
    error: Error | null;
    canCreate: boolean;
    canUpdate: boolean;
    canDeactivate: boolean;
  };
  actions: {
    setSearch: (search: string) => void;
    refresh: () => Promise<unknown>;
    create: () => void;
    edit: (vehicle: Vehicle) => void;
    deactivate: (vehicle: Vehicle) => boolean;
    remove?: (vehicle: Vehicle) => boolean;
  };
}
