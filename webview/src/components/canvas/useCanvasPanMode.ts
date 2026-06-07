import { useEffect, useState } from "react";

/** Space キー押下中は左ドラッグでもパンできるようにする。 */
export function useCanvasPanMode(): boolean {
  const [spaceDown, setSpaceDown] = useState(false);

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space" || event.repeat || isEditableTarget(event.target)) return;
      event.preventDefault();
      setSpaceDown(true);
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") setSpaceDown(false);
    }

    function onBlur() {
      setSpaceDown(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return spaceDown;
}
