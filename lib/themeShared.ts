export type ThemeMode = "dark" | "light";

export const THEME_STORAGE_KEY = "panocode-theme-mode";
export const THEME_EVENT = "panocode-theme-change";

export const THEME_INIT_SCRIPT = `(() => {
  const key = "${THEME_STORAGE_KEY}";
  let theme = "dark";
  try {
    const saved = window.localStorage.getItem(key);
    theme = saved === "light" ? "light" : "dark";
  } catch {}
  document.documentElement.dataset.theme = theme;
})();`;