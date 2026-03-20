import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const runtimeSettings = {
  aiBaseUrl: "https://example.invalid/v1",
  aiApiKey: "test-key",
  aiModel: "test-model",
  githubToken: "",
  maxDrillDepth: 2,
  criticalChildCount: 10,
};

async function createTestArchive() {
  const zip = new JSZip();
  zip.file("demo-app/src/index.ts", "export function main() { return 'ok'; }\n");
  zip.file("demo-app/package.json", '{"name":"demo-app","version":"1.0.0"}\n');

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const archivePath = path.join(os.tmpdir(), `panocode-archive-${Date.now()}.zip`);
  await fs.writeFile(archivePath, zipBuffer);
  return archivePath;
}

async function setupMockedAnalysis(page: import("@playwright/test").Page) {
  await page.addInitScript((settings) => {
    window.localStorage.setItem("panocode-runtime-settings", JSON.stringify(settings));
  }, runtimeSettings);

  await page.route("**/api/settings", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ envSettings: {}, envSources: {} }),
    });
  });

  await page.route("**/api/analyze", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        languages: [{ name: "TypeScript", percentage: 100, color: "#3178c6" }],
        techStack: [{ name: "Next.js", category: "framework" }],
        entryFiles: [],
        summary: "Demo project for archive upload testing.",
      }),
    });
  });
}

test("uploads zip, auto-enters analyze page, and restores after reload", async ({ page }) => {
  const archivePath = await createTestArchive();

  await setupMockedAnalysis(page);

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "打开本地项目" }).click();
    await page.locator('input[type="file"]').setInputFiles(archivePath);

    await expect(page).toHaveURL(/source=local/);
    await expect(page).toHaveURL(/mode=archive/);
    await expect(page).toHaveURL(/archiveKey=/);
    await expect(page.getByText("当前通过浏览器内存中的 ZIP 压缩包读取项目代码。", { exact: false })).toBeVisible();

    await page.reload();

    await expect(page).toHaveURL(/mode=archive/);
    await expect(page).toHaveURL(/archiveKey=/);
    await expect(page.getByText("当前通过浏览器内存中的 ZIP 压缩包读取项目代码。", { exact: false })).toBeVisible();
  } finally {
    await fs.unlink(archivePath).catch(() => undefined);
  }
});

test("supports drag and drop zip upload from local page", async ({ page }) => {
  const archivePath = await createTestArchive();
  const archiveBuffer = await fs.readFile(archivePath);

  await setupMockedAnalysis(page);

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "打开本地项目" }).click();

    const payload = archiveBuffer.toString("base64");
    const dataTransfer = await page.evaluateHandle(({ name, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const file = new File([bytes], name, { type: "application/zip" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      return transfer;
    }, {
      name: path.basename(archivePath),
      base64: payload,
    });

    await page.locator('[data-testid="local-archive-dropzone"]').dispatchEvent("drop", { dataTransfer });

    await expect(page).toHaveURL(/source=local/);
    await expect(page).toHaveURL(/mode=archive/);
    await expect(page).toHaveURL(/archiveKey=/);
    await expect(page.getByText("当前通过浏览器内存中的 ZIP 压缩包读取项目代码。", { exact: false })).toBeVisible();
  } finally {
    await fs.unlink(archivePath).catch(() => undefined);
  }
});