import { type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import i18n from "@/shared/i18n/config";
import {
  isAttachmentImageFile,
  isClientBlockedAttachment,
} from "@/shared/attachmentImportPolicy";
import {
  ATTACHMENT_TOO_LARGE_ERROR,
  DEFAULT_ATTACHMENT_MAX_BYTES,
  formatAttachmentLimitMiB,
} from "@/shared/attachmentConstants";

const importing = new WeakSet<EditorView>();

function hasDroppedFiles(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes("Files");
}

/** Shift+drop: images and allowed non-images (blocked executable-like extensions omitted client-side). */
function extractAttachableFiles(fileList: FileList): File[] {
  const files = Array.from(fileList);
  return files.filter((file) => isAttachmentImageFile(file) || !isClientBlockedAttachment(file));
}

export function createLocalAttachmentDropExtension(options: {
  getMaxAttachmentBytes: () => number;
  onError?: (message: string) => void;
}): Extension {
  const { getMaxAttachmentBytes, onError } = options;

  return EditorView.domEventHandlers({
    dragover(event) {
      if (!event.shiftKey || !event.dataTransfer || !hasDroppedFiles(event.dataTransfer)) return;
      const incoming = Array.from(event.dataTransfer.files);
      const usable = incoming.filter((file) => isAttachmentImageFile(file) || !isClientBlockedAttachment(file));
      if (usable.length === 0) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },

    drop(event, view) {
      if (!event.shiftKey || !event.dataTransfer || !hasDroppedFiles(event.dataTransfer)) return;

      const files = extractAttachableFiles(event.dataTransfer.files);
      if (files.length === 0) {
        event.preventDefault();
        const incoming = Array.from(event.dataTransfer.files);
        const blockedOnly =
          incoming.length > 0 &&
          incoming.every((f) => !isAttachmentImageFile(f) && isClientBlockedAttachment(f));
        if (blockedOnly) {
          onError?.(i18n.t("editor.attachmentBlocked"));
        }
        return;
      }

      event.preventDefault();

      const maxBytes = Math.max(1, getMaxAttachmentBytes() ?? DEFAULT_ATTACHMENT_MAX_BYTES);
      const oversized = files.filter((file) => file.size > maxBytes);
      if (oversized.length > 0) {
        onError?.(
          i18n.t("editor.fileTooLarge", {
            maxMiB: formatAttachmentLimitMiB(maxBytes),
          }),
        );
        return;
      }

      if (importing.has(view)) return;

      const insertPos =
        view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;

      importing.add(view);

      void Promise.all(
        files.map(async (file) => {
          const buf = await file.arrayBuffer();
          return { name: file.name, data: new Uint8Array(buf) };
        }),
      )
        .then((payloads) =>
          window.tipsboardDesktop.importAttachmentBuffers(payloads).then((inserted) => {
            const text = inserted.map((row) => row.markdown).join("\n");
            if (!text) return;
            view.dispatch({
              changes: { from: insertPos, insert: text },
              selection: { anchor: insertPos + text.length },
            });
          }),
        )
        .catch((error: unknown) => {
          if (error instanceof Error && error.message === ATTACHMENT_TOO_LARGE_ERROR) {
            onError?.(
              i18n.t("editor.fileTooLarge", {
                maxMiB: formatAttachmentLimitMiB(maxBytes),
              }),
            );
            return;
          }
          onError?.(error instanceof Error ? error.message : i18n.t("editor.importFailed"));
        })
        .finally(() => {
          importing.delete(view);
        });
    },
  });
}
