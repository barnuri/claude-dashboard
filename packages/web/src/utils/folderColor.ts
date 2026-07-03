/**
 * A fixed palette of readable, distinct hues for tagging folders on dark surfaces.
 * Chosen for contrast against the #1a1a19 card background and separation from each other.
 */
const FOLDER_PALETTE: readonly string[] = [
  "#5c9cec", // blue
  "#26a682", // teal
  "#c9a227", // gold
  "#b57edc", // lavender
  "#e0796b", // coral
  "#5bb98c", // green
  "#e2a0c4", // pink
  "#6ec1c9", // aqua
  "#d99a5b", // amber
  "#9aa5f0", // periwinkle
  "#c0b04e", // olive
  "#ce8f8f", // rose
];

/** Stable non-cryptographic hash (FNV-1a) so a given path always maps to the same bucket. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministically map a folder path to a palette color, so the same folder shows the
 * same color on every card. Different folders spread across the palette by hash.
 */
export function folderColor(path: string): string {
  const index = hashString(path) % FOLDER_PALETTE.length;
  return FOLDER_PALETTE[index] as string;
}
