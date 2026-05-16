/**
 * Runs `fn` only when `ref.current` is false. Sets `ref` true for the duration
 * and clears it in `finally` (including when `fn` throws).
 * If already in flight, returns `undefined` without invoking `fn`.
 */
export async function runUnlessInFlight<T>(
  ref: { current: boolean },
  fn: () => Promise<T>,
): Promise<T | undefined> {
  if (ref.current) return undefined;
  ref.current = true;
  try {
    return await fn();
  } finally {
    ref.current = false;
  }
}
