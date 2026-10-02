/**
 * iOS Safari ignores user-scalable=no and still zooms on double-tap / pinch.
 * Block those gestures explicitly (the game has no text to zoom into).
 */
export function preventZoom(): void {
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = performance.now();
    if (now - lastTouchEnd < 350) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
}
