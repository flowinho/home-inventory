import { styled } from "@mui/material/styles";

const IconRoot = styled("span")({
  fontFamily: '"Material Symbols Rounded"',
  fontWeight: 400,
  fontStyle: "normal",
  fontSize: "1.35rem",
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  letterSpacing: "normal",
  textTransform: "none",
  whiteSpace: "nowrap",
  wordWrap: "normal",
  direction: "ltr",
  WebkitFontSmoothing: "antialiased",
  fontVariationSettings: '"FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24'
});

export function SymbolIcon({ icon }: { icon: string }) {
  return <IconRoot aria-hidden="true">{icon}</IconRoot>;
}
