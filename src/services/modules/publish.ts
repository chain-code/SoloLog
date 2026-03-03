const PUBLISH_API_URL = "/api/editor/publish";

export type PublishJobStatus = "running" | "success" | "error" | "conflict";
export type PublishJobStage = "init" | "pull" | "add" | "commit" | "push" | "done";
export type PublishLogLevel = "command" | "stdout" | "stderr" | "info" | "success" | "error";

export interface PublishLogEntry {
  id: number;
  time: string;
  level: PublishLogLevel;
  text: string;
}

export interface PublishJobSnapshot {
  id: string;
  status: PublishJobStatus;
  stage: PublishJobStage;
  startedAt: string;
  updatedAt: string;
  logs: PublishLogEntry[];
  conflictFiles: string[];
  message?: string;
  commitMessage?: string;
}

export class PublishRunningError extends Error {
  jobId: string;

  constructor(message: string, jobId: string) {
    super(message);
    this.name = "PublishRunningError";
    this.jobId = jobId;
  }
}

export async function startPublishDocumentRepo(): Promise<{ jobId: string }> {
  const response = await fetch(PUBLISH_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const data = await readJsonResponse(response);
  if (response.status === 409 && data.status === "running") {
    const message =
      typeof data.message === "string" && data.message.trim()
        ? data.message
        : "已有上传任务正在执行。";
    const jobId = typeof data.jobId === "string" ? data.jobId : "";
    throw new PublishRunningError(message, jobId);
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "启动上传任务失败。"));
  }

  if (typeof data.jobId !== "string" || !data.jobId) {
    throw new Error("上传任务启动成功但未返回 jobId。");
  }

  return {
    jobId: data.jobId,
  };
}

export async function fetchPublishJob(jobId: string): Promise<PublishJobSnapshot> {
  const response = await fetch(`${PUBLISH_API_URL}/${encodeURIComponent(jobId)}`, {
    cache: "no-store",
  });
  const data = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "读取上传任务状态失败。"));
  }

  return data as unknown as PublishJobSnapshot;
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const raw = await response.text();
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function getErrorMessage(data: Record<string, unknown>, fallback: string): string {
  return typeof data.message === "string" && data.message.trim() ? data.message : fallback;
}
