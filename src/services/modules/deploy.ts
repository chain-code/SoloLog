const DEPLOY_API_URL = "/api/editor/deploy";

export type DeployJobStatus = "running" | "success" | "error";
export type DeployJobStage = "init" | "hugo" | "add" | "commit" | "push" | "done";
export type DeployLogLevel = "command" | "stdout" | "stderr" | "info" | "success" | "error";

export interface DeployLogEntry {
  id: number;
  time: string;
  level: DeployLogLevel;
  text: string;
}

export interface DeployJobSnapshot {
  id: string;
  status: DeployJobStatus;
  stage: DeployJobStage;
  startedAt: string;
  updatedAt: string;
  logs: DeployLogEntry[];
  message?: string;
  commitMessage?: string;
}

export class DeployRunningError extends Error {
  jobId: string;

  constructor(message: string, jobId: string) {
    super(message);
    this.name = "DeployRunningError";
    this.jobId = jobId;
  }
}

export async function startDeploySite(): Promise<{ jobId: string }> {
  const response = await fetch(DEPLOY_API_URL, {
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
        : "已有发布任务正在执行。";
    const jobId = typeof data.jobId === "string" ? data.jobId : "";
    throw new DeployRunningError(message, jobId);
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "启动发布任务失败。"));
  }

  if (typeof data.jobId !== "string" || !data.jobId) {
    throw new Error("发布任务启动成功但未返回 jobId。");
  }

  return {
    jobId: data.jobId,
  };
}

export async function fetchDeployJob(jobId: string): Promise<DeployJobSnapshot> {
  const response = await fetch(`${DEPLOY_API_URL}/${encodeURIComponent(jobId)}`, {
    cache: "no-store",
  });
  const data = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "读取发布任务状态失败。"));
  }

  return data as unknown as DeployJobSnapshot;
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const raw = await response.text();
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function getErrorMessage(data: Record<string, unknown>, fallback: string): string {
  return typeof data.message === "string" && data.message.trim() ? data.message : fallback;
}
