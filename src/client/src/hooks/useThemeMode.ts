import * as React from "react";
import type { ThemeMode } from "../../../shared/models";

const STORAGE_KEY = "theme-mode";

export function useThemeMode(prefersDarkMode: boolean) {
  const [mode, setModeState] = React.useState<ThemeMode>(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
    return prefersDarkMode ? "dark" : "light";
  });

  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== "light" && stored !== "dark") {
      setModeState(prefersDarkMode ? "dark" : "light");
    }
  }, [prefersDarkMode]);

  React.useEffect(() => {
    document.documentElement.dataset.theme = mode;
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  return {
    mode,
    setMode: setModeState
  };
}
