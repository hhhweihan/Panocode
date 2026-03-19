"use client";

import { usePathname } from "next/navigation";
import SettingsControl from "@/components/SettingsControl";
import ThemeToggle from "@/components/ThemeToggle";

export default function TopRightControls() {
  const pathname = usePathname();
  const isAnalyzePage = pathname?.startsWith("/analyze") ?? false;

  return (
    <div
      className="fixed z-[100] flex items-center gap-2"
      style={{
        top: `calc(env(safe-area-inset-top, 0px) + ${isAnalyzePage ? "9px" : "12px"})`,
        right: `calc(env(safe-area-inset-right, 0px) + ${isAnalyzePage ? "14px" : "12px"})`,
      }}
    >
      <SettingsControl />
      <ThemeToggle />
    </div>
  );
}
