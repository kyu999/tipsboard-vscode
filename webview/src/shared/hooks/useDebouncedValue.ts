import { useEffect, useRef, useState } from "react";

/**
 * Returns `value` after `delayMs` of stability. When `resetKey` changes, the latest `value` is applied immediately.
 */
export function useDebouncedValue<T>(value: T, delayMs: number, resetKey?: string | number | null): T {
  const [debounced, setDebounced] = useState(value);
  const resetKeyRef = useRef(resetKey);

  useEffect(() => {
    if (resetKey !== resetKeyRef.current) {
      resetKeyRef.current = resetKey;
      setDebounced(value);
      return;
    }

    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs, resetKey]);

  return debounced;
}
