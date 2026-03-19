"use client";

import { Moon, Sun } from "lucide-react";
import { setTheme, useTheme } from "@/lib/theme";

const OPTIONS = [
  {
    value: "light",
    label: "浅",
    ariaLabel: "切换到浅色主题",
    Icon: Sun,
  },
  {
    value: "dark",
    label: "深",
    ariaLabel: "切换到深色主题",
    Icon: Moon,
  },
] as const;

const THUMB_POSITION = {
  light: "translateX(0%)",
  dark: "translateX(calc(100% + 0.25rem))",
} as const;

export default function ThemeToggle() {
  const theme = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="主题切换"
      className="rounded-full border p-1 shadow-lg backdrop-blur-xl select-none"
      style={{
        borderColor: "color-mix(in srgb, var(--border) 92%, transparent)",
        background: "color-mix(in srgb, var(--panel) 88%, transparent)",
        boxShadow: "0 8px 22px color-mix(in srgb, var(--bg) 14%, transparent)",
      }}
    >
      <div className="relative flex items-center gap-1">
        <div
          aria-hidden="true"
          className="absolute left-1 top-1 h-8 w-[calc(50%-0.125rem)] rounded-full border transition-transform duration-300 ease-out"
          style={{
            transform: THUMB_POSITION[theme],
            borderColor: "color-mix(in srgb, var(--accent) 22%, var(--border))",
            background: "linear-gradient(180deg, color-mix(in srgb, var(--panel-2) 92%, white), color-mix(in srgb, var(--panel) 96%, transparent))",
            boxShadow: "0 4px 12px color-mix(in srgb, var(--bg) 12%, transparent)",
          }}
        />
        {OPTIONS.map(({ value, label, ariaLabel, Icon }) => {
          const active = theme === value;

          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={ariaLabel}
              onClick={() => setTheme(value)}
              className="relative flex min-w-[54px] touch-manipulation items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[11px] font-medium transition-colors duration-200"
              style={{
                color: active ? "var(--text)" : "var(--muted)",
                WebkitTapHighlightColor: "transparent",
              }}
              title={ariaLabel}
            >
              <Icon size={12} strokeWidth={2} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}