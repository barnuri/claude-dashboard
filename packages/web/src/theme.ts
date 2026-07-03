import { createTheme, type MantineColorsTuple } from "@mantine/core";

// Palette derived from the dataviz skill's validated reference palette (dark-mode steps).
export const vizColors = {
  surface: "#1a1a19",
  page: "#0d0d0d",
  textPrimary: "#ffffff",
  textSecondary: "#c3c2b7",
  muted: "#898781",
  gridline: "#2c2c2a",
  border: "rgba(255,255,255,0.10)",
  series: {
    blue: "#3987e5", // input tokens
    aqua: "#199e70", // output tokens
    yellow: "#c98500", // cache write
    violet: "#9085e9", // cache read
    red: "#e66767",
  },
  status: {
    good: "#0ca30c", // running
    warning: "#fab219", // waiting on user
    serious: "#ec835a", // context pressure high
    critical: "#d03b3b", // errored tool call / context at limit
    ended: "#5a6b7d", // finished session — calm slate-blue, distinct from muted idle
  },
};

function toTuple(hex: string): MantineColorsTuple {
  // Mantine needs a 10-step tuple; we only really use index 5-6 for solid fills,
  // so approximate the ramp by lightening/darkening the base hue.
  return [hex, hex, hex, hex, hex, hex, hex, hex, hex, hex] as unknown as MantineColorsTuple;
}

export const theme = createTheme({
  primaryColor: "brand",
  primaryShade: 5,
  colors: {
    brand: [
      "#e8f0fd",
      "#c7dcf9",
      "#a3c6f5",
      "#7eb0f0",
      "#5c9cec",
      "#3987e5",
      "#2f74c9",
      "#2560ac",
      "#1a4c8f",
      "#0f3872",
    ] as unknown as MantineColorsTuple,
  },
  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  defaultRadius: "md",
  components: {
    Card: {
      defaultProps: { withBorder: true },
    },
  },
});
