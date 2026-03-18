"use client";

import { Moon, Sun } from "lucide-react";
import { usePathname } from "next/navigation";
import { setTheme, useTheme } from "@/lib/theme";

const OPTIONS = [
  {
    value: "light",
    label: "浅色",
    ariaLabel: "切换到浅色主题",
    Icon: Sun,
  },
  {
    value: "dark",
    label: "深色",
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
  const pathname = usePathname();
  const isAnalyzePage = pathname?.startsWith("/analyze") ?? false;

  const containerStyle = isAnalyzePage
    ? {
        left: "calc(env(safe-area-inset-left, 0px) + 12px)",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
      }
    : {
        top: "calc(env(safe-area-inset-top, 0px) + 12px)",
        right: "calc(env(safe-area-inset-right, 0px) + 12px)",
      };

  return (
    <div
      role="radiogroup"
      aria-label="主题切换"
      className="fixed z-[100] rounded-full border p-1 shadow-lg backdrop-blur-xl select-none"
      style={{
        ...containerStyle,
        borderColor: "color-mix(in srgb, var(--border) 92%, transparent)",
        background: "color-mix(in srgb, var(--panel) 82%, transparent)",
        boxShadow: "0 10px 32px color-mix(in srgb, var(--bg) 18%, transparent)",
      }}
    >
      <div className="relative flex items-center gap-1">
        <div
          aria-hidden="true"
          className="absolute left-1 top-1 h-10 w-[calc(50%-0.125rem)] rounded-full border transition-transform duration-300 ease-out"
          style={{
            transform: THUMB_POSITION[theme],
            borderColor: "color-mix(in srgb, var(--accent) 22%, var(--border))",
            background: "linear-gradient(180deg, color-mix(in srgb, var(--panel-2) 92%, white), color-mix(in srgb, var(--panel) 96%, transparent))",
            boxShadow: "0 6px 18px color-mix(in srgb, var(--bg) 14%, transparent)",
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
              className="relative flex min-w-[78px] sm:min-w-[92px] touch-manipulation items-center justify-center gap-1.5 sm:gap-2 rounded-full px-2.5 sm:px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors duration-200"
              style={{
                color: active ? "var(--text)" : "var(--muted)",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <Icon size={15} strokeWidth={2} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}