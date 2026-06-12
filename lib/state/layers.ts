import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { FACILITY_TYPES, type FacilityType } from '@/lib/facilities/types';

interface LayersState {
  /** Per-type visibility — persisted across sessions (US-2.1). */
  visible: Record<FacilityType, boolean>;
  /** True once AsyncStorage rehydration finished. Gate the first map render
   *  on this to avoid toggle flicker (playbook pitfall). */
  hasHydrated: boolean;
  toggleLayer: (type: FacilityType) => void;
  setHasHydrated: (value: boolean) => void;
}

const DEFAULT_VISIBLE = Object.fromEntries(
  FACILITY_TYPES.map((type) => [type, true]),
) as Record<FacilityType, boolean>;

export const useLayersStore = create<LayersState>()(
  persist(
    (set) => ({
      visible: DEFAULT_VISIBLE,
      hasHydrated: false,
      toggleLayer: (type) =>
        set((state) => ({
          visible: { ...state.visible, [type]: !state.visible[type] },
        })),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'sanlikas-layers',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ visible: state.visible }),
      merge: (persisted, current) => {
        // Tolerate older persisted shapes: unknown keys dropped, missing keys defaulted.
        const saved = (persisted as Partial<Pick<LayersState, 'visible'>> | undefined)?.visible;
        const visible = { ...DEFAULT_VISIBLE };
        if (saved) {
          for (const type of FACILITY_TYPES) {
            if (typeof saved[type] === 'boolean') visible[type] = saved[type];
          }
        }
        return { ...current, visible };
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) console.warn('[layers] rehydration failed, using defaults:', error);
        // Mark hydrated either way — defaults are a valid first render.
        useLayersStore.getState().setHasHydrated(true);
      },
    },
  ),
);
