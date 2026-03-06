
use axum::{
  extract::{Path as AxumPath, State},
  http::{header, HeaderMap, HeaderValue, StatusCode, Uri},
  response::{IntoResponse, Response},
  routing::{get, post},
  Json, Router,
};
use chrono::{Local, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
  cmp::Ordering as CmpOrdering,
  collections::HashMap,
  path::{Path as FsPath, PathBuf},
  process::Stdio,
  sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
  },
};
use tauri::{AppHandle, Manager};
use tokio::{
  fs,
  io::{AsyncBufReadExt, AsyncRead, BufReader},
  process::Command,
  sync::{Mutex, RwLock},
};
use walkdir::WalkDir;

const ARTICLE_TEMPLATE: &str = r#"---
title: "__TITLE__"
weight: 1
# bookFlatSection: false
# bookToc: true
# bookHidden: false
# bookCollapseSection: false
# bookComments: false
# bookSearchExclude: false
---

"#;
const TYPORA_DOWNLOAD_URL: &str = "https://typora.io/#download";

#[derive(Clone)]
pub struct ServerRuntime {
  pub port: u16,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
struct EditorPathSettings {
  document_project_path: String,
  chain_code_repo_path: String,
  backup_root_path: String,
}

#[derive(Clone)]
struct RuntimeContentPaths {
  document_project_path: PathBuf,
  chain_code_repo_path: PathBuf,
  docs_source_dir: PathBuf,
  home_index_file: PathBuf,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PublishLogEntry {
  id: u64,
  time: String,
  level: String,
  text: String,
}

#[derive(Clone)]
struct PublishJob {
  id: String,
  status: String,
  stage: String,
  started_at: String,
  updated_at: String,
  logs: Vec<PublishLogEntry>,
  conflict_files: Vec<String>,
  message: Option<String>,
  commit_message: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PublishJobResponse {
  id: String,
  status: String,
  stage: String,
  started_at: String,
  updated_at: String,
  logs: Vec<PublishLogEntry>,
  conflict_files: Vec<String>,
  message: Option<String>,
  commit_message: Option<String>,
}

#[derive(Clone)]
struct BackupJob {
  id: String,
  status: String,
  stage: String,
  started_at: String,
  updated_at: String,
  logs: Vec<PublishLogEntry>,
  message: Option<String>,
  snapshot_path: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupJobResponse {
  id: String,
  status: String,
  stage: String,
  started_at: String,
  updated_at: String,
  logs: Vec<PublishLogEntry>,
  message: Option<String>,
  snapshot_path: Option<String>,
}

#[derive(Clone)]
struct ServerState {
  settings_file: PathBuf,
  runtime_settings: Arc<RwLock<EditorPathSettings>>,
  publish_jobs: Arc<Mutex<HashMap<String, PublishJob>>>,
  active_publish_job_id: Arc<Mutex<Option<String>>>,
  backup_jobs: Arc<Mutex<HashMap<String, BackupJob>>>,
  active_backup_job_id: Arc<Mutex<Option<String>>>,
  publish_log_sequence: Arc<AtomicU64>,
  dist_dir: PathBuf,
}

type SharedState = Arc<ServerState>;
type ApiResult<T = Response> = Result<T, ApiError>;

#[derive(Debug)]
struct ApiError {
  status: StatusCode,
  message: String,
}

impl ApiError {
  fn new(status: StatusCode, message: impl Into<String>) -> Self {
    Self {
      status,
      message: message.into(),
    }
  }

  fn bad_request(message: impl Into<String>) -> Self {
    Self::new(StatusCode::BAD_REQUEST, message)
  }

  fn not_found(message: impl Into<String>) -> Self {
    Self::new(StatusCode::NOT_FOUND, message)
  }

  fn conflict(message: impl Into<String>) -> Self {
    Self::new(StatusCode::CONFLICT, message)
  }

