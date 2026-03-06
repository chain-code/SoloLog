import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { promises as fs } from "node:fs";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const publicContentRoot = path.resolve(projectRoot, "public", "content");
const generateContentScript = fileURLToPath(new URL("./scripts/generate-content.mjs", import.meta.url));
const settingsFile = path.resolve(projectRoot, ".sololog-paths.json");
const defaultDocumentProjectPath =
  process.env.DOCUMENT_PROJECT_PATH ??
  path.resolve(
    process.env.DOCS_SOURCE_DIR
      ? path.join(process.env.DOCS_SOURCE_DIR, "..")
      : "C:/Users/tianzhiwei/Desktop/document",
  );
const defaultChainCodeRepoPath =
  process.env.CHAIN_CODE_REPO_PATH ?? "C:/Users/tianzhiwei/go/src/chain-code.github.io";
const defaultBackupRootPath = process.env.BACKUP_ROOT_PATH ?? "";
const TYPORA_DOWNLOAD_URL = "https://typora.io/#download";
const execFileAsync = promisify(execFile);

interface EditorPathSettings {
  documentProjectPath: string;
  chainCodeRepoPath: string;
  backupRootPath: string;
}

let runtimePathSettings: EditorPathSettings = {
  documentProjectPath: defaultDocumentProjectPath,
  chainCodeRepoPath: defaultChainCodeRepoPath,
  backupRootPath: defaultBackupRootPath,
};

type PublishJobStatus = "running" | "success" | "error" | "conflict";
type PublishJobStage = "init" | "pull" | "add" | "commit" | "push" | "done";
type PublishLogLevel = "command" | "stdout" | "stderr" | "info" | "success" | "error";

interface PublishLogEntry {
  id: number;
  time: string;
  level: PublishLogLevel;
  text: string;
}

