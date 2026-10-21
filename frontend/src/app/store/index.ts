import { configureStore, createSlice } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import type { PayloadAction } from '@reduxjs/toolkit';
interface Preferences {
  sidebarCollapsed: boolean;
}
function readPreference(): boolean {
  try {
    return localStorage.getItem('evsg:sidebar-collapsed') === 'true';
  } catch {
    return false;
  }
}
const preferences = createSlice({
  name: 'preferences',
  initialState: { sidebarCollapsed: readPreference() } satisfies Preferences,
  reducers: {
    setSidebarCollapsed(state, action: PayloadAction<boolean>) {
      state.sidebarCollapsed = action.payload;
    },
  },
});
export const { setSidebarCollapsed } = preferences.actions;
export const store = configureStore({
  reducer: { preferences: preferences.reducer },
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
