/**
 * Shared mutable ref for the app header height.
 * Set once on layout in _layout.tsx, read by Portal overlays.
 */
let _headerHeight = 0;

export const setHeaderHeight = (h: number) => { _headerHeight = h; };
export const getHeaderHeight = () => _headerHeight;