interface PublishJob {
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

type BackupJobStatus = "running" | "success" | "error";
type BackupJobStage = "init" | "prepare" | "scan" | "copy" | "done";

interface BackupJob {
  id: string;
  status: BackupJobStatus;
  stage: BackupJobStage;
  startedAt: string;
  updatedAt: string;
  logs: PublishLogEntry[];
  message?: string;
  snapshotPath?: string;
}

const publishJobs = new Map<string, PublishJob>();
let activePublishJobId: string | null = null;
const backupJobs = new Map<string, BackupJob>();
let activeBackupJobId: string | null = null;
let publishLogSequence = 1;

const ARTICLE_TEMPLATE = [
  "---",
  'title: "__TITLE__"',
  "weight: 1",
  "# bookFlatSection: false",
  "# bookToc: true",
  "# bookHidden: false",
  "# bookCollapseSection: false",
  "# bookComments: false",
  "# bookSearchExclude: false",
  "---",
  "",
  "",
].join("\n");

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface RuntimeContentPaths {
  documentProjectPath: string;
  chainCodeRepoPath: string;
  docsSourceDir: string;
  homeIndexFile: string;
}

function resolveRuntimeContentPaths(settings: EditorPathSettings = runtimePathSettings): RuntimeContentPaths {
  const documentProjectPath = path.resolve(settings.documentProjectPath);
  const chainCodeRepoPath = path.resolve(settings.chainCodeRepoPath);
  return {
    documentProjectPath,
    chainCodeRepoPath,
    docsSourceDir: path.resolve(documentProjectPath, "docs"),
    homeIndexFile: path.resolve(documentProjectPath, "_index.md"),
  };
}

async function initializeRuntimePathSettings() {
  runtimePathSettings = await loadPathSettingsFromDisk();
}

async function loadPathSettingsFromDisk(): Promise<EditorPathSettings> {
  try {
    const raw = await fs.readFile(settingsFile, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const nextSettings: EditorPathSettings = {
      documentProjectPath:
        typeof parsed.documentProjectPath === "string" && parsed.documentProjectPath.trim()
          ? parsed.documentProjectPath.trim()
          : defaultDocumentProjectPath,
      chainCodeRepoPath:
        typeof parsed.chainCodeRepoPath === "string" && parsed.chainCodeRepoPath.trim()
          ? parsed.chainCodeRepoPath.trim()
          : defaultChainCodeRepoPath,
      backupRootPath:
        typeof parsed.backupRootPath === "string" && parsed.backupRootPath.trim()
          ? parsed.backupRootPath.trim()
          : defaultBackupRootPath,
    };
    return nextSettings;
  } catch {
    return {
      documentProjectPath: defaultDocumentProjectPath,
      chainCodeRepoPath: defaultChainCodeRepoPath,
      backupRootPath: defaultBackupRootPath,
    };
  }
}

async function savePathSettingsToDisk(settings: EditorPathSettings) {
  await fs.writeFile(settingsFile, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function normalizePathSettingsPayload(payload: Record<string, unknown>): EditorPathSettings {
  const documentProjectPath = toRequiredString(payload.documentProjectPath, "documentProjectPath").trim();
  const chainCodeRepoPath = toRequiredString(payload.chainCodeRepoPath, "chainCodeRepoPath").trim();
  const backupRootPath = toOptionalString(payload.backupRootPath).trim();

  if (!documentProjectPath) {
    throw new ApiError(400, "documentProjectPath is required.");
  }
  if (!chainCodeRepoPath) {
    throw new ApiError(400, "chainCodeRepoPath is required.");
  }

  return {
    documentProjectPath,
    chainCodeRepoPath,
    backupRootPath,
  };
}

async function assertPathSettingsValid(settings: EditorPathSettings) {
  const runtimePaths = resolveRuntimeContentPaths(settings);
  await assertDirectoryExists(runtimePaths.documentProjectPath, "Content repository path");
  await assertDirectoryExists(runtimePaths.docsSourceDir, "Content docs path");
  await assertFileExists(runtimePaths.homeIndexFile, "Content home _index.md");
  await assertDirectoryExists(runtimePaths.chainCodeRepoPath, "Deploy repository path");
  if (settings.backupRootPath.trim()) {
    await ensureDirectoryExists(path.resolve(settings.backupRootPath), "Backup root path");
  }
}

function toPathSettingsResponse(settings: EditorPathSettings) {
  const runtimePaths = resolveRuntimeContentPaths(settings);
  const backupRootPath = settings.backupRootPath.trim()
    ? path.resolve(settings.backupRootPath.trim())
    : "";
  return {
    documentProjectPath: runtimePaths.documentProjectPath,
    chainCodeRepoPath: runtimePaths.chainCodeRepoPath,
    backupRootPath,
    docsSourceDir: runtimePaths.docsSourceDir,
    homeIndexFile: runtimePaths.homeIndexFile,
  };
}

function createEditorApiPlugin() {
  return {
    name: "sololog-editor-api",
    configureServer(server) {
      let settingsInitialized = false;
      server.middlewares.use(
        async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
          const reqUrl = request.url ?? "/";
          try {
            if (!settingsInitialized) {
              await initializeRuntimePathSettings();
              settingsInitialized = true;
            }

            const url = new URL(reqUrl, "http://localhost");
            const pathname = url.pathname;
            const method = (request.method ?? "GET").toUpperCase();

            const decodedPathname = safelyDecodePathname(pathname);
            if (method === "GET" && decodedPathname.startsWith("/content/") && decodedPathname.endsWith(".md")) {
              const relativeFilePath = decodedPathname.slice("/content/".length);
              const absoluteFilePath = resolveUnderRoot(publicContentRoot, relativeFilePath);
              if (await isFile(absoluteFilePath)) {
                const markdownContent = await fs.readFile(absoluteFilePath, "utf8");
                response.statusCode = 200;
                response.setHeader("Content-Type", "text/markdown; charset=utf-8");
                response.end(markdownContent);
                return;
              }
            }

            if (!pathname.startsWith("/api/editor")) {
              next();
              return;
            }

            if (method === "GET" && pathname === "/api/editor/settings") {
              sendJson(response, 200, toPathSettingsResponse(runtimePathSettings));
              return;
            }

            if (method === "PUT" && pathname === "/api/editor/settings") {
              const payload = await readJsonBody(request);
              const nextSettings = normalizePathSettingsPayload(payload);
              await assertPathSettingsValid(nextSettings);

              runtimePathSettings = nextSettings;
              await savePathSettingsToDisk(nextSettings);
              await regenerateContent();

              sendJson(response, 200, toPathSettingsResponse(nextSettings));
              return;
            }

            if (method === "POST" && pathname === "/api/editor/publish") {
              if (activePublishJobId) {
                sendJson(response, 409, {
                  status: "running",
                  message: "已有上传任务正在执行。",
                  jobId: activePublishJobId,
                });
                return;
              }

              const job = createPublishJob();
              activePublishJobId = job.id;
              void executePublishJob(job).finally(() => {
                if (activePublishJobId === job.id) {
                  activePublishJobId = null;
                }
              });

              sendJson(response, 202, {
                status: "running",
                jobId: job.id,
              });
              return;
            }

            if (method === "GET" && pathname.startsWith("/api/editor/publish/")) {
              const jobId = pathname.slice("/api/editor/publish/".length).trim();
              if (!jobId) {
                throw new ApiError(400, "jobId is required.");
              }

              const job = publishJobs.get(jobId);
              if (!job) {
                throw new ApiError(404, "Publish job not found.");
              }

              sendJson(response, 200, toPublishJobResponse(job));
              return;
            }

            if (method === "POST" && pathname === "/api/editor/backup") {
              if (activeBackupJobId) {
                sendJson(response, 409, {
                  status: "running",
                  message: "已有备份任务正在执行。",
                  jobId: activeBackupJobId,
                });
                return;
              }

              const job = createBackupJob();
              activeBackupJobId = job.id;
              void executeBackupJob(job).finally(() => {
                if (activeBackupJobId === job.id) {
                  activeBackupJobId = null;
                }
              });

              sendJson(response, 202, {
                status: "running",
                jobId: job.id,
              });
              return;
            }

            if (method === "GET" && pathname.startsWith("/api/editor/backup/")) {
              const jobId = pathname.slice("/api/editor/backup/".length).trim();
              if (!jobId) {
                throw new ApiError(400, "jobId is required.");
              }

              const job = backupJobs.get(jobId);
              if (!job) {
                throw new ApiError(404, "Backup job not found.");
              }

              sendJson(response, 200, toBackupJobResponse(job));
              return;
            }

            if (method === "POST" && pathname === "/api/editor/typora/open") {
              const payload = await readJsonBody(request);
              const articlePath = toSafeRelativePath(payload.articlePath, "articlePath");
              assertMarkdownArticlePath(articlePath);

              const articleAbsPath = resolveDocsPath(articlePath);
              await assertFileExists(articleAbsPath, "Article");
              await openArticleInTyporaExternal(articleAbsPath);

              sendJson(response, 200, {
                ok: true,
                message: `宸插湪 Typora 鎵撳紑锛?{articlePath}`,
              });
              return;
            }

            if (method === "POST" && pathname === "/api/editor/article") {
              const payload = await readJsonBody(request);
              const sectionPath = toSafeRelativePath(payload.sectionPath, "sectionPath");
              const sectionAbsPath = resolveDocsPath(sectionPath);
              await assertDirectoryExists(sectionAbsPath, "Section");

              const fileName = toSafeFileName(payload.fileName);
              const title = toSafeTitle(payload.title, stripMarkdownExtension(fileName));
              const articlePath = toPosix(sectionPath, fileName);
              assertMarkdownArticlePath(articlePath);

              const articleAbsPath = resolveDocsPath(articlePath);
              if (await exists(articleAbsPath)) {
                throw new ApiError(409, "Article already exists.");
              }

              await fs.writeFile(articleAbsPath, buildArticleTemplate(title), "utf8");
              await regenerateContent();
              sendJson(response, 200, { path: articlePath });
              return;
            }

            if (method === "PUT" && pathname === "/api/editor/article") {
              const payload = await readJsonBody(request);
              const articlePath = toSafeRelativePath(payload.articlePath, "articlePath");
              assertMarkdownArticlePath(articlePath);

              if (path.posix.basename(articlePath).toLowerCase() === "_index.md") {
                throw new ApiError(400, "Editing _index.md in editor mode is not supported.");
              }

              const content = toRequiredString(payload.content, "content");
              const articleAbsPath = resolveDocsPath(articlePath);
              await assertFileExists(articleAbsPath, "Article");

              await fs.writeFile(articleAbsPath, content, "utf8");
              await regenerateContent();
              sendJson(response, 200, { ok: true });
              return;
            }

            if (method === "POST" && pathname === "/api/editor/article/move") {
              const payload = await readJsonBody(request);
              const articlePath = toSafeRelativePath(payload.articlePath, "articlePath");
              assertMarkdownArticlePath(articlePath);

              const targetSectionPath = toSafeRelativePath(
                payload.targetSectionPath,
                "targetSectionPath",
              );
              const targetSectionAbsPath = resolveDocsPath(targetSectionPath);
              await assertDirectoryExists(targetSectionAbsPath, "Target section");

              const sourceArticleAbsPath = resolveDocsPath(articlePath);
              await assertFileExists(sourceArticleAbsPath, "Article");

              const targetArticlePath = toPosix(targetSectionPath, path.posix.basename(articlePath));
              if (targetArticlePath === articlePath) {
                sendJson(response, 200, { path: articlePath });
                return;
              }

              const targetArticleAbsPath = resolveDocsPath(targetArticlePath);
              if (await exists(targetArticleAbsPath)) {
                throw new ApiError(409, "Target section already has an article with the same file name.");
              }

              await fs.rename(sourceArticleAbsPath, targetArticleAbsPath);
              await regenerateContent();
              sendJson(response, 200, { path: targetArticlePath });
              return;
            }

            if (method === "POST" && pathname === "/api/editor/article/delete") {
              const payload = await readJsonBody(request);
              const articlePath = toSafeRelativePath(payload.articlePath, "articlePath");
              assertMarkdownArticlePath(articlePath);

              const articleAbsPath = resolveDocsPath(articlePath);
              await assertFileExists(articleAbsPath, "Article");
              await fs.unlink(articleAbsPath);
              await regenerateContent();
              sendJson(response, 200, { ok: true });
              return;
            }

            sendJson(response, 404, { message: "Editor API endpoint not found." });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Editor API failure.";
            const status = error instanceof ApiError ? error.status : 500;
            sendJson(response, status, { message });
          }
        },
      );
    },
  };
}

async function regenerateContent() {
  const runtimePaths = resolveRuntimeContentPaths();
  await execFileAsync(process.execPath, [generateContentScript], {
    cwd: projectRoot,
    env: {
      ...process.env,
      DOCS_SOURCE_DIR: runtimePaths.docsSourceDir,
      HOME_INDEX_FILE: runtimePaths.homeIndexFile,
    },
  });
}

function toSafeRelativePath(value: unknown, fieldName: string, allowEmpty = false) {
  if (typeof value !== "string") {
    throw new ApiError(400, `${fieldName} is required.`);
  }

  const normalized = value
    .replace(/\\/g, "/")
    .trim()
    .replace(/^\/+/, "");

  if (!normalized) {
    if (allowEmpty) {
      return "";
    }
    throw new ApiError(400, `${fieldName} is required.`);
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new ApiError(400, `Invalid ${fieldName}.`);
  }

  return segments.join("/");
}

function toRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string") {
    throw new ApiError(400, `${fieldName} is required.`);
  }

  return value;
}

function toOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value;
}

