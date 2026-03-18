"use client";

import { useSyncExternalStore } from "react";
import { THEME_EVENT, THEME_STORAGE_KEY, type ThemeMode } from "@/lib/themeShared";

export function getThemeSnapshot(): ThemeMode {
  if (typeof document === "undefined") {
    return "dark";
  }

  const theme = document.documentElement.dataset.theme;
  return theme === "light" ? "light" : "dark";
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}

export function persistTheme(theme: ThemeMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage write failures.
  }
}

export function setTheme(theme: ThemeMode) {
  applyTheme(theme);
  persistTheme(theme);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(THEME_EVENT));
  }
}

export function subscribeTheme(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      const nextTheme = event.newValue === "light" ? "light" : "dark";
      applyTheme(nextTheme);
      onStoreChange();
    }
  };

  const handleThemeChange = () => {
    onStoreChange();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(THEME_EVENT, handleThemeChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(THEME_EVENT, handleThemeChange);
  };
}

export function useTheme() {
  return useSyncExternalStore<ThemeMode>(subscribeTheme, getThemeSnapshot, () => "dark");
}
