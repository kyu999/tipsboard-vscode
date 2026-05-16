import { type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import i18n from "@/shared/i18n/config";

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
const MAX_SIZE = 10 * 1024 * 1024;

const importing = new WeakSet<EditorView>();

function hasImageFiles(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes("Files");
}

function extractImageFiles(dataTransfer: DataTransfer): File[] {
  return Array.from(dataTransfer.files).filter((file) => ALLOWED_TYPES.has(file.type));
}

export function createLocalImageDropExtension(
  onError?: (message: string) => void,
): Extension {
  return EditorView.domEventHandlers({
    dragover(event) {
      if (event.dataTransfer && hasImageFiles(event.dataTransfer)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }
    },

    drop(event, view) {
      if (!event.dataTransfer || !hasImageFiles(event.dataTransfer)) return;

      const files = extractImageFiles(event.dataTransfer);
      if (files.length === 0) return;

      event.preventDefault();

      const oversized = files.filter((file) => file.size > MAX_SIZE);
      if (oversized.length > 0) {
        onError?.(i18n.t("editor.fileTooLarge"));
        return;
      }

      if (importing.has(view)) return;

      const insertPos =
        view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
        view.state.selection.main.head;

      importing.add(view);

      void Promise.all(
        files.map(async (file) => {
          const buf = await file.arrayBuffer();
          return { name: file.name, data: new Uint8Array(buf) };
        }),
      )
        .then((payloads) =>
          window.tipsboardDesktop.importImageBuffers(payloads).then((images) => {
            const text = images.map((image) => image.markdown).join("\n");
            if (!text) return;
            view.dispatch({
              changes: { from: insertPos, insert: text },
              selection: { anchor: insertPos + text.length },
            });
          }),
        )
        .catch((error) => {
          onError?.(error instanceof Error ? error.message : i18n.t("editor.importFailed"));
        })
        .finally(() => {
          importing.delete(view);
        });
    },
  });
}
