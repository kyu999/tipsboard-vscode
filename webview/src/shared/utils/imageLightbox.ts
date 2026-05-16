let activeBackdrop: HTMLElement | null = null;
let activeKeyHandler: ((event: KeyboardEvent) => void) | null = null;
let activeWheelHandler: ((event: WheelEvent) => void) | null = null;

function teardownImageLightbox(): void {
  if (activeKeyHandler) {
    document.removeEventListener("keydown", activeKeyHandler);
    activeKeyHandler = null;
  }
  if (activeWheelHandler && activeBackdrop) {
    activeBackdrop.removeEventListener("wheel", activeWheelHandler);
    activeWheelHandler = null;
  }
  if (activeBackdrop?.isConnected) {
    activeBackdrop.remove();
  }
  activeBackdrop = null;
}

/**
 * Fullscreen-style overlay for embedded images. Esc or backdrop click closes.
 * Wheel / trackpad pinch zooms in place; +/- and 0 keys adjust zoom (helps in VS Code webviews where host may capture some gestures).
 */
export function openImageLightbox(src: string, alt: string): void {
  teardownImageLightbox();

  let scale = 1;
  const minScale = 0.25;
  const maxScale = 10;

  const backdrop = document.createElement("div");
  backdrop.className =
    "fixed inset-0 z-[100] flex cursor-default items-center justify-center bg-black/60 p-4 overflow-auto";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");

  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  img.className =
    "max-h-[90vh] max-w-[min(100%,calc(100vw-2rem))] object-contain shadow-lg rounded-lg select-none";
  img.draggable = false;
  img.style.transformOrigin = "center center";
  img.style.willChange = "transform";

  const applyScale = (): void => {
    img.style.transform = `scale(${scale})`;
  };
  applyScale();

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    const zoomIn = event.deltaY < 0;
    const factor = zoomIn ? 1.12 : 1 / 1.12;
    scale = Math.min(maxScale, Math.max(minScale, scale * factor));
    applyScale();
  };

  activeWheelHandler = onWheel;
  backdrop.addEventListener("wheel", onWheel, { passive: false, capture: true });

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      teardownImageLightbox();
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      scale = Math.min(maxScale, scale * 1.15);
      applyScale();
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      scale = Math.max(minScale, scale / 1.15);
      applyScale();
      return;
    }
    if (event.key === "0") {
      event.preventDefault();
      scale = 1;
      applyScale();
    }
  };

  activeKeyHandler = onKeyDown;
  document.addEventListener("keydown", onKeyDown);

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      teardownImageLightbox();
    }
  });

  activeBackdrop = backdrop;
  backdrop.appendChild(img);
  document.body.appendChild(backdrop);
}