function toSafeTitle(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const title = value.trim();
  return title || fallback;
}

function toSafeFileName(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, "fileName is required.");
  }

  const withoutExt = value.trim().replace(/\.md$/i, "");
  const normalized = withoutExt
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .replace(/[. ]+$/g, "");

  if (!normalized) {
    throw new ApiError(400, "Invalid fileName.");
  }

  return `${normalized}.md`;
}

function stripMarkdownExtension(fileName: string) {
  return fileName.replace(/\.md$/i, "");
}

function buildArticleTemplate(title: string) {
  return ARTICLE_TEMPLATE.replace("__TITLE__", escapeYamlString(title));
}

function escapeYamlString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function assertMarkdownArticlePath(relativePath: string) {
  if (!relativePath.toLowerCase().endsWith(".md")) {
    throw new ApiError(400, "Only markdown files are supported.");
  }
}

function resolveDocsPath(relativePath: string) {
  return resolveUnderRoot(resolveRuntimeContentPaths().docsSourceDir, relativePath);
}

function createPublishJob(): PublishJob {
  const now = new Date().toISOString();
  const job: PublishJob = {
    id: `publish-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: "running",
    stage: "init",
    startedAt: now,
    updatedAt: now,
    logs: [],
    conflictFiles: [],
  };
  publishJobs.set(job.id, job);
  cleanupPublishJobs();
  appendPublishLog(job, "info", "开始执行文档上传任务。");
  return job;
}

function toPublishJobResponse(job: PublishJob) {
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    logs: job.logs,
    conflictFiles: job.conflictFiles,
    message: job.message,
    commitMessage: job.commitMessage,
  };
}

function appendPublishLog(job: PublishJob, level: PublishLogLevel, text: string) {
  const entry: PublishLogEntry = {
    id: publishLogSequence++,
    time: new Date().toISOString(),
    level,
    text,
  };
  job.logs.push(entry);
  if (job.logs.length > 600) {
    job.logs.splice(0, job.logs.length - 600);
  }
  job.updatedAt = entry.time;
}

function updatePublishJob(job: PublishJob, patch: Partial<PublishJob>) {
  Object.assign(job, patch);
  job.updatedAt = new Date().toISOString();
}

function cleanupPublishJobs() {
  if (publishJobs.size <= 30) {
    return;
  }

  const sorted = [...publishJobs.values()].sort((left, right) =>
    left.startedAt.localeCompare(right.startedAt),
  );
  const removable = sorted.filter((job) => job.status !== "running").slice(
    0,
    Math.max(0, sorted.length - 30),
  );
  removable.forEach((job) => publishJobs.delete(job.id));
}

async function executePublishJob(job: PublishJob) {
  try {
    const runtimePaths = resolveRuntimeContentPaths();
    const repositoryPath = runtimePaths.documentProjectPath;

    appendPublishLog(job, "info", `目标仓库：${repositoryPath}`);
    await assertDirectoryExists(repositoryPath, "Document project path");
    await assertGitRepository(repositoryPath);

    updatePublishJob(job, { stage: "pull" });
    const pullResult = await runGitCommandWithLogs(job, ["pull"], repositoryPath);
    if (!pullResult.ok) {
      const conflictFiles = await listGitConflictFiles(repositoryPath);
      if (conflictFiles.length > 0) {
        updatePublishJob(job, {
          status: "conflict",
          stage: "done",
          conflictFiles,
          message: "git pull 出现冲突，请先解决冲突后再上传。",
        });
        appendPublishLog(job, "error", "检测到合并冲突。");
        return;
      }

      throw new ApiError(500, formatGitCommandError("git pull", pullResult));
    }

    const hasWorkingChanges = await hasGitWorkingChanges(repositoryPath);
    if (!hasWorkingChanges) {
      updatePublishJob(job, {
        status: "success",
        stage: "done",
        message: "git pull 完成后未检测到仓库变更，任务已结束。",
      });
      appendPublishLog(job, "info", "未检测到仓库修改，跳过 git add / commit / push。");
      appendPublishLog(job, "success", job.message);
      return;
    }

    updatePublishJob(job, { stage: "add" });
    const addResult = await runGitCommandWithLogs(job, ["add", "."], repositoryPath);
    if (!addResult.ok) {
      throw new ApiError(500, formatGitCommandError("git add .", addResult));
    }

    const hasStagedChanges = await hasGitStagedChanges(repositoryPath);
    const commitMessage = `docs: update ${getCurrentDateTimeLabel()}`;
    if (hasStagedChanges) {
      updatePublishJob(job, { stage: "commit", commitMessage });
      const commitResult = await runGitCommandWithLogs(
        job,
        ["commit", "-m", commitMessage],
        repositoryPath,
      );
      if (!commitResult.ok) {
        throw new ApiError(500, formatGitCommandError("git commit", commitResult));
      }
    } else {
      appendPublishLog(job, "info", "未检测到暂存变更，跳过 git commit。");
    }

    updatePublishJob(job, { stage: "push" });
    const pushResult = await runGitCommandWithLogs(job, ["push"], repositoryPath);
    if (!pushResult.ok) {
      throw new ApiError(500, formatGitCommandError("git push", pushResult));
    }

    updatePublishJob(job, {
      status: "success",
      stage: "done",
      message: hasStagedChanges
        ? `上传完成：${commitMessage}`
        : "仓库没有新增变更，已完成 pull/push。",
    });
    appendPublishLog(job, "success", job.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传任务执行失败。";
    updatePublishJob(job, {
      status: "error",
      stage: "done",
      message,
    });
    appendPublishLog(job, "error", message);
  }
}

function createBackupJob(): BackupJob {
  const now = new Date().toISOString();
  const job: BackupJob = {
    id: `backup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: "running",
    stage: "init",
    startedAt: now,
    updatedAt: now,
    logs: [],
  };
  backupJobs.set(job.id, job);
  cleanupBackupJobs();
  appendBackupLog(job, "info", "开始执行内容仓库备份任务。");
  return job;
}

