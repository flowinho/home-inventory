import React from "react";
import ReactDOM from "react-dom/client";
import {
  CssBaseline,
  GlobalStyles,
  ThemeProvider,
  createTheme,
  useMediaQuery
} from "@mui/material";
import "@fontsource/material-symbols-rounded/400.css";
import "./styles.css";
import { App } from "./App";
import { useThemeMode } from "./hooks/useThemeMode";

function Root() {
  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");
  const { mode, setMode } = useThemeMode(prefersDarkMode);

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: {
            main: mode === "dark" ? "#7dd3c7" : "#146c63"
          },
          secondary: {
            main: mode === "dark" ? "#ffb36b" : "#b85c00"
          },
          background: {
            default: mode === "dark" ? "#0f1416" : "#f4efe6",
            paper: mode === "dark" ? "#162024" : "#fffdf8"
          }
        },
        shape: {
          borderRadius: 18
        },
        typography: {
          fontFamily:
            '"Segoe UI", "Noto Sans", "Helvetica Neue", Arial, sans-serif',
          h1: {
            fontSize: "2rem",
            fontWeight: 700
          },
          h2: {
            fontSize: "1.5rem",
            fontWeight: 700
          },
          h3: {
            fontSize: "1.2rem",
            fontWeight: 700
          }
        },
        components: {
          MuiCard: {
            styleOverrides: {
              root: {
                backgroundImage: "none"
              }
            }
          },
          MuiButton: {
            defaultProps: {
              disableElevation: true
            }
          }
        }
      }),
    [mode]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles
        styles={{
          ":root": {
            colorScheme: mode
          },
          body: {
            background:
              mode === "dark"
                ? "radial-gradient(circle at top, rgba(36, 83, 76, 0.45), transparent 35%), #0f1416"
                : "radial-gradient(circle at top, rgba(235, 189, 127, 0.35), transparent 30%), #f4efe6"
          }
        }}
      />
      <App mode={mode} onModeChange={setMode} />
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
