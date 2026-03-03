# SoloLog Client

SoloLog 客户端项目，基于 `Vue 3 + Vite + TypeScript`。

首页左侧目录由本机 `document/docs` 自动生成，点击文章可查看 Markdown 内容。

## Tech Stack

- Vue 3
- Vue Router 4
- Pinia
- Axios
- Markdown-It
- ESLint

## 启动前准备

默认数据来源：

- `C:/Users/tianzhiwei/Desktop/document/docs`
- `C:/Users/tianzhiwei/Desktop/document/_index.md`

可通过环境变量覆盖：

- `DOCS_SOURCE_DIR`
- `HOME_INDEX_FILE`

## 快速开始

```bash
npm install
npm run dev
```

`npm run dev` / `npm run build` 都会先自动执行 `npm run prepare:content`：

1. 根据 `docs` 目录生成左侧目录树数据。
2. 把 markdown 和资源复制到 `public/content`。
3. 首页点击文章时按路径读取并渲染内容。

## 可用命令

```bash
npm run prepare:content  # 生成目录树 + 同步文章内容
npm run dev              # 开发
npm run build            # 生成内容 + 类型检查 + 构建
npm run preview          # 预览构建产物
npm run lint             # ESLint
```
