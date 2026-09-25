"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

/**
 * useState that mirrors to localStorage. Hydrates after mount (so server and client
 * render identically) and tolerates storage being unavailable or full.
 */
export function usePersistentState<T>(
  key: string,
  initial: T
): [T, Dispatch<SetStateAction<T>>, { hydrated: boolean }] {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);
  const initialRef = useRef(initial);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setValue(raw ? (JSON.parse(raw) as T) : initialRef.current);
    } catch {
      // Unreadable or blocked storage: start fresh.
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked: state still works for this session.
    }
  }, [key, value, hydrated]);

  return [value, setValue, { hydrated }];
}
