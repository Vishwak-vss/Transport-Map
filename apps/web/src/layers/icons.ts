// White silhouettes pointing up; deck.gl tints them (mask: true) and rotates them by heading.
const svg = (path: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="white" d="${path}"/></svg>`,
  )}`;

export const PLANE_ICON = {
  url: svg('M32 2 L38 22 L60 36 L60 42 L38 36 L38 52 L46 58 L46 62 L32 58 L18 62 L18 58 L26 52 L26 36 L4 42 L4 36 L26 22 Z'),
  width: 64,
  height: 64,
  mask: true,
};

export const SHIP_ICON = {
  url: svg('M32 2 L46 20 L46 52 L40 62 L24 62 L18 52 L18 20 Z'),
  width: 64,
  height: 64,
  mask: true,
};