  fn internal(message: impl Into<String>) -> Self {
    Self::new(StatusCode::INTERNAL_SERVER_ERROR, message)
  }
}

impl IntoResponse for ApiError {
  fn into_response(self) -> Response {
    (self.status, Json(json!({ "message": self.message }))).into_response()
  }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PathSettingsResponse {
  document_project_path: String,
  chain_code_repo_path: String,
  backup_root_path: String,
  docs_source_dir: String,
  home_index_file: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateSettingsPayload {
  document_project_path: String,
  chain_code_repo_path: String,
  backup_root_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateArticlePayload {
  section_path: String,
  file_name: String,
  title: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveArticlePayload {
  article_path: String,
  content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoveArticlePayload {
  article_path: String,
  target_section_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteArticlePayload {
  article_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenTyporaPayload {
  article_path: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ContentTreeResponse {
  generated_at: String,
  docs_source_dir: String,
  nodes: Vec<ContentNode>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ContentNode {
  key: String,
  #[serde(rename = "type")]
  node_type: String,
  title: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  path: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  index_path: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  special: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  weight: Option<i64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  book_flat_section: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  children: Option<Vec<ContentNode>>,
}

#[derive(Clone, Debug)]
enum FrontMatterValue {
  String(String),
  Number(i64),
  Bool(bool),
}

#[derive(Default)]
struct FrontMatter {
  attrs: HashMap<String, FrontMatterValue>,
}

#[derive(Clone)]
struct CommandRunResult {
  ok: bool,
  stdout: String,
  stderr: String,
  code: Option<i32>,
}

#[derive(Clone)]
struct BackupCopyItem {
  source_path: PathBuf,
  relative_path: PathBuf,
  is_dir: bool,
  size: u64,
}

pub async fn start_server(app_handle: AppHandle) -> Result<ServerRuntime, String> {
  let app_data_dir = app_handle
    .path()
    .app_data_dir()
    .map_err(|error| format!("Failed to resolve app data dir: {error}"))?;
  fs::create_dir_all(&app_data_dir)
    .await
    .map_err(|error| format!("Failed to create app data dir: {error}"))?;

  let settings_file = app_data_dir.join(".sololog-paths.json");
  let runtime_settings = load_path_settings_from_disk(&settings_file).await;

  let project_root = if cfg!(debug_assertions) {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
  } else {
    app_handle
      .path()
      .resource_dir()
      .map_err(|error| format!("Failed to resolve resource dir: {error}"))?
  };
  let dist_dir = locate_dist_dir(&project_root).await.ok_or_else(|| {
    format!(
      "Renderer dist directory not found. Tried under: {}, {}",
      project_root.display(),
      project_root.join("_up_").display()
    )
  })?;

  let state = Arc::new(ServerState {
    settings_file,
    runtime_settings: Arc::new(RwLock::new(runtime_settings)),
    publish_jobs: Arc::new(Mutex::new(HashMap::new())),
    active_publish_job_id: Arc::new(Mutex::new(None)),
    backup_jobs: Arc::new(Mutex::new(HashMap::new())),
    active_backup_job_id: Arc::new(Mutex::new(None)),
    publish_log_sequence: Arc::new(AtomicU64::new(1)),
    dist_dir,
  });

  let router = Router::new()
    .route("/content/content-tree.json", get(get_content_tree))
    .route("/content/_index.md", get(get_home_markdown))
    .route("/content/docs/*article_path", get(get_article_markdown))
    .route("/api/editor/settings", get(get_settings).put(put_settings))
    .route("/api/editor/article", post(create_article).put(save_article))
    .route("/api/editor/article/move", post(move_article))
    .route("/api/editor/article/delete", post(delete_article).delete(delete_article))
    .route("/api/editor/typora/open", post(open_typora))
    .route("/api/editor/publish", post(start_publish))
    .route("/api/editor/publish/:job_id", get(get_publish_job))
    .route("/api/editor/backup", post(start_backup))
    .route("/api/editor/backup/:job_id", get(get_backup_job))
    .fallback(get(serve_frontend))
    .with_state(state.clone());

  let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
    .await
    .map_err(|error| format!("Failed to bind local server: {error}"))?;
  let port = listener
    .local_addr()
    .map_err(|error| format!("Failed to read local server address: {error}"))?
    .port();

  tauri::async_runtime::spawn(async move {
    if let Err(error) = axum::serve(listener, router).await {
      eprintln!("[tauri-server] serve error: {error}");
    }
  });

  Ok(ServerRuntime { port })
}

async fn get_settings(State(state): State<SharedState>) -> ApiResult {
  let settings = state.runtime_settings.read().await.clone();
  Ok(Json(to_path_settings_response(&settings)).into_response())
}

async fn put_settings(
  State(state): State<SharedState>,
  Json(payload): Json<UpdateSettingsPayload>,
) -> ApiResult {
  let next_settings = EditorPathSettings {
    document_project_path: normalize_required_path(
      &payload.document_project_path,
      "documentProjectPath",
    )?,
    chain_code_repo_path: normalize_required_path(
      &payload.chain_code_repo_path,
      "chainCodeRepoPath",
    )?,
    backup_root_path: normalize_optional_path(payload.backup_root_path.as_deref()),
  };

  let runtime_paths = resolve_runtime_content_paths(&next_settings, true)?;
  assert_directory_exists(&runtime_paths.document_project_path, "Content repository path").await?;
  assert_directory_exists(&runtime_paths.docs_source_dir, "Content docs directory").await?;
  assert_file_exists(&runtime_paths.home_index_file, "Content home _index.md").await?;
  assert_directory_exists(&runtime_paths.chain_code_repo_path, "Deploy repository path").await?;
  let normalized_backup_root_path = if !next_settings.backup_root_path.trim().is_empty() {
    let backup_root_path = absolutize_path(&next_settings.backup_root_path)?;
    ensure_directory_exists(&backup_root_path, "Backup root path").await?;
    backup_root_path.to_string_lossy().to_string()
  } else {
    String::new()
  };

  let persisted = EditorPathSettings {
    document_project_path: runtime_paths.document_project_path.to_string_lossy().to_string(),
    chain_code_repo_path: runtime_paths.chain_code_repo_path.to_string_lossy().to_string(),
    backup_root_path: normalized_backup_root_path,
  };

  save_path_settings_to_disk(&state.settings_file, &persisted).await?;
  *state.runtime_settings.write().await = persisted.clone();

  Ok(Json(to_path_settings_response(&persisted)).into_response())
}

async fn get_content_tree(State(state): State<SharedState>) -> ApiResult {
  let settings = state.runtime_settings.read().await.clone();
  let runtime_paths = resolve_runtime_content_paths(&settings, false)?;
  assert_directory_exists(&runtime_paths.docs_source_dir, "Document docs path").await?;

  let docs_source_dir = runtime_paths.docs_source_dir.clone();
  let root_section = tokio::task::spawn_blocking(move || build_section_sync(&docs_source_dir, ""))
    .await
    .map_err(|error| ApiError::internal(format!("Failed to build content tree: {error}")))??;

  let response = ContentTreeResponse {
    generated_at: Utc::now().to_rfc3339(),
    docs_source_dir: runtime_paths.docs_source_dir.to_string_lossy().to_string(),
    nodes: root_section.children.unwrap_or_default(),
  };
  Ok(Json(response).into_response())
}

async fn get_home_markdown(State(state): State<SharedState>) -> ApiResult {
  let settings = state.runtime_settings.read().await.clone();
  let runtime_paths = resolve_runtime_content_paths(&settings, false)?;
  assert_file_exists(&runtime_paths.home_index_file, "Home markdown file").await?;

  let bytes = fs::read(&runtime_paths.home_index_file)
    .await
    .map_err(|error| {
      ApiError::internal(format!(
        "Failed to read home markdown file {}: {error}",
        runtime_paths.home_index_file.display()
      ))
    })?;

  Ok(bytes_response("text/markdown; charset=utf-8", bytes))
}

async fn get_article_markdown(
  State(state): State<SharedState>,
  AxumPath(article_path): AxumPath<String>,
) -> ApiResult {
  let settings = state.runtime_settings.read().await.clone();
  let runtime_paths = resolve_runtime_content_paths(&settings, false)?;
  let normalized_article_path = to_safe_relative_path(&article_path, "articlePath", false)?;
  assert_markdown_article_path(&normalized_article_path)?;

  let article_file = resolve_under_root(&runtime_paths.docs_source_dir, &normalized_article_path)?;
  assert_file_exists(&article_file, "Article").await?;
  let bytes = fs::read(&article_file).await.map_err(|error| {
    ApiError::internal(format!(
      "Failed to read markdown file {}: {error}",
      article_file.display()
    ))
  })?;

  Ok(bytes_response("text/markdown; charset=utf-8", bytes))
}

async fn create_article(
  State(state): State<SharedState>,
  Json(payload): Json<CreateArticlePayload>,
) -> ApiResult {
  let settings = state.runtime_settings.read().await.clone();
  let runtime_paths = resolve_runtime_content_paths(&settings, false)?;

  let section_path = to_safe_relative_path(&payload.section_path, "sectionPath", true)?;
  let section_abs_path = resolve_under_root(&runtime_paths.docs_source_dir, &section_path)?;
  assert_directory_exists(&section_abs_path, "Section").await?;

  let file_name = to_safe_file_name(&payload.file_name)?;
  let fallback_title = strip_markdown_extension(&file_name);
  let title = normalize_title(payload.title.as_deref(), &fallback_title);
  let article_path = join_posix(&[&section_path, &file_name]);
  assert_markdown_article_path(&article_path)?;

  let article_abs_path = resolve_under_root(&runtime_paths.docs_source_dir, &article_path)?;
  if path_exists(&article_abs_path).await {
    return Err(ApiError::conflict("Article already exists."));
  }

  fs::write(&article_abs_path, build_article_template(&title))
    .await
    .map_err(|error| {
      ApiError::internal(format!(
        "Failed to create article {}: {error}",
        article_abs_path.display()
      ))
    })?;

  Ok(Json(json!({ "path": article_path })).into_response())
}

async fn save_article(
  State(state): State<SharedState>,
  Json(payload): Json<SaveArticlePayload>,
) -> ApiResult {
  let settings = state.runtime_settings.read().await.clone();
  let runtime_paths = resolve_runtime_content_paths(&settings, false)?;
  let article_path = to_safe_relative_path(&payload.article_path, "articlePath", false)?;
  assert_markdown_article_path(&article_path)?;

  if posix_basename(&article_path).eq_ignore_ascii_case("_index.md") {
    return Err(ApiError::bad_request(
      "Editing _index.md in editor mode is not supported.",
    ));
  }

  let article_abs_path = resolve_under_root(&runtime_paths.docs_source_dir, &article_path)?;
  assert_file_exists(&article_abs_path, "Article").await?;
  fs::write(&article_abs_path, payload.content.as_bytes())
    .await
    .map_err(|error| {
      ApiError::internal(format!(
        "Failed to save article {}: {error}",
        article_abs_path.display()
      ))
    })?;

  Ok(Json(json!({ "ok": true })).into_response())
}

async fn move_article(
  State(state): State<SharedState>,
  Json(payload): Json<MoveArticlePayload>,
) -> ApiResult {
  let settings = state.runtime_settings.read().await.clone();
  let runtime_paths = resolve_runtime_content_paths(&settings, false)?;

  let article_path = to_safe_relative_path(&payload.article_path, "articlePath", false)?;
  assert_markdown_article_path(&article_path)?;

  let target_section_path = to_safe_relative_path(
    &payload.target_section_path,
    "targetSectionPath",
    true,
  )?;
  let target_section_abs = resolve_under_root(&runtime_paths.docs_source_dir, &target_section_path)?;
  assert_directory_exists(&target_section_abs, "Target section").await?;

  let source_article_abs = resolve_under_root(&runtime_paths.docs_source_dir, &article_path)?;
  assert_file_exists(&source_article_abs, "Article").await?;

  let target_article_path = join_posix(&[&target_section_path, posix_basename(&article_path)]);
  if target_article_path == article_path {
    return Ok(Json(json!({ "path": article_path })).into_response());
  }

  let target_article_abs = resolve_under_root(&runtime_paths.docs_source_dir, &target_article_path)?;
  if path_exists(&target_article_abs).await {
    return Err(ApiError::conflict(
      "Target section already has an article with the same file name.",
    ));
  }

  fs::rename(&source_article_abs, &target_article_abs)
    .await
    .map_err(|error| {
      ApiError::internal(format!(
        "Failed to move article to {}: {error}",
        target_article_abs.display()
      ))
    })?;

  Ok(Json(json!({ "path": target_article_path })).into_response())
}

async fn delete_article(
  State(state): State<SharedState>,
  Json(payload): Json<DeleteArticlePayload>,
) -> ApiResult {
  let settings = state.runtime_settings.read().await.clone();
  let runtime_paths = resolve_runtime_content_paths(&settings, false)?;
  let article_path = to_safe_relative_path(&payload.article_path, "articlePath", false)?;
  assert_markdown_article_path(&article_path)?;

  let article_abs = resolve_under_root(&runtime_paths.docs_source_dir, &article_path)?;
  assert_file_exists(&article_abs, "Article").await?;
  fs::remove_file(&article_abs)
    .await
    .map_err(|error| {
      ApiError::internal(format!(
        "Failed to delete article {}: {error}",
        article_abs.display()
      ))
    })?;

  Ok(Json(json!({ "ok": true })).into_response())
}

async fn open_typora(
  State(state): State<SharedState>,
  Json(payload): Json<OpenTyporaPayload>,
) -> ApiResult {
  let settings = state.runtime_settings.read().await.clone();
  let runtime_paths = resolve_runtime_content_paths(&settings, false)?;
  let article_path = to_safe_relative_path(&payload.article_path, "articlePath", false)?;
  assert_markdown_article_path(&article_path)?;

  let article_abs_path = resolve_under_root(&runtime_paths.docs_source_dir, &article_path)?;
  assert_file_exists(&article_abs_path, "Article").await?;
  open_article_with_typora(&article_abs_path)?;

  Ok(
    Json(json!({
      "ok": true,
      "message": format!("已在 Typora 打开：{article_path}")
    }))
    .into_response(),
  )
}

async fn start_publish(State(state): State<SharedState>) -> ApiResult {
  let current_active = state.active_publish_job_id.lock().await.clone();
  if let Some(active_id) = current_active {
    let is_running = {
      let jobs = state.publish_jobs.lock().await;
      jobs
        .get(&active_id)
        .map(|job| job.status == "running")
        .unwrap_or(false)
    };
    if is_running {
      return Ok(
        (
          StatusCode::CONFLICT,
          Json(json!({
            "status": "running",
            "message": "已有上传任务正在执行。",
            "jobId": active_id
          })),
        )
          .into_response(),
      );
    }

    let mut active_guard = state.active_publish_job_id.lock().await;
    if active_guard.as_deref() == Some(active_id.as_str()) {
      *active_guard = None;
    }
  }

  let job_id = create_publish_job(&state).await;
  *state.active_publish_job_id.lock().await = Some(job_id.clone());

  let state_clone = state.clone();
  let job_id_clone = job_id.clone();
  tauri::async_runtime::spawn(async move {
    execute_publish_job(state_clone, job_id_clone).await;
  });

  Ok(
    (
      StatusCode::ACCEPTED,
      Json(json!({
        "status": "running",
        "jobId": job_id
      })),
    )
      .into_response(),
  )
}

async fn get_publish_job(
  State(state): State<SharedState>,
  AxumPath(job_id): AxumPath<String>,
) -> ApiResult {
  if job_id.trim().is_empty() {
    return Err(ApiError::bad_request("jobId is required."));
  }

  let job = {
    let jobs = state.publish_jobs.lock().await;
    jobs
      .get(&job_id)
      .cloned()
      .ok_or_else(|| ApiError::not_found("Publish job not found."))?
  };

  Ok(Json(to_publish_job_response(&job)).into_response())
}

async fn start_backup(State(state): State<SharedState>) -> ApiResult {
  let current_active = state.active_backup_job_id.lock().await.clone();
  if let Some(active_id) = current_active {
    let is_running = {
      let jobs = state.backup_jobs.lock().await;
      jobs
        .get(&active_id)
        .map(|job| job.status == "running")
        .unwrap_or(false)
    };
    if is_running {
      return Ok(
        (
          StatusCode::CONFLICT,
          Json(json!({
            "status": "running",
            "message": "已有备份任务正在执行。",
            "jobId": active_id
          })),
        )
          .into_response(),
      );
    }

    let mut active_guard = state.active_backup_job_id.lock().await;
    if active_guard.as_deref() == Some(active_id.as_str()) {
      *active_guard = None;
    }
  }

  let job_id = create_backup_job(&state).await;
  *state.active_backup_job_id.lock().await = Some(job_id.clone());

  let state_clone = state.clone();
  let job_id_clone = job_id.clone();
  tauri::async_runtime::spawn(async move {
    execute_backup_job(state_clone, job_id_clone).await;
  });

  Ok(
    (
      StatusCode::ACCEPTED,
      Json(json!({
        "status": "running",
        "jobId": job_id
      })),
    )
      .into_response(),
  )
}

async fn get_backup_job(
  State(state): State<SharedState>,
  AxumPath(job_id): AxumPath<String>,
) -> ApiResult {
  if job_id.trim().is_empty() {
    return Err(ApiError::bad_request("jobId is required."));
  }

  let job = {
    let jobs = state.backup_jobs.lock().await;
    jobs
      .get(&job_id)
      .cloned()
      .ok_or_else(|| ApiError::not_found("Backup job not found."))?
  };

  Ok(Json(to_backup_job_response(&job)).into_response())
}

async fn serve_frontend(State(state): State<SharedState>, uri: Uri) -> ApiResult {
  let request_path = uri.path().trim_start_matches('/');
  if request_path.starts_with("api/") || request_path.starts_with("content/") {
    return Err(ApiError::not_found("Endpoint not found."));
  }

  let static_path = normalize_static_path(request_path)
    .ok_or_else(|| ApiError::bad_request("Invalid static resource path."))?;
  let mut target_file = state.dist_dir.join(&static_path);
  if !path_is_file(&target_file).await {
    target_file = state.dist_dir.join("index.html");
  }

  if !path_is_file(&target_file).await {
    return Err(ApiError::not_found("index.html not found in dist directory."));
  }

  let bytes = fs::read(&target_file).await.map_err(|error| {
    ApiError::internal(format!(
      "Failed to read static resource {}: {error}",
      target_file.display()
    ))
  })?;

  Ok(bytes_response(content_type_for_path(&target_file), bytes))
}

async fn create_publish_job(state: &SharedState) -> String {
  let now = Utc::now().to_rfc3339();
  let sequence = state.publish_log_sequence.fetch_add(1, Ordering::Relaxed);
  let id = format!("publish-{}-{sequence}", Utc::now().timestamp_millis());

  let job = PublishJob {
    id: id.clone(),
    status: "running".to_string(),
    stage: "init".to_string(),
    started_at: now.clone(),
    updated_at: now,
    logs: Vec::new(),
    conflict_files: Vec::new(),
    message: None,
    commit_message: None,
  };

  {
    let mut jobs = state.publish_jobs.lock().await;
    jobs.insert(id.clone(), job);
  }
  append_publish_log(state, &id, "info", "开始执行文档上传任务。").await;
  cleanup_publish_jobs(state).await;
  id
}

async fn execute_publish_job(state: SharedState, job_id: String) {
  let result = execute_publish_job_inner(&state, &job_id).await;
  if let Err(error) = result {
    update_publish_job(&state, &job_id, |job| {
      job.status = "error".to_string();
      job.stage = "done".to_string();
      job.message = Some(error.message.clone());
    })
    .await;
    append_publish_log(&state, &job_id, "error", error.message).await;
  }

  let mut active_guard = state.active_publish_job_id.lock().await;
  if active_guard.as_deref() == Some(job_id.as_str()) {
    *active_guard = None;
  }
  drop(active_guard);
  cleanup_publish_jobs(&state).await;
}

async fn execute_publish_job_inner(state: &SharedState, job_id: &str) -> Result<(), ApiError> {
  let settings = state.runtime_settings.read().await.clone();
  let runtime_paths = resolve_runtime_content_paths(&settings, false)?;
  let repository_path = runtime_paths.document_project_path;

  append_publish_log(
    state,
    job_id,
    "info",
    format!("目标仓库：{}", repository_path.display()),
  )
  .await;

  assert_directory_exists(&repository_path, "Document project path").await?;
  assert_git_repository(&repository_path).await?;

  update_publish_job(state, job_id, |job| {
    job.stage = "pull".to_string();
  })
  .await;
  let pull_result = run_git_command_with_logs(state, job_id, &["pull"], &repository_path).await;
  if !pull_result.ok {
    let conflict_files = list_git_conflict_files(&repository_path).await;
    if !conflict_files.is_empty() {
      update_publish_job(state, job_id, |job| {
        job.status = "conflict".to_string();
        job.stage = "done".to_string();
        job.conflict_files = conflict_files.clone();
        job.message = Some("git pull 出现冲突，请先解决冲突后再上传。".to_string());
      })
      .await;
      append_publish_log(state, job_id, "error", "检测到合并冲突。").await;
      return Ok(());
    }

    return Err(ApiError::internal(format_git_command_error(
      "git pull",
      &pull_result,
    )));
  }

  let has_working_changes = has_git_working_changes(&repository_path).await?;
  if !has_working_changes {
    let message = "git pull 完成后未检测到仓库变更，跳过 add/commit/push。".to_string();
    update_publish_job(state, job_id, |job| {
      job.status = "success".to_string();
      job.stage = "done".to_string();
      job.message = Some(message.clone());
      job.commit_message = None;
    })
    .await;
    append_publish_log(state, job_id, "info", "未检测到仓库修改，已跳过后续步骤。").await;
    append_publish_log(state, job_id, "success", message).await;
    return Ok(());
  }

  update_publish_job(state, job_id, |job| {
    job.stage = "add".to_string();
  })
  .await;
  let add_result = run_git_command_with_logs(state, job_id, &["add", "."], &repository_path).await;
  if !add_result.ok {
    return Err(ApiError::internal(format_git_command_error(
      "git add .",
      &add_result,
    )));
  }

  let has_staged_changes = has_git_staged_changes(&repository_path).await?;
  let commit_message = format!("docs: update {}", get_current_datetime_label());
  if has_staged_changes {
    update_publish_job(state, job_id, |job| {
      job.stage = "commit".to_string();
      job.commit_message = Some(commit_message.clone());
    })
    .await;
    let commit_result = run_git_command_with_logs(
      state,
      job_id,
      &["commit", "-m", &commit_message],
      &repository_path,
    )
    .await;
    if !commit_result.ok {
      return Err(ApiError::internal(format_git_command_error(
        "git commit",
        &commit_result,
      )));
    }
  } else {
    append_publish_log(state, job_id, "info", "未检测到暂存变更，跳过 git commit。").await;
  }

  update_publish_job(state, job_id, |job| {
    job.stage = "push".to_string();
  })
  .await;
  let push_result = run_git_command_with_logs(state, job_id, &["push"], &repository_path).await;
  if !push_result.ok {
    return Err(ApiError::internal(format_git_command_error(
      "git push",
      &push_result,
    )));
  }

  let success_message = if has_staged_changes {
    format!("上传完成：{commit_message}")
  } else {
    "仓库没有新增变更，已完成 pull/push。".to_string()
  };
  update_publish_job(state, job_id, |job| {
    job.status = "success".to_string();
    job.stage = "done".to_string();
    job.message = Some(success_message.clone());
    if !has_staged_changes {
      job.commit_message = None;
    }
  })
  .await;
  append_publish_log(state, job_id, "success", success_message).await;

  Ok(())
}

async fn append_publish_log(
  state: &SharedState,
  job_id: &str,
  level: &str,
  text: impl Into<String>,
) {
  let text_value = text.into();
  let mut jobs = state.publish_jobs.lock().await;
  if let Some(job) = jobs.get_mut(job_id) {
    let entry = PublishLogEntry {
      id: state.publish_log_sequence.fetch_add(1, Ordering::Relaxed),
      time: Utc::now().to_rfc3339(),
      level: level.to_string(),
      text: text_value,
    };
    job.updated_at = entry.time.clone();
    job.logs.push(entry);
    if job.logs.len() > 800 {
      let remove = job.logs.len() - 800;
      job.logs.drain(0..remove);
    }
  }
}

async fn update_publish_job<F>(state: &SharedState, job_id: &str, updater: F)
where
  F: FnOnce(&mut PublishJob),
{
  let mut jobs = state.publish_jobs.lock().await;
  if let Some(job) = jobs.get_mut(job_id) {
    updater(job);
    job.updated_at = Utc::now().to_rfc3339();
  }
}

async fn cleanup_publish_jobs(state: &SharedState) {
  let mut jobs = state.publish_jobs.lock().await;
  if jobs.len() <= 30 {
    return;
  }

  let mut sorted: Vec<PublishJob> = jobs.values().cloned().collect();
  sorted.sort_by(|left, right| left.started_at.cmp(&right.started_at));
  let removable: Vec<String> = sorted
    .iter()
    .filter(|job| job.status != "running")
    .take(sorted.len().saturating_sub(30))
    .map(|job| job.id.clone())
    .collect();
  for id in removable {
    jobs.remove(&id);
  }
}

fn to_publish_job_response(job: &PublishJob) -> PublishJobResponse {
  PublishJobResponse {
    id: job.id.clone(),
    status: job.status.clone(),
    stage: job.stage.clone(),
    started_at: job.started_at.clone(),
    updated_at: job.updated_at.clone(),
    logs: job.logs.clone(),
    conflict_files: job.conflict_files.clone(),
    message: job.message.clone(),
    commit_message: job.commit_message.clone(),
  }
}

async fn create_backup_job(state: &SharedState) -> String {
  let now = Utc::now().to_rfc3339();
  let sequence = state.publish_log_sequence.fetch_add(1, Ordering::Relaxed);
  let id = format!("backup-{}-{sequence}", Utc::now().timestamp_millis());

  let job = BackupJob {
    id: id.clone(),
    status: "running".to_string(),
    stage: "init".to_string(),
    started_at: now.clone(),
    updated_at: now,
    logs: Vec::new(),
    message: None,
    snapshot_path: None,
  };

  {
    let mut jobs = state.backup_jobs.lock().await;
    jobs.insert(id.clone(), job);
  }
  append_backup_log(state, &id, "info", "开始执行仓库备份任务。").await;
  cleanup_backup_jobs(state).await;
  id
}

async fn execute_backup_job(state: SharedState, job_id: String) {
  let result = execute_backup_job_inner(&state, &job_id).await;
  if let Err(error) = result {
    update_backup_job(&state, &job_id, |job| {
      job.status = "error".to_string();
      job.stage = "done".to_string();
      job.message = Some(error.message.clone());
    })
    .await;
    append_backup_log(&state, &job_id, "error", error.message).await;
  }

  let mut active_guard = state.active_backup_job_id.lock().await;
  if active_guard.as_deref() == Some(job_id.as_str()) {
    *active_guard = None;
  }
  drop(active_guard);
  cleanup_backup_jobs(&state).await;
}

async fn execute_backup_job_inner(state: &SharedState, job_id: &str) -> Result<(), ApiError> {
  let settings = state.runtime_settings.read().await.clone();
  let runtime_paths = resolve_runtime_content_paths(&settings, false)?;
  let source_repo_path = runtime_paths.document_project_path;
  let backup_root_path = resolve_backup_root_path(&settings)?;

  update_backup_job(state, job_id, |job| {
    job.stage = "prepare".to_string();
  })
  .await;

  assert_directory_exists(&source_repo_path, "Content repository path").await?;
  ensure_directory_exists(&backup_root_path, "Backup root path").await?;

  append_backup_log(
    state,
    job_id,
    "info",
    format!("源仓库：{}", source_repo_path.display()),
  )
  .await;
  append_backup_log(
    state,
    job_id,
    "info",
    format!("备份根路径：{}", backup_root_path.display()),
  )
  .await;

  let snapshot_folder_name = Local::now()
    .format("%Y年%m月%d日%H时%M分%S秒-备份")
    .to_string();
  let mut snapshot_path = backup_root_path.join(&snapshot_folder_name);
  if path_exists(&snapshot_path).await {
    let mut suffix = 1_u32;
    loop {
      let candidate = backup_root_path.join(format!("{snapshot_folder_name}-{suffix:02}"));
      if !path_exists(&candidate).await {
        snapshot_path = candidate;
        break;
      }
      suffix += 1;
    }
  }
  ensure_directory_exists(&snapshot_path, "Backup snapshot directory").await?;
  append_backup_log(
    state,
    job_id,
    "success",
    format!("已创建备份目录：{}", snapshot_path.display()),
  )
  .await;

  update_backup_job(state, job_id, |job| {
    job.stage = "scan".to_string();
  })
  .await;
  let source_repo_for_scan = source_repo_path.clone();
  let scan_result = tokio::task::spawn_blocking(move || collect_backup_items(&source_repo_for_scan))
    .await
    .map_err(|error| ApiError::internal(format!("Failed to scan repository files: {error}")))??;

  let (items, file_count, directory_count, total_bytes) = scan_result;
  append_backup_log(
    state,
    job_id,
    "info",
    format!(
      "扫描完成：{} 个目录，{} 个文件，总大小约 {} 字节。",
      directory_count, file_count, total_bytes
    ),
  )
  .await;

  update_backup_job(state, job_id, |job| {
    job.stage = "copy".to_string();
  })
  .await;

  let mut copied_files = 0_u64;
  let mut copied_bytes = 0_u64;
  for item in items {
    let destination_path = snapshot_path.join(&item.relative_path);
    if item.is_dir {
      ensure_directory_exists(&destination_path, "Backup directory").await?;
      continue;
    }

    if let Some(parent) = destination_path.parent() {
      ensure_directory_exists(parent, "Backup parent directory").await?;
    }

    fs::copy(&item.source_path, &destination_path)
      .await
      .map_err(|error| {
        ApiError::internal(format!(
          "Failed to copy {} -> {}: {error}",
          item.source_path.display(),
          destination_path.display()
        ))
      })?;

    copied_files += 1;
    copied_bytes += item.size;
    if copied_files == 1 || copied_files % 25 == 0 || copied_files == file_count {
      append_backup_log(
        state,
        job_id,
        "stdout",
        format!(
          "已复制 {copied_files}/{file_count} 个文件（{} 字节）。",
          copied_bytes
        ),
      )
      .await;
    }
  }

  let snapshot_path_display = snapshot_path.to_string_lossy().to_string();
  update_backup_job(state, job_id, |job| {
    job.status = "success".to_string();
    job.stage = "done".to_string();
    job.message = Some("备份完成。".to_string());
    job.snapshot_path = Some(snapshot_path_display.clone());
  })
  .await;
  append_backup_log(
    state,
    job_id,
    "success",
    format!(
      "备份完成：{} 个文件，{} 字节。输出目录：{}",
      copied_files,
      copied_bytes,
      snapshot_path.display()
    ),
  )
  .await;

  Ok(())
}

async fn append_backup_log(
  state: &SharedState,
  job_id: &str,
  level: &str,
  text: impl Into<String>,
) {
  let text_value = text.into();
  let mut jobs = state.backup_jobs.lock().await;
  if let Some(job) = jobs.get_mut(job_id) {
    let entry = PublishLogEntry {
      id: state.publish_log_sequence.fetch_add(1, Ordering::Relaxed),
      time: Utc::now().to_rfc3339(),
      level: level.to_string(),
      text: text_value,
    };
    job.updated_at = entry.time.clone();
    job.logs.push(entry);
    if job.logs.len() > 800 {
      let remove = job.logs.len() - 800;
      job.logs.drain(0..remove);
    }
  }
}

async fn update_backup_job<F>(state: &SharedState, job_id: &str, updater: F)
where
  F: FnOnce(&mut BackupJob),
{
  let mut jobs = state.backup_jobs.lock().await;
  if let Some(job) = jobs.get_mut(job_id) {
    updater(job);
    job.updated_at = Utc::now().to_rfc3339();
  }
}

async fn cleanup_backup_jobs(state: &SharedState) {
  let mut jobs = state.backup_jobs.lock().await;
  if jobs.len() <= 30 {
    return;
  }

  let mut sorted: Vec<BackupJob> = jobs.values().cloned().collect();
  sorted.sort_by(|left, right| left.started_at.cmp(&right.started_at));
  let removable: Vec<String> = sorted
    .iter()
    .filter(|job| job.status != "running")
    .take(sorted.len().saturating_sub(30))
    .map(|job| job.id.clone())
    .collect();
  for id in removable {
    jobs.remove(&id);
  }
}

fn to_backup_job_response(job: &BackupJob) -> BackupJobResponse {
  BackupJobResponse {
    id: job.id.clone(),
    status: job.status.clone(),
    stage: job.stage.clone(),
    started_at: job.started_at.clone(),
    updated_at: job.updated_at.clone(),
    logs: job.logs.clone(),
    message: job.message.clone(),
    snapshot_path: job.snapshot_path.clone(),
  }
}

fn open_article_with_typora(article_abs_path: &FsPath) -> Result<(), ApiError> {
  #[cfg(target_os = "windows")]
  {
    let mut launch_errors: Vec<String> = Vec::new();
    for candidate in collect_windows_typora_candidates() {
      if !candidate.is_file() {
        continue;
      }

      match std::process::Command::new(&candidate)
        .arg(article_abs_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
      {
        Ok(_) => return Ok(()),
        Err(error) => {
          launch_errors.push(format!("{}: {error}", candidate.display()));
        }
      }
    }

    match std::process::Command::new("typora.exe")
      .arg(article_abs_path)
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
    {
      Ok(_) => return Ok(()),
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
      Err(error) => launch_errors.push(format!("typora.exe: {error}")),
    }

    match launch_typora_via_cmd_start(article_abs_path) {
      Ok(_) => return Ok(()),
      Err(error) => launch_errors.push(format!("cmd-start: {error}")),
    }

    if !launch_errors.is_empty() {
      return Err(ApiError::internal(format!(
        "Failed to launch Typora: {}",
        launch_errors.join(" | ")
      )));
    }

    Err(ApiError::new(
      StatusCode::PRECONDITION_FAILED,
      format!("未检测到 Typora，请先安装：{TYPORA_DOWNLOAD_URL}"),
    ))
  }

  #[cfg(target_os = "macos")]
  {
    match Command::new("open")
      .args(["-a", "Typora"])
      .arg(article_abs_path)
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
    {
      Ok(_) => Ok(()),
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => Err(ApiError::new(
        StatusCode::PRECONDITION_FAILED,
        format!("未检测到 Typora，请先安装：{TYPORA_DOWNLOAD_URL}"),
      )),
      Err(error) => Err(ApiError::internal(format!("Failed to launch Typora: {error}"))),
    }
  }

  #[cfg(all(unix, not(target_os = "macos")))]
  {
    match Command::new("typora")
      .arg(article_abs_path)
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
    {
      Ok(_) => Ok(()),
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => Err(ApiError::new(
        StatusCode::PRECONDITION_FAILED,
        format!("未检测到 Typora，请先安装：{TYPORA_DOWNLOAD_URL}"),
      )),
      Err(error) => Err(ApiError::internal(format!("Failed to launch Typora: {error}"))),
    }
  }

  #[cfg(not(any(target_os = "windows", target_os = "macos", unix)))]
  {
    let _ = article_abs_path;
    Err(ApiError::bad_request(
      "当前系统暂不支持自动打开 Typora，请手动打开文章。",
    ))
  }
}

#[cfg(target_os = "windows")]
fn launch_typora_via_cmd_start(article_abs_path: &FsPath) -> Result<(), std::io::Error> {
  let output = std::process::Command::new("cmd.exe")
    .args(["/d", "/s", "/c", "start", "", "typora.exe"])
    .arg(article_abs_path)
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::piped())
    .output()?;

  if output.status.success() {
    return Ok(());
  }

  let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
  let message = if stderr.is_empty() {
    format!(
      "cmd.exe exited with status {}",
      output
        .status
        .code()
        .map(|code| code.to_string())
        .unwrap_or_else(|| "unknown".to_string())
    )
  } else {
    stderr
  };

  Err(std::io::Error::new(std::io::ErrorKind::Other, message))
}

#[cfg(target_os = "windows")]
fn collect_windows_typora_candidates() -> Vec<PathBuf> {
  let mut candidates: Vec<PathBuf> = Vec::new();
  let mut seen = std::collections::HashSet::<String>::new();

  let mut push_candidate = |candidate: PathBuf| {
    let normalized = candidate.to_string_lossy().trim().trim_matches('"').to_string();
    if normalized.is_empty() {
      return;
    }
    let dedupe_key = normalized.to_lowercase();
    if seen.insert(dedupe_key) {
      candidates.push(PathBuf::from(normalized));
    }
  };

  if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
    let local_app_data_path = PathBuf::from(local_app_data);
    push_candidate(
      local_app_data_path
        .join("Programs")
        .join("Typora")
        .join("Typora.exe"),
    );
    push_candidate(local_app_data_path.join("Typora").join("Typora.exe"));
  }

  if let Ok(user_profile) = std::env::var("USERPROFILE") {
    let user_profile_path = PathBuf::from(user_profile);
    push_candidate(
      user_profile_path
        .join("AppData")
        .join("Local")
        .join("Programs")
        .join("Typora")
        .join("Typora.exe"),
    );
    push_candidate(
      user_profile_path
        .join("AppData")
        .join("Local")
        .join("Typora")
        .join("Typora.exe"),
    );
  }

  if let Ok(program_files) = std::env::var("ProgramFiles") {
    push_candidate(PathBuf::from(program_files).join("Typora").join("Typora.exe"));
  }
  if let Ok(program_files_x86) = std::env::var("ProgramFiles(x86)") {
    push_candidate(PathBuf::from(program_files_x86).join("Typora").join("Typora.exe"));
  }

  for path in query_windows_typora_from_where() {
    push_candidate(path);
  }

  for path in query_windows_typora_from_registry() {
    push_candidate(path);
  }

  candidates
}

#[cfg(target_os = "windows")]
fn query_windows_typora_from_where() -> Vec<PathBuf> {
  let output = match std::process::Command::new("where.exe").arg("typora.exe").output() {
    Ok(output) if output.status.success() => output,
    _ => return Vec::new(),
  };

  String::from_utf8_lossy(&output.stdout)
    .lines()
    .map(str::trim)
    .filter(|line| !line.is_empty())
    .map(PathBuf::from)
    .collect()
}

#[cfg(target_os = "windows")]
fn query_windows_typora_from_registry() -> Vec<PathBuf> {
  let mut result = Vec::new();
  let keys = [
    r"HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\Typora.exe",
    r"HKLM\Software\Microsoft\Windows\CurrentVersion\App Paths\Typora.exe",
    r"HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\Typora.exe",
  ];

  for key in keys {
    if let Some(path) = query_windows_registry_default_path(key) {
      result.push(path);
    }
  }

  result
}

#[cfg(target_os = "windows")]
fn query_windows_registry_default_path(key: &str) -> Option<PathBuf> {
  let output = std::process::Command::new("reg")
    .args(["query", key, "/ve"])
    .output()
    .ok()?;
  if !output.status.success() {
    return None;
  }

  let stdout = String::from_utf8_lossy(&output.stdout);
  for line in stdout.lines() {
    if let Some(index) = line.find("REG_SZ") {
      let value = line[index + "REG_SZ".len()..].trim().trim_matches('"');
      if !value.is_empty() {
        return Some(PathBuf::from(value));
      }
    }
  }
  None
}

async fn run_git_command(args: &[&str], cwd: &FsPath) -> CommandRunResult {
  match Command::new("git")
    .args(args)
    .current_dir(cwd)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .output()
    .await
  {
    Ok(output) => CommandRunResult {
      ok: output.status.success(),
      stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
      stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
      code: output.status.code(),
    },
    Err(error) => CommandRunResult {
      ok: false,
      stdout: String::new(),
      stderr: error.to_string(),
      code: None,
    },
  }
}

async fn run_git_command_with_logs(
  state: &SharedState,
  job_id: &str,
  args: &[&str],
  cwd: &FsPath,
) -> CommandRunResult {
  let command_text = format!("git {}", args.join(" "));
  append_publish_log(state, job_id, "command", format!("$ {command_text}")).await;

  let spawn_result = Command::new("git")
    .args(args)
    .current_dir(cwd)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn();

  let mut child = match spawn_result {
    Ok(child) => child,
    Err(error) => {
      let message = error.to_string();
      append_publish_log(state, job_id, "error", &message).await;
      return CommandRunResult {
        ok: false,
        stdout: String::new(),
        stderr: message,
        code: None,
      };
    }
  };

  let stdout_reader = child.stdout.take();
  let stderr_reader = child.stderr.take();

  let state_stdout = state.clone();
  let state_stderr = state.clone();
  let stdout_job = job_id.to_string();
  let stderr_job = job_id.to_string();

  let stdout_task = stdout_reader.map(|reader| {
    tokio::spawn(async move { read_stream_lines(reader, state_stdout, stdout_job, "stdout").await })
  });
  let stderr_task = stderr_reader.map(|reader| {
    tokio::spawn(async move { read_stream_lines(reader, state_stderr, stderr_job, "stderr").await })
  });

  let status = child.wait().await;
  let stdout = collect_joined_output(stdout_task).await;
  let stderr = collect_joined_output(stderr_task).await;

  match status {
    Ok(exit_status) => CommandRunResult {
      ok: exit_status.success(),
      stdout,
      stderr,
      code: exit_status.code(),
    },
    Err(error) => {
      let mut message = stderr;
      if !message.is_empty() {
        message.push('\n');
      }
      message.push_str(&error.to_string());
      append_publish_log(state, job_id, "error", error.to_string()).await;
      CommandRunResult {
        ok: false,
        stdout,
        stderr: message,
        code: None,
      }
    }
  }
}

async fn collect_joined_output(handle: Option<tokio::task::JoinHandle<String>>) -> String {
  match handle {
    Some(task) => match task.await {
      Ok(value) => value,
      Err(_) => String::new(),
    },
    None => String::new(),
  }
}

async fn read_stream_lines<R>(
  reader: R,
  state: SharedState,
  job_id: String,
  level: &'static str,
) -> String
where
  R: AsyncRead + Unpin,
{
  let mut lines = BufReader::new(reader).lines();
  let mut collected = String::new();

  while let Ok(Some(line)) = lines.next_line().await {
    let clean_line = line.trim_end_matches('\r').to_string();
    if !clean_line.is_empty() {
      append_publish_log(&state, &job_id, level, clean_line.clone()).await;
    }
    collected.push_str(&line);
    collected.push('\n');
  }

  collected.trim().to_string()
}

async fn assert_git_repository(repository_path: &FsPath) -> Result<(), ApiError> {
  let result = run_git_command(&["rev-parse", "--is-inside-work-tree"], repository_path).await;
  if result.ok && result.stdout == "true" {
    return Ok(());
  }

  Err(ApiError::bad_request("内容仓库路径不是有效的 git 仓库。"))
}

async fn list_git_conflict_files(repository_path: &FsPath) -> Vec<String> {
  let result = run_git_command(&["diff", "--name-only", "--diff-filter=U"], repository_path).await;
  if !result.ok {
    return Vec::new();
  }

  result
    .stdout
    .split('\n')
    .map(str::trim)
    .filter(|line| !line.is_empty())
    .map(ToString::to_string)
    .collect()
}

async fn has_git_staged_changes(repository_path: &FsPath) -> Result<bool, ApiError> {
  let result = run_git_command(&["diff", "--cached", "--name-only"], repository_path).await;
  if !result.ok {
    return Err(ApiError::internal(format_git_command_error(
      "git diff --cached --name-only",
      &result,
    )));
  }
  Ok(!result.stdout.trim().is_empty())
}

async fn has_git_working_changes(repository_path: &FsPath) -> Result<bool, ApiError> {
  let result = run_git_command(&["status", "--porcelain"], repository_path).await;
  if !result.ok {
    return Err(ApiError::internal(format_git_command_error(
      "git status --porcelain",
      &result,
    )));
  }
  Ok(!result.stdout.trim().is_empty())
}

fn format_git_command_error(command: &str, result: &CommandRunResult) -> String {
  let _exit_code = result.code;
  let details = [result.stderr.as_str(), result.stdout.as_str()]
    .iter()
    .filter_map(|value| {
      let trimmed = value.trim();
      if trimmed.is_empty() {
        None
      } else {
        Some(trimmed)
      }
    })
    .collect::<Vec<&str>>()
    .join(" | ");

  if details.is_empty() {
    format!("{command} 执行失败。")
  } else {
    format!("{command} 执行失败：{details}")
  }
}

fn get_current_datetime_label() -> String {
  Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

async fn load_path_settings_from_disk(settings_file: &FsPath) -> EditorPathSettings {
  let raw = match fs::read_to_string(settings_file).await {
    Ok(value) => value,
    Err(_) => {
      return EditorPathSettings {
        document_project_path: String::new(),
        chain_code_repo_path: String::new(),
        backup_root_path: String::new(),
      };
    }
  };

  match serde_json::from_str::<EditorPathSettings>(&raw) {
    Ok(parsed) => EditorPathSettings {
      document_project_path: parsed.document_project_path.trim().to_string(),
      chain_code_repo_path: parsed.chain_code_repo_path.trim().to_string(),
      backup_root_path: parsed.backup_root_path.trim().to_string(),
    },
    Err(_) => EditorPathSettings {
      document_project_path: String::new(),
      chain_code_repo_path: String::new(),
      backup_root_path: String::new(),
    },
  }
}

async fn save_path_settings_to_disk(
  settings_file: &FsPath,
  settings: &EditorPathSettings,
) -> Result<(), ApiError> {
  let content = serde_json::to_string_pretty(settings)
    .map_err(|error| ApiError::internal(format!("Failed to serialize path settings: {error}")))?;
  fs::write(settings_file, format!("{content}\n"))
    .await
    .map_err(|error| {
      ApiError::internal(format!(
        "Failed to write path settings {}: {error}",
        settings_file.display()
      ))
    })?;
  Ok(())
}

fn to_path_settings_response(settings: &EditorPathSettings) -> PathSettingsResponse {
  if settings.document_project_path.trim().is_empty() {
    return PathSettingsResponse {
      document_project_path: String::new(),
      chain_code_repo_path: settings.chain_code_repo_path.trim().to_string(),
      backup_root_path: settings.backup_root_path.trim().to_string(),
      docs_source_dir: String::new(),
      home_index_file: String::new(),
    };
  }

  if let Ok(paths) = resolve_runtime_content_paths(settings, false) {
    return PathSettingsResponse {
      document_project_path: paths.document_project_path.to_string_lossy().to_string(),
      chain_code_repo_path: settings.chain_code_repo_path.trim().to_string(),
      backup_root_path: settings.backup_root_path.trim().to_string(),
      docs_source_dir: paths.docs_source_dir.to_string_lossy().to_string(),
      home_index_file: paths.home_index_file.to_string_lossy().to_string(),
    };
  }

  PathSettingsResponse {
    document_project_path: settings.document_project_path.trim().to_string(),
    chain_code_repo_path: settings.chain_code_repo_path.trim().to_string(),
    backup_root_path: settings.backup_root_path.trim().to_string(),
    docs_source_dir: String::new(),
    home_index_file: String::new(),
  }
}

fn normalize_required_path(value: &str, field_name: &str) -> Result<String, ApiError> {
  let trimmed = value.trim();
  if trimmed.is_empty() {
    return Err(ApiError::bad_request(format!("{field_name} is required.")));
  }
  Ok(trimmed.to_string())
}

fn normalize_optional_path(value: Option<&str>) -> String {
  value.map(str::trim).unwrap_or_default().to_string()
}

fn resolve_runtime_content_paths(
  settings: &EditorPathSettings,
  require_chain_repo: bool,
) -> Result<RuntimeContentPaths, ApiError> {
  let document_project_raw = settings.document_project_path.trim();
  if document_project_raw.is_empty() {
    return Err(ApiError::bad_request(
      "Content repository path is not configured. Please set it in settings first.",
    ));
  }

  let chain_repo_raw = settings.chain_code_repo_path.trim();
  if require_chain_repo && chain_repo_raw.is_empty() {
    return Err(ApiError::bad_request(
      "Deploy repository path is not configured. Please set it in settings first.",
    ));
  }

  let document_project_path = absolutize_path(document_project_raw)?;
  let chain_code_repo_path = if chain_repo_raw.is_empty() {
    PathBuf::new()
  } else {
    absolutize_path(chain_repo_raw)?
  };

  Ok(RuntimeContentPaths {
    docs_source_dir: document_project_path.join("docs"),
    home_index_file: document_project_path.join("_index.md"),
    document_project_path,
    chain_code_repo_path,
  })
}

fn resolve_backup_root_path(settings: &EditorPathSettings) -> Result<PathBuf, ApiError> {
  let backup_root_raw = settings.backup_root_path.trim();
  if backup_root_raw.is_empty() {
    return Err(ApiError::bad_request(
      "Backup root path is not configured. Please set it in settings first.",
    ));
  }

  absolutize_path(backup_root_raw)
}

fn absolutize_path(value: &str) -> Result<PathBuf, ApiError> {
  let path = PathBuf::from(value);
  if path.is_absolute() {
    return Ok(path);
  }

  std::env::current_dir()
    .map(|cwd| cwd.join(path))
    .map_err(|error| ApiError::internal(format!("Failed to resolve relative path: {error}")))
}

async fn path_is_directory(path: &FsPath) -> bool {
  fs::metadata(path)
    .await
    .map(|metadata| metadata.is_dir())
    .unwrap_or(false)
}

async fn path_is_file(path: &FsPath) -> bool {
  fs::metadata(path)
    .await
    .map(|metadata| metadata.is_file())
    .unwrap_or(false)
}

async fn path_exists(path: &FsPath) -> bool {
  fs::metadata(path).await.is_ok()
}

fn collect_backup_items(source_root: &FsPath) -> Result<(Vec<BackupCopyItem>, u64, u64, u64), ApiError> {
  let mut items = Vec::new();
  let mut file_count = 0_u64;
  let mut directory_count = 0_u64;
  let mut total_bytes = 0_u64;

  for entry_result in WalkDir::new(source_root).follow_links(false) {
    let entry =
      entry_result.map_err(|error| ApiError::internal(format!("Failed to scan path: {error}")))?;
    let entry_path = entry.path();
    if entry_path == source_root {
      continue;
    }

    let relative_path = entry_path
      .strip_prefix(source_root)
      .map_err(|error| ApiError::internal(format!("Failed to resolve relative backup path: {error}")))?
      .to_path_buf();

    if entry.file_type().is_dir() {
      directory_count += 1;
      items.push(BackupCopyItem {
        source_path: entry_path.to_path_buf(),
        relative_path,
        is_dir: true,
        size: 0,
      });
      continue;
    }

    if !entry.file_type().is_file() {
      continue;
    }

    let size = entry
      .metadata()
      .map_err(|error| {
        ApiError::internal(format!(
          "Failed to inspect metadata for {}: {error}",
          entry_path.display()
        ))
      })?
      .len();
    file_count += 1;
    total_bytes += size;
    items.push(BackupCopyItem {
      source_path: entry_path.to_path_buf(),
      relative_path,
      is_dir: false,
      size,
    });
  }

  Ok((items, file_count, directory_count, total_bytes))
}

async fn locate_dist_dir(project_root: &FsPath) -> Option<PathBuf> {
  let mut candidates = vec![
    project_root.to_path_buf(),
    project_root.join("_up_"),
    project_root.join("resources"),
    project_root.join("Resources"),
  ];

  if let Some(parent) = project_root.parent() {
    candidates.push(parent.to_path_buf());
    candidates.push(parent.join("_up_"));
  }

  for candidate_root in candidates {
    let candidate_dist = candidate_root.join("dist");
    if path_is_directory(&candidate_dist).await {
      return Some(candidate_dist);
    }

    let candidate_index = candidate_root.join("index.html");
    if path_is_file(&candidate_index).await {
      return Some(candidate_root);
    }
  }

  None
}

async fn assert_directory_exists(path: &FsPath, label: &str) -> Result<(), ApiError> {
  let metadata = fs::metadata(path).await.map_err(|_| {
    ApiError::not_found(format!("{label} does not exist: {}", path.display()))
  })?;
  if !metadata.is_dir() {
    return Err(ApiError::bad_request(format!(
      "{label} is not a directory: {}",
      path.display()
    )));
  }
  Ok(())
}

async fn ensure_directory_exists(path: &FsPath, label: &str) -> Result<(), ApiError> {
  fs::create_dir_all(path).await.map_err(|error| {
    ApiError::internal(format!("Failed to create {label} {}: {error}", path.display()))
  })?;
  assert_directory_exists(path, label).await
}

async fn assert_file_exists(path: &FsPath, label: &str) -> Result<(), ApiError> {
  let metadata = fs::metadata(path).await.map_err(|_| {
    ApiError::not_found(format!("{label} does not exist: {}", path.display()))
  })?;
  if !metadata.is_file() {
    return Err(ApiError::bad_request(format!(
      "{label} is not a file: {}",
      path.display()
    )));
  }
  Ok(())
}

fn bytes_response(content_type: &'static str, body: Vec<u8>) -> Response {
  let mut headers = HeaderMap::new();
  headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
  (headers, body).into_response()
}

fn content_type_for_path(path: &FsPath) -> &'static str {
  let extension = path
    .extension()
    .and_then(|value| value.to_str())
    .unwrap_or_default()
    .to_ascii_lowercase();
  match extension.as_str() {
    "html" => "text/html; charset=utf-8",
    "js" => "application/javascript; charset=utf-8",
    "css" => "text/css; charset=utf-8",
    "json" => "application/json; charset=utf-8",
    "svg" => "image/svg+xml",
    "png" => "image/png",
    "jpg" | "jpeg" => "image/jpeg",
    "ico" => "image/x-icon",
    "woff" => "font/woff",
    "woff2" => "font/woff2",
    "txt" => "text/plain; charset=utf-8",
    _ => "application/octet-stream",
  }
}

fn normalize_static_path(path: &str) -> Option<String> {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return Some("index.html".to_string());
  }

  let mut segments = Vec::new();
  for segment in trimmed.split('/') {
    let clean = segment.trim();
    if clean.is_empty() || clean == "." || clean == ".." {
      return None;
    }
    segments.push(clean.to_string());
  }

  if segments.is_empty() {
    return Some("index.html".to_string());
  }

  Some(segments.join("/"))
}

fn resolve_under_root(root: &FsPath, relative_path: &str) -> Result<PathBuf, ApiError> {
  let mut target = root.to_path_buf();
  if !relative_path.is_empty() {
    for segment in relative_path.split('/') {
      target.push(segment);
    }
  }

  let normalized_root = normalize_for_compare(root);
  let normalized_target = normalize_for_compare(&target);
  let separator = std::path::MAIN_SEPARATOR.to_string();
  let root_prefix = format!("{normalized_root}{separator}");

  if normalized_target != normalized_root && !normalized_target.starts_with(&root_prefix) {
    return Err(ApiError::bad_request("Path is outside docs root."));
  }

  Ok(target)
}

fn normalize_for_compare(path: &FsPath) -> String {
  let normalized = path.components().collect::<PathBuf>().to_string_lossy().to_string();
  if cfg!(windows) {
    normalized.to_lowercase()
  } else {
    normalized
  }
}

fn to_safe_relative_path(value: &str, field_name: &str, allow_empty: bool) -> Result<String, ApiError> {
  let normalized = value
    .replace('\\', "/")
    .trim()
    .trim_start_matches('/')
    .to_string();

  if normalized.is_empty() {
    if allow_empty {
      return Ok(String::new());
    }
    return Err(ApiError::bad_request(format!("{field_name} is required.")));
  }

  let mut segments = Vec::new();
  for segment in normalized.split('/') {
    if segment.is_empty() || segment == "." || segment == ".." {
      return Err(ApiError::bad_request(format!("Invalid {field_name}.")));
    }
    segments.push(segment.to_string());
  }

  Ok(segments.join("/"))
}

fn assert_markdown_article_path(relative_path: &str) -> Result<(), ApiError> {
  if relative_path.to_ascii_lowercase().ends_with(".md") {
    Ok(())
  } else {
    Err(ApiError::bad_request("Only markdown files are supported."))
  }
}

fn to_safe_file_name(file_name: &str) -> Result<String, ApiError> {
  let trimmed = file_name.trim();
  if trimmed.is_empty() {
    return Err(ApiError::bad_request("fileName is required."));
  }

  let mut raw = trimmed.to_string();
  if raw.to_ascii_lowercase().ends_with(".md") {
    raw.truncate(raw.len().saturating_sub(3));
  }

  let mut normalized = String::with_capacity(raw.len());
  for character in raw.chars() {
    let mapped = match character {
      '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
      c if c.is_whitespace() => '-',
      c => c,
    };
    normalized.push(mapped);
  }

  while normalized.contains("--") {
    normalized = normalized.replace("--", "-");
  }
  while normalized.starts_with('.') {
    normalized.remove(0);
  }
  while normalized.ends_with('.') || normalized.ends_with(' ') {
    normalized.pop();
  }

  if normalized.trim().is_empty() {
    return Err(ApiError::bad_request("Invalid fileName."));
  }

  Ok(format!("{normalized}.md"))
}

fn normalize_title(value: Option<&str>, fallback: &str) -> String {
  value
    .map(str::trim)
    .filter(|title| !title.is_empty())
    .unwrap_or(fallback)
    .to_string()
}

fn strip_markdown_extension(file_name: &str) -> String {
  if file_name.to_ascii_lowercase().ends_with(".md") {
    file_name[..file_name.len().saturating_sub(3)].to_string()
  } else {
    file_name.to_string()
  }
}

fn build_article_template(title: &str) -> String {
  ARTICLE_TEMPLATE.replace("__TITLE__", &escape_yaml_string(title))
}

fn escape_yaml_string(value: &str) -> String {
  value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn join_posix(parts: &[&str]) -> String {
  parts
    .iter()
    .filter_map(|part| {
      let clean = part.replace('\\', "/");
      let trimmed = clean.trim_matches('/');
      if trimmed.is_empty() {
        None
      } else {
        Some(trimmed.to_string())
      }
    })
    .collect::<Vec<String>>()
    .join("/")
}

fn posix_basename(value: &str) -> &str {
  value.rsplit('/').next().unwrap_or(value)
}

fn build_section_sync(abs_dir: &FsPath, rel_dir: &str) -> Result<ContentNode, ApiError> {
  let mut visible_entries: Vec<(String, PathBuf, std::fs::FileType)> = Vec::new();
  let reader = std::fs::read_dir(abs_dir).map_err(|error| {
    ApiError::internal(format!("Failed to read directory {}: {error}", abs_dir.display()))
  })?;
  for entry in reader {
    let entry = entry.map_err(|error| {
      ApiError::internal(format!("Failed to read directory entry {}: {error}", abs_dir.display()))
    })?;
    let name = entry.file_name().to_string_lossy().to_string();
    if name.starts_with('.') {
      continue;
    }
    let file_type = entry.file_type().map_err(|error| {
      ApiError::internal(format!(
        "Failed to inspect directory entry {}: {error}",
        entry.path().display()
      ))
    })?;
    visible_entries.push((name, entry.path(), file_type));
  }

  let index_file_path = abs_dir.join("_index.md");
  let has_index = index_file_path.is_file();
  let index_meta = if has_index {
    let content = std::fs::read_to_string(&index_file_path).unwrap_or_default();
    parse_front_matter(&content).attrs
  } else {
    HashMap::new()
  };

  let section_title = as_string(index_meta.get("title").or(index_meta.get("tiltle"))).unwrap_or_else(|| {
    if rel_dir.is_empty() {
      "Docs".to_string()
    } else {
      FsPath::new(rel_dir)
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| rel_dir.to_string())
    }
  });
  let section_weight = as_number(index_meta.get("weight"));
  let section_flat = as_bool(index_meta.get("bookFlatSection"));
  let section_special = as_bool(index_meta.get("special")).unwrap_or(false);
  let section_index_path = if has_index && !rel_dir.is_empty() {
    Some(join_posix(&[rel_dir, "_index.md"]))
  } else {
    None
  };

  let mut children = Vec::new();
  for (name, path, file_type) in visible_entries {
    if file_type.is_dir() {
      let next_rel = join_posix(&[rel_dir, &name]);
      let section = build_section_sync(&path, &next_rel)?;
      let has_children = section
        .children
        .as_ref()
        .map(|items| !items.is_empty())
        .unwrap_or(false);
      if has_children || section.special.unwrap_or(false) {
        children.push(section);
      }
      continue;
    }

    if !file_type.is_file() {
      continue;
    }

    if !name.to_ascii_lowercase().ends_with(".md") || name == "_index.md" {
      continue;
    }

    let rel_file_path = join_posix(&[rel_dir, &name]);
    let article_content = std::fs::read_to_string(&path).map_err(|error| {
      ApiError::internal(format!("Failed to read markdown file {}: {error}", path.display()))
    })?;
    let article_meta = parse_front_matter(&article_content).attrs;
    let title = as_string(article_meta.get("title")).unwrap_or_else(|| remove_extension(&name));

    children.push(ContentNode {
      key: format!("article:{rel_file_path}"),
      node_type: "article".to_string(),
      title,
      path: Some(rel_file_path),
      index_path: None,
      special: None,
      weight: as_number(article_meta.get("weight")),
      book_flat_section: None,
      children: None,
    });
  }

  children.sort_by(sort_content_nodes);

  Ok(ContentNode {
    key: format!(
      "section:{}",
      if rel_dir.is_empty() { "root" } else { rel_dir }
    ),
    node_type: "section".to_string(),
    title: section_title,
    path: if rel_dir.is_empty() {
      None
    } else {
      Some(rel_dir.to_string())
    },
    index_path: section_index_path,
    special: Some(section_special),
    weight: section_weight,
    book_flat_section: section_flat,
    children: Some(children),
  })
}

fn sort_content_nodes(left: &ContentNode, right: &ContentNode) -> CmpOrdering {
  if left.node_type != right.node_type {
    if left.node_type == "section" {
      return CmpOrdering::Less;
    }
    return CmpOrdering::Greater;
  }

  let left_weight = left.weight.unwrap_or(i64::MAX);
  let right_weight = right.weight.unwrap_or(i64::MAX);
  if left_weight != right_weight {
    return left_weight.cmp(&right_weight);
  }

  left.title.to_lowercase().cmp(&right.title.to_lowercase())
}

fn parse_front_matter(content: &str) -> FrontMatter {
  let normalized = content.replace("\r\n", "\n");
  let mut lines = normalized.lines();
  let first = lines.next().unwrap_or_default();
  if first.trim() != "---" {
    return FrontMatter::default();
  }

  let mut attrs = HashMap::new();
  let mut closed = false;
  for raw_line in lines {
    let line = raw_line.trim();
    if line == "---" {
      closed = true;
      break;
    }
    if line.is_empty() || line.starts_with('#') {
      continue;
    }
    if let Some((key, value)) = split_front_matter_line(line) {
      attrs.insert(key.to_string(), normalize_front_matter_value(value));
    }
  }

  if !closed {
    return FrontMatter::default();
  }
  FrontMatter { attrs }
}

fn split_front_matter_line(line: &str) -> Option<(&str, &str)> {
  let mut parts = line.splitn(2, ':');
  let key = parts.next()?.trim();
  let value = parts.next()?.trim();
  if key.is_empty() || value.is_empty() {
    return None;
  }
  Some((key, value))
}

fn normalize_front_matter_value(value: &str) -> FrontMatterValue {
  if value.len() >= 2
    && ((value.starts_with('"') && value.ends_with('"'))
      || (value.starts_with('\'') && value.ends_with('\'')))
  {
    return FrontMatterValue::String(value[1..value.len().saturating_sub(1)].to_string());
  }

  if let Ok(number) = value.parse::<i64>() {
    return FrontMatterValue::Number(number);
  }

  if value.eq_ignore_ascii_case("true") {
    return FrontMatterValue::Bool(true);
  }
  if value.eq_ignore_ascii_case("false") {
    return FrontMatterValue::Bool(false);
  }

  FrontMatterValue::String(value.to_string())
}

fn as_string(value: Option<&FrontMatterValue>) -> Option<String> {
  match value {
    Some(FrontMatterValue::String(content)) if !content.trim().is_empty() => {
      Some(content.trim().to_string())
    }
    _ => None,
  }
}

fn as_number(value: Option<&FrontMatterValue>) -> Option<i64> {
  match value {
    Some(FrontMatterValue::Number(number)) => Some(*number),
    _ => None,
  }
}

fn as_bool(value: Option<&FrontMatterValue>) -> Option<bool> {
  match value {
    Some(FrontMatterValue::Bool(flag)) => Some(*flag),
    _ => None,
  }
}

fn remove_extension(file_name: &str) -> String {
  if file_name.to_ascii_lowercase().ends_with(".md") {
    file_name[..file_name.len().saturating_sub(3)].to_string()
  } else {
    file_name.to_string()
  }
}

