const EDITOR_API_ROOT = "/api/editor";

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
