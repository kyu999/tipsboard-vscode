import { useEffect, useRef } from "react";

export function useClickOutside<T extends HTMLElement>(
  active: boolean,
  onOutsideClick: () => void,
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;

    function handlePointerDown(event: PointerEvent) {
      const element = ref.current;
      if (!element || element.contains(event.target as Node)) return;
      onOutsideClick();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [active, onOutsideClick]);

  return ref;
}
