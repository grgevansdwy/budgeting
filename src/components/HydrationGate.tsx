"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useBudgetStore } from "@/lib/store/store";
import { setStorageErrorListener } from "@/lib/store/storage";

/** Loads saved data from localStorage before rendering anything that reads the store. */
export function HydrationGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    setStorageErrorListener(setStorageError);
    void Promise.resolve(useBudgetStore.persist.rehydrate()).then(() =>
      setReady(true),
    );
    return () => setStorageErrorListener(null);
  }, []);

  if (!ready) return <p className="p-6 text-sm text-zinc-500">Loading…</p>;
  return (
    <>
      {storageError && (
        <p role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-800">
          {storageError}
        </p>
      )}
      {children}
    </>
  );
}
