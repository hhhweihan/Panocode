import { NextResponse } from "next/server";
import { getEnvRuntimeSettingsSnapshot } from "@/lib/runtimeSettings";

export async function GET() {
  const { envSettings, envSources } = getEnvRuntimeSettingsSnapshot();

  return NextResponse.json(
    {
      envSettings,
      envSources,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
