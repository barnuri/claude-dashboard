import { createTheme, type MantineColorsTuple } from "@mantine/core";

/**
 * "Mission deck" design tokens: warm ink surfaces, Claude terracotta as the
 * single brand accent, and semantic status colors that carry all meaning.
 * Chart series colors stay on the dataviz skill's validated dark-mode palette.
 */
export const fonts = {
  display: "'Chakra Petch', 'IBM Plex Sans', system-ui, sans-serif",
  body: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
};

export const vizColors = {
  page: "#121110",
  surface: "#1a1816",
  raised: "#211e1b",
  textPrimary: "#f2efe9",
  textSecondary: "#b3ac9f",
  muted: "#847d70",
  gridline: "#2c2a26",
  border: "rgba(255,255,255,0.09)",
  brand: "#d97757",
  series: {
    blue: "#3987e5", // input tokens
    aqua: "#199e70", // output tokens
    yellow: "#c98500", // cache write
    violet: "#9085e9", // cache read
    red: "#e66767",
  },
  status: {
    good: "#3fb950", // running
    warning: "#f0b429", // waiting on user
    serious: "#ec835a", // context pressure high
    critical: "#e5484d", // errored tool call / context at limit
    ended: "#7d8ea1", // finished session — calm slate-blue, distinct from muted idle
  },
};

const brand: MantineColorsTuple = [
  "#fbf0ea",
  "#f4dccf",
  "#edc3ac",
  "#e5a988",
  "#df8f68",
  "#d97757",
  "#c26243",
  "#a24f35",
  "#823e29",
  "#622e1e",
];

// Warm dark ramp: dark[7] is the page body, dark[6] the card surface,
// dark[4] the default border, dark[0..2] the text steps.
const dark: MantineColorsTuple = [
  "#f2efe9",
  "#d9d4c9",
  "#b3ac9f",
  "#847d70",
  "#3a362f",
  "#2a2723",
  "#1a1816",
  "#121110",
  "#0d0c0b",
  "#080807",
];

export const theme = createTheme({
  primaryColor: "brand",
  primaryShade: 5,
  autoContrast: true,
  luminanceThreshold: 0.35,
  black: "#26140c",
  colors: { brand, dark },
  fontFamily: fonts.body,
  fontFamilyMonospace: fonts.mono,
  headings: { fontFamily: fonts.display, fontWeight: "600" },
  defaultRadius: "md",
  components: {
    Card: {
      defaultProps: { withBorder: true, radius: "lg", padding: "md" },
    },
    Tooltip: {
      defaultProps: { withArrow: true },
    },
  },
});
