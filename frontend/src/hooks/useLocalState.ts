import { useEffect, useState, useCallback } from "react";

const PREFIX = "hec.";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota or privacy mode */
  }
}

export function useLocalState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => read<T>(key, initial));
  useEffect(() => {
    write(key, value);
  }, [key, value]);
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        return v;
      });
    },
    [],
  );
  return [value, set];
}

export const LocalStore = {
  get: read,
  set: write,
  remove(key: string) {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(PREFIX + key);
  },
};