function toBackupJobResponse(job: BackupJob) {
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    logs: job.logs,
    message: job.message,
    snapshotPath: job.snapshotPath,
  };
}

function appendBackupLog(job: BackupJob, level: PublishLogLevel, text: string) {
  const entry: PublishLogEntry = {
    id: publishLogSequence++,
    time: new Date().toISOString(),
    level,
    text,
  };
  job.logs.push(entry);
  if (job.logs.length > 600) {
    job.logs.splice(0, job.logs.length - 600);
  }
  job.updatedAt = entry.time;
}

function updateBackupJob(job: BackupJob, patch: Partial<BackupJob>) {
  Object.assign(job, patch);
  job.updatedAt = new Date().toISOString();
}

function cleanupBackupJobs() {
  if (backupJobs.size <= 30) {
    return;
  }

  const sorted = [...backupJobs.values()].sort((left, right) =>
    left.startedAt.localeCompare(right.startedAt),
  );
  const removable = sorted.filter((job) => job.status !== "running").slice(
    0,
    Math.max(0, sorted.length - 30),
  );
  removable.forEach((job) => backupJobs.delete(job.id));
}

async function executeBackupJob(job: BackupJob) {
  try {
    const runtimePaths = resolveRuntimeContentPaths();
    const sourceRepoPath = runtimePaths.documentProjectPath;
    const backupRootPath = resolveBackupRootPath();

    updateBackupJob(job, { stage: "prepare" });
    await assertDirectoryExists(sourceRepoPath, "Content repository path");
    await ensureDirectoryExists(backupRootPath, "Backup root path");
    appendBackupLog(job, "info", `源仓库：${sourceRepoPath}`);
    appendBackupLog(job, "info", `备份根路径：${backupRootPath}`);

    const snapshotFolderName = formatBackupFolderTimestamp();
    let snapshotPath = path.resolve(backupRootPath, snapshotFolderName);
    if (await exists(snapshotPath)) {
      let suffix = 1;
      while (await exists(path.resolve(backupRootPath, `${snapshotFolderName}-${String(suffix).padStart(2, "0")}`))) {
        suffix += 1;
      }
      snapshotPath = path.resolve(backupRootPath, `${snapshotFolderName}-${String(suffix).padStart(2, "0")}`);
    }
    await ensureDirectoryExists(snapshotPath, "Backup snapshot directory");
    appendBackupLog(job, "success", `已创建备份目录：${snapshotPath}`);

    updateBackupJob(job, { stage: "scan" });
    const scanResult = await collectBackupItems(sourceRepoPath);
    appendBackupLog(
      job,
      "info",
      `扫描完成：${scanResult.directoryCount} 个目录，${scanResult.fileCount} 个文件，总大小约 ${scanResult.totalBytes} 字节。`,
    );

    updateBackupJob(job, { stage: "copy" });
    let copiedFiles = 0;
    let copiedBytes = 0;
    for (const item of scanResult.items) {
      const destinationPath = path.resolve(snapshotPath, item.relativePath);
      if (item.isDirectory) {
        await ensureDirectoryExists(destinationPath, "Backup directory");
        continue;
      }

      await ensureDirectoryExists(path.dirname(destinationPath), "Backup parent directory");
      await fs.copyFile(item.sourcePath, destinationPath);
      copiedFiles += 1;
      copiedBytes += item.size;

      if (copiedFiles === 1 || copiedFiles % 25 === 0 || copiedFiles === scanResult.fileCount) {
        appendBackupLog(
          job,
          "stdout",
          `已复制 ${copiedFiles}/${scanResult.fileCount} 个文件（${copiedBytes} 字节）。`,
        );
      }
    }

    updateBackupJob(job, {
      status: "success",
      stage: "done",
      message: "备份完成。",
      snapshotPath,
    });
    appendBackupLog(
      job,
      "success",
      `备份完成：${copiedFiles} 个文件，${copiedBytes} 字节。输出目录：${snapshotPath}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "备份任务执行失败。";
    updateBackupJob(job, {
      status: "error",
      stage: "done",
      message,
    });
    appendBackupLog(job, "error", message);
  }
}

interface BackupCopyItem {
  sourcePath: string;
  relativePath: string;
  isDirectory: boolean;
  size: number;
}

async function collectBackupItems(sourceRootPath: string) {
  const items: BackupCopyItem[] = [];
  let fileCount = 0;
  let directoryCount = 0;
  let totalBytes = 0;

  async function walk(currentAbsolutePath: string, relativeBase = ""): Promise<void> {
    const entries = await fs.readdir(currentAbsolutePath, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const entryAbsolutePath = path.resolve(currentAbsolutePath, entry.name);
      const entryRelativePath = relativeBase
        ? path.posix.join(relativeBase, entry.name)
        : entry.name;

      if (entry.isDirectory()) {
        directoryCount += 1;
        items.push({
          sourcePath: entryAbsolutePath,
          relativePath: entryRelativePath,
          isDirectory: true,
          size: 0,
        });
        await walk(entryAbsolutePath, entryRelativePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const stat = await fs.stat(entryAbsolutePath);
      const size = stat.size ?? 0;
      fileCount += 1;
      totalBytes += size;
      items.push({
        sourcePath: entryAbsolutePath,
        relativePath: entryRelativePath,
        isDirectory: false,
        size,
      });
    }
  }

  await walk(sourceRootPath);
  return { items, fileCount, directoryCount, totalBytes };
}

function resolveBackupRootPath() {
  const backupRootPath = runtimePathSettings.backupRootPath.trim();
  if (!backupRootPath) {
    throw new ApiError(400, "Backup root path is not configured. Please set it in settings first.");
  }
  return path.resolve(backupRootPath);
}

function formatBackupFolderTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");
  return `${year}年${month}月${day}日${hour}时${minute}分${second}秒-备份`;
}

async function openArticleInTyporaExternal(articleAbsolutePath: string) {
  if (process.platform === "win32") {
    const launchErrors: string[] = [];
    const candidates = await collectWindowsTyporaCandidates();
    for (const candidate of candidates) {
      if (!(await isFile(candidate))) {
        continue;
      }
      try {
        await spawnDetachedProcess(candidate, [articleAbsolutePath]);
        return;
      } catch (error) {
        launchErrors.push(`${candidate}: ${formatUnknownError(error)}`);
      }
    }

    try {
      await spawnDetachedProcess("typora.exe", [articleAbsolutePath]);
      return;
    } catch (error) {
      if (!isCommandNotFoundError(error)) {
        launchErrors.push(`typora.exe: ${formatUnknownError(error)}`);
      }
    }

    try {
      await launchTyporaViaCmdStart(articleAbsolutePath);
      return;
    } catch (error) {
      launchErrors.push(`cmd-start: ${formatUnknownError(error)}`);
    }

    if (launchErrors.length > 0) {
      throw new ApiError(500, `Failed to launch Typora: ${launchErrors.join(" | ")}`);
    }
    throw new ApiError(412, `未检测到 Typora，请先安装：${TYPORA_DOWNLOAD_URL}`);
  }

  if (process.platform === "darwin") {
    try {
      await spawnDetachedProcess("open", ["-a", "Typora", articleAbsolutePath]);
      return;
    } catch (error) {
      if (isCommandNotFoundError(error)) {
        throw new ApiError(412, `未检测到 Typora，请先安装：${TYPORA_DOWNLOAD_URL}`);
      }
      throw new ApiError(500, `Failed to launch Typora: ${formatUnknownError(error)}`);
    }
  }

  try {
    await spawnDetachedProcess("typora", [articleAbsolutePath]);
  } catch (error) {
    if (isCommandNotFoundError(error)) {
      throw new ApiError(412, `未检测到 Typora，请先安装：${TYPORA_DOWNLOAD_URL}`);
    }
    throw new ApiError(500, `Failed to launch Typora: ${formatUnknownError(error)}`);
  }
}

async function collectWindowsTyporaCandidates() {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const pushCandidate = (candidate: string) => {
    const trimmed = candidate.trim().replace(/^"+|"+$/g, "");
    if (!trimmed) {
      return;
    }
    const dedupeKey = trimmed.toLowerCase();
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    candidates.push(trimmed);
  };

  if (process.env.LOCALAPPDATA) {
    pushCandidate(path.join(process.env.LOCALAPPDATA, "Programs", "Typora", "Typora.exe"));
    pushCandidate(path.join(process.env.LOCALAPPDATA, "Typora", "Typora.exe"));
  }
  if (process.env.USERPROFILE) {
    pushCandidate(path.join(process.env.USERPROFILE, "AppData", "Local", "Programs", "Typora", "Typora.exe"));
    pushCandidate(path.join(process.env.USERPROFILE, "AppData", "Local", "Typora", "Typora.exe"));
  }
  if (process.env.ProgramFiles) {
    pushCandidate(path.join(process.env.ProgramFiles, "Typora", "Typora.exe"));
  }
  if (process.env["ProgramFiles(x86)"]) {
    pushCandidate(path.join(process.env["ProgramFiles(x86)"], "Typora", "Typora.exe"));
  }

  for (const wherePath of await queryTyporaPathFromWhere()) {
    pushCandidate(wherePath);
  }
  for (const registryPath of await queryTyporaPathFromRegistry()) {
    pushCandidate(registryPath);
  }

  return candidates;
}

async function queryTyporaPathFromWhere() {
  try {
    const { stdout } = await execFileAsync("where.exe", ["typora.exe"], {
      windowsHide: true,
      env: process.env,
    });
    return stdout
      .toString()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function queryTyporaPathFromRegistry() {
  const keys = [
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Typora.exe",
    "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Typora.exe",
    "HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Typora.exe",
  ];

  const results: string[] = [];
  for (const key of keys) {
    try {
      const { stdout } = await execFileAsync("reg", ["query", key, "/ve"], {
        windowsHide: true,
        env: process.env,
      });
      for (const line of stdout.toString().split(/\r?\n/)) {
        const index = line.indexOf("REG_SZ");
        if (index < 0) {
          continue;
        }
        const value = line
          .slice(index + "REG_SZ".length)
          .trim()
          .replace(/^"+|"+$/g, "");
        if (value) {
          results.push(value);
        }
      }
    } catch {
      continue;
    }
  }

  return results;
}

async function spawnDetachedProcess(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      shell: false,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

async function launchTyporaViaCmdStart(articleAbsolutePath: string) {
  await execFileAsync(
    "cmd.exe",
    ["/d", "/s", "/c", "start", "", "typora.exe", articleAbsolutePath],
    {
      windowsHide: true,
      env: process.env,
    },
  );
}

function isCommandNotFoundError(error: unknown) {
  const maybeError = error as NodeJS.ErrnoException;
  return maybeError?.code === "ENOENT";
}

function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function resolveUnderRoot(rootPath: string, relativePath: string) {
  const absolutePath = path.resolve(rootPath, relativePath);
  const normalizedRoot = path.normalize(rootPath).toLowerCase();
  const normalizedTarget = path.normalize(absolutePath).toLowerCase();
  const rootPrefix = `${normalizedRoot}${path.sep}`.toLowerCase();

  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(rootPrefix)) {
    throw new ApiError(400, "Path is outside docs root.");
  }

  return absolutePath;
}

async function assertDirectoryExists(targetPath: string, label: string) {
  let stats;
  try {
    stats = await fs.stat(targetPath);
  } catch {
    throw new ApiError(404, `${label} does not exist.`);
  }

  if (!stats.isDirectory()) {
    throw new ApiError(400, `${label} is not a directory.`);
  }
}

async function ensureDirectoryExists(targetPath: string, label: string) {
  await fs.mkdir(targetPath, { recursive: true });
  await assertDirectoryExists(targetPath, label);
}

async function assertFileExists(targetPath: string, label: string) {
  let stats;
  try {
    stats = await fs.stat(targetPath);
  } catch {
    throw new ApiError(404, `${label} does not exist.`);
  }

  if (!stats.isFile()) {
    throw new ApiError(400, `${label} is not a file.`);
  }
}

async function exists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isFile(targetPath: string) {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isFile();
  } catch {
    return false;
  }
}

interface CommandRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

async function runGitCommand(args: string[], cwd: string): Promise<CommandRunResult> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      env: process.env,
      windowsHide: true,
    });
    return {
      ok: true,
      stdout: (stdout ?? "").toString().trim(),
      stderr: (stderr ?? "").toString().trim(),
      code: 0,
    };
  } catch (error) {
    const maybeExecError = error as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      code?: number | null;
    };
    return {
      ok: false,
      stdout: (maybeExecError.stdout ?? "").toString().trim(),
      stderr: (maybeExecError.stderr ?? "").toString().trim(),
      code: typeof maybeExecError.code === "number" ? maybeExecError.code : null,
    };
  }
}

async function runGitCommandWithLogs(
  job: PublishJob,
  args: string[],
  cwd: string,
): Promise<CommandRunResult> {
  const commandText = `git ${args.join(" ")}`;
  appendPublishLog(job, "command", `$ ${commandText}`);

  return await new Promise<CommandRunResult>((resolve) => {
    const child = spawn("git", args, {
      cwd,
      env: process.env,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let resolved = false;

    const flush = (level: "stdout" | "stderr", chunk: string) => {
      const lines = chunk
        .replace(/\r/g, "")
        .split("\n")
        .map((line) => line.trimEnd())
        .filter(Boolean);
      lines.forEach((line) => appendPublishLog(job, level, line));
    };

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout += text;
      flush("stdout", text);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;
      flush("stderr", text);
    });

    child.on("error", (error) => {
      if (resolved) {
        return;
      }
      resolved = true;
      const message = error.message || "Unknown spawn error";
      appendPublishLog(job, "error", message);
      resolve({
        ok: false,
        stdout: stdout.trim(),
        stderr: `${stderr}\n${message}`.trim(),
        code: null,
      });
    });

    child.on("close", (code) => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolve({
        ok: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        code: typeof code === "number" ? code : null,
      });
    });
  });
}

async function assertGitRepository(repositoryPath: string) {
  const result = await runGitCommand(["rev-parse", "--is-inside-work-tree"], repositoryPath);
  if (!result.ok || result.stdout !== "true") {
    throw new ApiError(400, "内容仓库路径不是有效的 git 仓库。");
  }
}

async function listGitConflictFiles(repositoryPath: string) {
  const result = await runGitCommand(["diff", "--name-only", "--diff-filter=U"], repositoryPath);
  if (!result.ok) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function hasGitStagedChanges(repositoryPath: string) {
  const result = await runGitCommand(["diff", "--cached", "--name-only"], repositoryPath);
  if (!result.ok) {
    throw new ApiError(500, formatGitCommandError("git diff --cached --name-only", result));
  }

  return result.stdout.length > 0;
}

async function hasGitWorkingChanges(repositoryPath: string) {
  const result = await runGitCommand(["status", "--porcelain"], repositoryPath);
  if (!result.ok) {
    throw new ApiError(500, formatGitCommandError("git status --porcelain", result));
  }

  return result.stdout.length > 0;
}

function formatGitCommandError(command: string, result: CommandRunResult) {
  const details = [result.stderr, result.stdout].filter(Boolean).join(" | ");
  if (!details) {
    return `${command} 执行失败。`;
  }
  return `${command} 执行失败：${details}`;
}

function getCurrentDateTimeLabel() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function safelyDecodePathname(pathname: string) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

function toPosix(...segments: string[]) {
  return segments.filter(Boolean).join("/").replace(/\\/g, "/");
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {} as Record<string, unknown>;
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {} as Record<string, unknown>;
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "Invalid JSON payload.");
  }
}

function sendJson(response: ServerResponse, statusCode: number, payload: Record<string, unknown>) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

export default defineConfig({
  plugins: [vue(), createEditorApiPlugin()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});


