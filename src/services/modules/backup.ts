const BACKUP_API_URL = "/api/editor/backup";

export type BackupJobStatus = "running" | "success" | "error";
export type BackupJobStage = "init" | "prepare" | "scan" | "copy" | "done";
export type BackupLogLevel = "command" | "stdout" | "stderr" | "info" | "success" | "error";

export interface BackupLogEntry {
  id: number;
  time: string;
  level: BackupLogLevel;
  text: string;
}

export interface BackupJobSnapshot {
  id: string;
  status: BackupJobStatus;
  stage: BackupJobStage;
  startedAt: string;
  updatedAt: string;
  logs: BackupLogEntry[];
  message?: string;
  snapshotPath?: string;
}

export class BackupRunningError extends Error {
  jobId: string;

  constructor(message: string, jobId: string) {
    super(message);
    this.name = "BackupRunningError";
    this.jobId = jobId;
  }
}

export async function startBackupDocumentRepo(): Promise<{ jobId: string }> {
  const response = await fetch(BACKUP_API_URL, {
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
        : "A backup task is already running.";
    const jobId = typeof data.jobId === "string" ? data.jobId : "";
    throw new BackupRunningError(message, jobId);
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "Failed to start backup task."));
  }

  if (typeof data.jobId !== "string" || !data.jobId) {
    throw new Error("Backup task started but no jobId was returned.");
  }

  return {
    jobId: data.jobId,
  };
}

export async function fetchBackupJob(jobId: string): Promise<BackupJobSnapshot> {
  const response = await fetch(`${BACKUP_API_URL}/${encodeURIComponent(jobId)}`, {
    cache: "no-store",
  });
  const data = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "Failed to load backup task status."));
  }

  return data as unknown as BackupJobSnapshot;
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const raw = await response.text();
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function getErrorMessage(data: Record<string, unknown>, fallback: string): string {
  return typeof data.message === "string" && data.message.trim() ? data.message : fallback;
}
