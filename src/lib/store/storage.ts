import type { StateStorage } from "zustand/middleware";

export type StorageErrorListener = (message: string) => void;

let onStorageError: StorageErrorListener | null = null;

export function setStorageErrorListener(listener: StorageErrorListener | null) {
  onStorageError = listener;
}

/** localStorage wrapper that reports a full or unavailable store instead of throwing. */
export function createSafeStorage(getBackend: () => Storage): StateStorage {
  return {
    getItem: (name) => {
      try {
        return getBackend().getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        getBackend().setItem(name, value);
      } catch {
        onStorageError?.(
          "Could not save to browser storage (it may be full). Your latest change is not saved.",
        );
      }
    },
    removeItem: (name) => {
      try {
        getBackend().removeItem(name);
      } catch {
        // nothing to remove
      }
    },
  };
}
