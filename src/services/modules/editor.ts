const EDITOR_API_ROOT = "/api/editor";
const TYPORA_INSTALL_URL = "https://typora.io/#download";

export interface CreateArticlePayload {
  sectionPath: string;
  fileName: string;
  title: string;
}

export interface MoveArticlePayload {
  articlePath: string;
  targetSectionPath: string;
}

interface EditorApiResult {
  message?: string;
  path?: string;
  ok?: boolean;
}

export class TyporaNotInstalledError extends Error {
  installUrl: string;

  constructor(message: string, installUrl = TYPORA_INSTALL_URL) {
    super(message);
    this.name = "TyporaNotInstalledError";
    this.installUrl = installUrl;
  }
}

export async function createArticleInSection(payload: CreateArticlePayload): Promise<string> {
  const result = await requestEditorApi<EditorApiResult>(`${EDITOR_API_ROOT}/article`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!result.path) {
    throw new Error("Article created but no path was returned.");
  }

  return result.path;
}

export async function saveArticleMarkdown(articlePath: string, content: string): Promise<void> {
  await requestEditorApi<EditorApiResult>(`${EDITOR_API_ROOT}/article`, {
    method: "PUT",
    body: JSON.stringify({
      articlePath,
      content,
    }),
  });
}

export async function moveArticleToSection(payload: MoveArticlePayload): Promise<string> {
  const result = await requestEditorApi<EditorApiResult>(`${EDITOR_API_ROOT}/article/move`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!result.path) {
    throw new Error("Article moved but no new path was returned.");
  }

  return result.path;
}

export async function deleteArticleByPath(articlePath: string): Promise<void> {
  await requestEditorApi<EditorApiResult>(`${EDITOR_API_ROOT}/article/delete`, {
    method: "POST",
    body: JSON.stringify({ articlePath }),
  });
}

export async function openArticleInTypora(articlePath: string): Promise<{ ok: boolean; message?: string }> {
  const response = await fetch(`${EDITOR_API_ROOT}/typora/open`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ articlePath }),
  });

  const rawText = await response.text();
  const data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};

  if (response.status === 412) {
    const message =
      typeof data.message === "string" && data.message.trim()
        ? data.message
        : `Typora is not installed. Please install it first: ${TYPORA_INSTALL_URL}`;
    throw new TyporaNotInstalledError(message);
  }

  if (!response.ok) {
    const message =
      typeof data.message === "string" && data.message.trim()
        ? data.message
        : "Failed to open article in Typora.";
    throw new Error(message);
  }

  return {
    ok: true,
    message: typeof data.message === "string" ? data.message : undefined,
  };
}

async function requestEditorApi<T>(url: string, options: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const rawText = await response.text();
  const data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};

  if (!response.ok) {
    const message =
      typeof data.message === "string" && data.message.trim()
        ? data.message
        : "Editor operation failed.";
    throw new Error(message);
  }

  return data as T;
}
