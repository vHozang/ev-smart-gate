import { configureStore, createSlice } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import type { PayloadAction } from '@reduxjs/toolkit';

interface PreferencesState {
  sidebarCollapsed: boolean;
}

interface WorkspaceState {
  activeWorkspaceTab: string;
  tableDense: boolean;
  autoRefresh: boolean;
}

interface AuthLifecycleState {
  status: 'idle' | 'authenticated' | 'unauthenticated' | 'expired';
  lastAuthEventAt: number | null;
}

function readSidebarPreference(): boolean {
  try {
    return localStorage.getItem('evsg:sidebar-collapsed') === 'true';
  } catch {
    return false;
  }
}

const preferencesSlice = createSlice({
  name: 'preferences',
  initialState: { sidebarCollapsed: readSidebarPreference() } satisfies PreferencesState,
  reducers: {
    setSidebarCollapsed(state, action: PayloadAction<boolean>) {
      state.sidebarCollapsed = action.payload;
    },
  },
});

const initialWorkspaceState: WorkspaceState = {
  activeWorkspaceTab: 'overview',
  tableDense: false,
  autoRefresh: true,
};

const workspaceSlice = createSlice({
  name: 'workspace',
  initialState: initialWorkspaceState,
  reducers: {
    setActiveWorkspaceTab(state, action: PayloadAction<string>) {
      state.activeWorkspaceTab = action.payload;
    },
    setTableDense(state, action: PayloadAction<boolean>) {
      state.tableDense = action.payload;
    },
    setAutoRefresh(state, action: PayloadAction<boolean>) {
      state.autoRefresh = action.payload;
    },
  },
});

const initialAuthLifecycleState: AuthLifecycleState = {
  status: 'idle',
  lastAuthEventAt: null,
};

const authLifecycleSlice = createSlice({
  name: 'authLifecycle',
  initialState: initialAuthLifecycleState,
  reducers: {
    setAuthStatus(state, action: PayloadAction<AuthLifecycleState['status']>) {
      state.status = action.payload;
      state.lastAuthEventAt = Date.now();
    },
    resetAuthStatus(state) {
      state.status = 'unauthenticated';
      state.lastAuthEventAt = Date.now();
    },
  },
});

export const { setSidebarCollapsed } = preferencesSlice.actions;
export const { setActiveWorkspaceTab, setTableDense, setAutoRefresh } = workspaceSlice.actions;
export const { setAuthStatus, resetAuthStatus } = authLifecycleSlice.actions;

export const store = configureStore({
  reducer: {
    preferences: preferencesSlice.reducer,
    workspace: workspaceSlice.reducer,
    authLifecycle: authLifecycleSlice.reducer,
  },
  // Đảm bảo không lưu non-serializable values (token, Blob, socket, controller)
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: true,
    }),
});

store.subscribe(() => {
  try {
    localStorage.setItem(
      'evsg:sidebar-collapsed',
      String(store.getState().preferences.sidebarCollapsed),
    );
  } catch {
    /* Preference không ảnh hưởng nghiệp vụ. */
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

export const selectSidebarCollapsed = (state: RootState) => state.preferences.sidebarCollapsed;
export const selectWorkspace = (state: RootState) => state.workspace;
export const selectAuthStatus = (state: RootState) => state.authLifecycle.status;
