import { useCallback, useState, type MouseEvent, type PointerEvent } from "react";

export function useCanvasNodeEditMode() {
  const [editing, setEditing] = useState(false);

  const beginEditing = useCallback((event: MouseEvent | PointerEvent) => {
    event.stopPropagation();
    setEditing(true);
  }, []);

  const endEditing = useCallback(() => {
    setEditing(false);
  }, []);

  const blockDragWhileEditing = useCallback(
    (event: PointerEvent) => {
      if (editing) event.stopPropagation();
    },
    [editing],
  );

  return { editing, beginEditing, endEditing, blockDragWhileEditing };
}
