"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_RUNTIME_SETTINGS,
  RUNTIME_SETTINGS_EVENT,
  RUNTIME_SETTINGS_STORAGE_KEY,
  finalizeRuntimeSettings,
  sanitizeRuntimeSettingsInput,
  type RuntimeSettings,
  type RuntimeSettingsEnvSources,
  type RuntimeSettingsField,
} from "@/lib/runtimeSettings";

type RuntimeSettingsContextValue = {
  settings: RuntimeSettings;
  envSettings: Partial<RuntimeSettings>;
  envSources: RuntimeSettingsEnvSources;
  hydrated: boolean;
  saveSettings: (nextSettings: Partial<RuntimeSettings>) => void;
  hasEnvOverride: (field: RuntimeSettingsField) => boolean;
};

const RuntimeSettingsContext = createContext<RuntimeSettingsContextValue | null>(null);

function readStoredRuntimeSettings() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(RUNTIME_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    return sanitizeRuntimeSettingsInput(JSON.parse(raw));
  } catch {
    return {};
  }
}

function writeStoredRuntimeSettings(settings: RuntimeSettings) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(RUNTIME_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event(RUNTIME_SETTINGS_EVENT));
  } catch {
    // Ignore storage write failures.
  }
}

export function RuntimeSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<RuntimeSettings>(DEFAULT_RUNTIME_SETTINGS);
  const [envSettings, setEnvSettings] = useState<Partial<RuntimeSettings>>({});
  const [envSources, setEnvSources] = useState<RuntimeSettingsEnvSources>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let disposed = false;

    const sync = async () => {
      const stored = readStoredRuntimeSettings();

      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        const data = await res.json() as {
          envSettings?: Partial<RuntimeSettings>;
          envSources?: RuntimeSettingsEnvSources;
        };

        if (disposed) {
          return;
        }

        const nextEnvSettings = sanitizeRuntimeSettingsInput(data.envSettings ?? {});
        const nextSettings = finalizeRuntimeSettings({
          ...stored,
          ...nextEnvSettings,
        });

        setEnvSettings(nextEnvSettings);
        setEnvSources(data.envSources ?? {});
        setSettings(nextSettings);
        writeStoredRuntimeSettings(nextSettings);
      } catch {
        if (disposed) {
          return;
        }

        setSettings(finalizeRuntimeSettings(stored));
      } finally {
        if (!disposed) {
          setHydrated(true);
        }
      }
    };

    sync();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === RUNTIME_SETTINGS_STORAGE_KEY) {
        const stored = readStoredRuntimeSettings();
        setSettings(finalizeRuntimeSettings({ ...stored, ...envSettings }));
      }
    };

    const handleLocalUpdate = () => {
      const stored = readStoredRuntimeSettings();
      setSettings(finalizeRuntimeSettings({ ...stored, ...envSettings }));
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(RUNTIME_SETTINGS_EVENT, handleLocalUpdate);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(RUNTIME_SETTINGS_EVENT, handleLocalUpdate);
    };
  }, [envSettings]);

  const saveSettings = useCallback((nextSettings: Partial<RuntimeSettings>) => {
    const sanitized = sanitizeRuntimeSettingsInput(nextSettings);
    const merged = finalizeRuntimeSettings({
      ...settings,
      ...sanitized,
      ...envSettings,
    });

    setSettings(merged);
    writeStoredRuntimeSettings(merged);
  }, [envSettings, settings]);

  const hasEnvOverride = useCallback((field: RuntimeSettingsField) => {
    return Object.prototype.hasOwnProperty.call(envSettings, field);
  }, [envSettings]);

  const value = useMemo<RuntimeSettingsContextValue>(() => ({
    settings,
    envSettings,
    envSources,
    hydrated,
    saveSettings,
    hasEnvOverride,
  }), [envSettings, envSources, hasEnvOverride, hydrated, saveSettings, settings]);

  return (
    <RuntimeSettingsContext.Provider value={value}>
      {children}
    </RuntimeSettingsContext.Provider>
  );
}

export function useRuntimeSettings() {
  const value = useContext(RuntimeSettingsContext);

  if (!value) {
    throw new Error("useRuntimeSettings must be used within RuntimeSettingsProvider");
  }

  return value;
}
