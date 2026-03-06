# SoloLog Client (Vue + Tauri 2)

SoloLog 桌面客户端，前端为 `Vue 3 + Vite + TypeScript`，桌面壳与本地 API 由 `Tauri 2 + Rust` 提供。

## 关键能力

- 本地读取 `document` 仓库内容：`/content/*`
- 编辑模式：新建 / 修改 / 移动 / 删除文章
- 一键发布：`git pull -> git add . -> git commit -> git push`
- 发布过程实时日志轮询展示（含冲突提示）

## 环境准备

### Windows（NSIS 打包）

1. 安装 Node.js 18+
2. 安装 Rust stable（MSVC）
3. 安装 Visual Studio C++ Build Tools
4. 安装 WebView2 Runtime（Windows 11 通常已内置）

### macOS（arm64 打包）

1. 安装 Node.js 18+
2. 安装 Xcode Command Line Tools：`xcode-select --install`
3. 安装 Rust stable：`rustup default stable`
4. 添加 arm64 目标：`rustup target add aarch64-apple-darwin`

### 自检命令

```bash
rustc --version
cargo --version
npm --version
```

## 安装依赖

```bash
npm install --cache .npm-cache
```

## 开发运行

### Web 模式（Vite）

```bash
npm run dev
```

### Tauri 桌面模式

```bash
npm run tauri:dev
```

## 打包

### Windows NSIS（必达）

```bash
npm run pack:win
```

产物目录（默认）：

- `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`

### macOS arm64

```bash
npm run pack:mac
```

产物目录（默认）：

- `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/`

## 路径设置说明

- 首次启动路径默认为空
- 需在客户端状态栏设置：
  - `documentProjectPath`
  - `chainCodeRepoPath`
- 设置保存在 Tauri 用户数据目录：`.sololog-paths.json`

## 一键发布说明

- 执行顺序：`git pull` -> `git add .` -> `git commit` -> `git push`
- 若 `git pull` 发生冲突，会返回冲突状态与冲突文件列表
- 若 `git pull` 后仓库无变更，会直接结束并跳过 add/commit/push
- 提交信息格式：`docs: update YYYY-MM-DD HH:mm:ss`

## 注意事项

- 运行机器需可执行 `git`，且对 `document` 仓库有推送权限
- `_index.md` 在编辑模式下不允许直接保存（保持当前策略）
