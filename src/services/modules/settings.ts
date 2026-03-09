const SETTINGS_API_ROOT = "/api/editor/settings";

export interface EditorPathSettings {
  documentProjectPath: string;
  chainCodeRepoPath: string;
  backupRootPath: string;
  hugoProjectPath: string;
  docsSourceDir?: string;
  homeIndexFile?: string;
}

export async function fetchEditorPathSettings(): Promise<EditorPathSettings> {
  const response = await fetch(SETTINGS_API_ROOT, {
    cache: "no-store",
  });

  const raw = await response.text();
  const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};

  if (!response.ok) {
    const message =
      typeof data.message === "string" && data.message.trim()
        ? data.message
        : "Failed to load editor settings.";
    throw new Error(message);
  }

  return data as EditorPathSettings;
}

export async function saveEditorPathSettings(payload: {
  documentProjectPath: string;
  chainCodeRepoPath: string;
  backupRootPath: string;
  hugoProjectPath: string;
}): Promise<EditorPathSettings> {
  const response = await fetch(SETTINGS_API_ROOT, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};

  if (!response.ok) {
    const message =
      typeof data.message === "string" && data.message.trim()
        ? data.message
        : "Failed to save editor settings.";
    throw new Error(message);
  }

  return data as EditorPathSettings;
}
