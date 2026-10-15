// Kept free of three.js imports so the Match page can probe support without loading the 3D bundle.
export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch { return false; }
}
/** Pick a render tier from the device. Users can still switch to 2D at any time. */
export function detectQuality() {
  const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4;
  const touch = window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 700;
  if (mem <= 2 || cores <= 2) return 'low';
  if (touch) return mem >= 6 && cores >= 6 ? 'medium' : 'low';
  return 'high';
}
