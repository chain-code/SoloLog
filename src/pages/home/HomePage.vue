<template>
  <div
    class="book-root"
    :class="{ 'no-toc-panel': !showTocPanel }"
  >
    <input
      id="menu-control"
      class="hidden toggle"
      type="checkbox"
    >
    <input
      id="toc-control"
      class="hidden toggle"
      type="checkbox"
    >

    <div class="mode-bar-shell">
      <header class="mode-bar">
        <div class="mode-icon-group">
          <span
            class="mode-icon-wrap"
            data-tip="阅读模式"
          >
            <button
              type="button"
              class="mode-icon-button"
              :class="{ active: !isEditMode }"
              aria-label="阅读模式"
              @click="setMode('read')"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4.5 6.2C7.4 4.5 10.3 4 12 4s4.6.5 7.5 2.2V19c-2.8-1.7-5.8-2.2-7.5-2.2S7.3 17.3 4.5 19V6.2z"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linejoin="round"
                />
                <path
                  d="M12 4v12.8"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </span>

          <span
            class="mode-icon-wrap"
            :data-tip="editModeTooltip"
          >
            <button
              type="button"
              class="mode-icon-button"
              :class="{ active: isEditMode }"
              :disabled="!editorApiEnabled"
              aria-label="编辑模式"
              @click="setMode('edit')"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4 20h4.2L19 9.2a2 2 0 0 0 0-2.8l-1.4-1.4a2 2 0 0 0-2.8 0L4 15.8V20z"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linejoin="round"
                />
                <path
                  d="M13.6 6.4l4 4"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </span>

          <template v-if="isEditMode">
            <span
              class="mode-icon-wrap"
              :data-tip="resetActionTooltip"
            >
              <button
                type="button"
                class="mode-icon-button"
                :disabled="!editorDirty || operationBusy"
                aria-label="重置修改"
                @click="resetEditorContent"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M8 7H4v4"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path
                    d="M20 11a8 8 0 1 0-2.4 5.7"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
            </span>

            <span
              class="mode-icon-wrap"
              :data-tip="saveActionTooltip"
            >
              <button
                type="button"
                class="mode-icon-button"
                :class="{ active: canSaveCurrentArticle }"
                :disabled="!canSaveCurrentArticle"
                aria-label="保存修改"
                @click="saveCurrentArticle"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M5 4h12l2 2v14H5V4z"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linejoin="round"
                  />
                  <path
                    d="M8 4v6h8V4"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linejoin="round"
                  />
                  <path
                    d="M9 15h6"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
            </span>
          </template>

          <span
            class="mode-icon-wrap"
            :data-tip="pathSettingsTooltip"
          >
            <button
              type="button"
              class="mode-icon-button"
              :disabled="!editorApiEnabled || operationBusy || settingsSaving"
              aria-label="路径设置"
              @click="openPathSettingsDialog"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M10.8 3.2h2.4l.5 2.2a7 7 0 0 1 1.7.7l1.9-1.2 1.7 1.7-1.2 1.9a7 7 0 0 1 .7 1.7l2.2.5v2.4l-2.2.5a7 7 0 0 1-.7 1.7l1.2 1.9-1.7 1.7-1.9-1.2a7 7 0 0 1-1.7.7l-.5 2.2h-2.4l-.5-2.2a7 7 0 0 1-1.7-.7l-1.9 1.2-1.7-1.7 1.2-1.9a7 7 0 0 1-.7-1.7l-2.2-.5v-2.4l2.2-.5a7 7 0 0 1 .7-1.7l-1.2-1.9 1.7-1.7 1.9 1.2a7 7 0 0 1 1.7-.7l.5-2.2z"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linejoin="round"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="2.5"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
              </svg>
            </button>
          </span>

          <span
            class="mode-icon-wrap"
            :data-tip="publishTooltip"
          >
            <button
              type="button"
              class="mode-icon-button"
              :disabled="!editorApiEnabled || operationBusy || settingsSaving || publishBusy"
              aria-label="一键上传文档"
              @click="openPublishDialog"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M12 15V5"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                />
                <path
                  d="M8.8 8.2 12 5l3.2 3.2"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <path
                  d="M5 14.5v3.2A1.3 1.3 0 0 0 6.3 19h11.4a1.3 1.3 0 0 0 1.3-1.3v-3.2"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </span>
        </div>
      </header>
    </div>

    <main class="container flex">
      <aside class="book-menu">
        <div class="book-menu-content">
          <nav>
            <h2 class="book-brand">
              <a
                class="flex align-center"
                href="/"
                @click.prevent="openHome"
              >
                <img
                  src="/logo.png"
                  alt="Logo"
                >
                <span>Soulmate</span>
              </a>
            </h2>

            <div class="book-search">
              <input
                v-model.trim="searchKeyword"
                type="text"
                placeholder="Search article titles"
                aria-label="Search"
              >
            </div>

            <p
              v-if="menuErrorMessage"
              class="menu-tip menu-tip-error"
            >
              {{ menuErrorMessage }}
            </p>

            <ContentTree
              v-else-if="filteredTree.length > 0"
              :nodes="filteredTree"
              :active-path="currentArticlePath"
              :open-keys="openKeys"
              :force-open="isSearching"
              :edit-mode="isEditMode"
              @toggle="toggleSection"
              @select="openArticle"
              @create-article="openCreateDialog"
              @move-article="moveArticle"
              @delete-article="confirmDeleteArticle"
            />

            <p
              v-else
              class="menu-tip"
            >
              No matched articles
            </p>
          </nav>
        </div>
      </aside>

      <div
        class="book-page"
        :class="{ 'special-article': isSpecialArticle }"
      >
        <div
          v-if="!isSpecialArticle"
          class="reading-progress"
          aria-hidden="true"
        >
          <span :style="{ width: `${readingProgress}%` }" />
        </div>

        <p
          v-if="editorErrorMessage"
          class="mode-alert error"
        >
          {{ editorErrorMessage }}
        </p>
        <p
          v-else-if="editorSuccessMessage"
          class="mode-alert success"
        >
          {{ editorSuccessMessage }}
        </p>

        <header class="book-header">
          <div class="flex align-center justify-between">
            <label for="menu-control">
              <img
                src="/svg/menu.svg"
                class="book-icon"
                alt="Menu"
              >
            </label>

            <strong>{{ currentTitle }}</strong>

            <label
              v-if="showTocPanel"
              for="toc-control"
            >
              <img
                src="/svg/toc.svg"
                class="book-icon"
                alt="Table of Contents"
              >
            </label>
            <span
              v-else
              class="book-header-spacer"
              aria-hidden="true"
            />
          </div>

          <aside
            v-if="showTocPanel"
            class="hidden clearfix"
          >
            <template v-if="tocItems.length > 0">
              <button
                v-for="item in tocItems"
                :key="item.id"
                type="button"
                class="toc-mobile-link"
                :class="{ active: item.id === activeTocId, [`lv-${item.level}`]: true }"
                @click="openToc(item)"
              >
                {{ item.text }}
              </button>
            </template>
            <p
              v-else
              class="toc-mobile-item"
            >
              No headings in current article
            </p>
          </aside>
        </header>

        <article
          ref="articleRef"
          class="markdown"
        >
          <Transition
            name="fade-content"
            mode="out-in"
            @after-enter="handleContentAfterEnter"
          >
            <div
              v-if="loading"
              key="loading"
              class="loading-skeleton"
              role="status"
              aria-live="polite"
            >
              <span class="s-line w-80" />
              <span class="s-line w-60" />
              <span class="s-line w-95" />
              <span class="s-line w-70" />
              <span class="s-line w-90" />
            </div>

            <p
              v-else-if="errorMessage"
              key="error"
              class="state-banner state-banner-error"
            >
              {{ errorMessage }}
            </p>

            <textarea
              v-else-if="isEditMode && canEditCurrentArticle"
              :key="`editor-${currentArticlePath}`"
              ref="editorTextareaRef"
              v-model="editableMarkdownBody"
              class="markdown-inner markdown-editor"
              spellcheck="false"
              @input="markEditorDirty"
            />

            <div
              v-else
              :key="`article-${currentArticlePath || 'home'}`"
              class="markdown-inner"
              :class="{ 'special-markdown': isSpecialArticle }"
              v-html="renderedHtml"
            />
          </Transition>
        </article>

        <footer
          v-if="!isSpecialArticle"
          class="book-footer"
        >
          <div class="flex flex-wrap justify-between">
            <span>{{ currentTitle }}</span>
            <span>{{ currentArticlePath || "_index.md" }}</span>
          </div>
        </footer>

        <label
          for="menu-control"
          class="hidden book-menu-overlay"
        />
      </div>

      <aside
        v-if="showTocPanel"
        class="book-toc"
      >
        <div class="book-toc-content">
          <p class="toc-title">
            On This Page
          </p>

          <ul
            v-if="tocItems.length > 0"
            class="toc-list"
          >
            <li
              v-for="item in tocItems"
              :key="item.id"
            >
              <button
                type="button"
                class="toc-link"
                :class="{ active: item.id === activeTocId, [`lv-${item.level}`]: true }"
                @click="openToc(item)"
              >
                {{ item.text }}
              </button>
            </li>
          </ul>

          <p
            v-else
            class="toc-empty"
          >
            No headings in current article
          </p>

          <p class="toc-item muted">
            From: {{ docsSourceDirLabel }}
          </p>
        </div>
      </aside>
    </main>

    <Transition name="fade-content">
      <div
        v-if="createDialogVisible"
        class="dialog-overlay"
        @click.self="closeCreateDialog"
      >
        <section class="dialog-card">
          <h3>在 {{ createDialogSectionTitle }} 新建文章</h3>
          <p>请输入文件名，标题会与文件名保持一致，文件会直接写入 document/docs。</p>

          <label class="dialog-label">
            文件名
            <input
              v-model.trim="createDialogFileName"
              type="text"
              placeholder="例如：ascend-910b"
            >
          </label>

          <div class="dialog-actions">
            <button
              type="button"
              class="dialog-action ghost"
              :disabled="operationBusy"
              @click="closeCreateDialog"
            >
              取消
            </button>
            <button
              type="button"
              class="dialog-action primary"
              :disabled="operationBusy"
              @click="createArticle"
            >
              {{ operationBusy ? "创建中..." : "创建文章" }}
            </button>
          </div>
        </section>
      </div>
    </Transition>

    <Transition name="fade-content">
      <div
        v-if="pathSettingsDialogVisible"
        class="dialog-overlay"
        @click.self="closePathSettingsDialog"
      >
        <section class="dialog-card">
          <h3>项目路径设置</h3>
          <p>设置 document 与 chain-code.github.io 项目路径后，将自动刷新内容。</p>

          <label class="dialog-label">
            document 项目路径
            <input
              v-model.trim="pathSettingsDocumentProjectPath"
              type="text"
              placeholder="例如：C:/Users/tianzhiwei/Desktop/document"
            >
          </label>

          <label class="dialog-label">
            chain-code.github.io 项目路径
            <input
              v-model.trim="pathSettingsChainCodeRepoPath"
              type="text"
              placeholder="例如：C:/Users/tianzhiwei/go/src/chain-code.github.io"
            >
          </label>

          <p
            v-if="pathSettingsErrorMessage"
            class="dialog-tip error"
          >
            {{ pathSettingsErrorMessage }}
          </p>

          <div class="dialog-actions">
            <button
              type="button"
              class="dialog-action ghost"
              :disabled="settingsSaving"
              @click="closePathSettingsDialog"
            >
              取消
            </button>
            <button
              type="button"
              class="dialog-action primary"
              :disabled="settingsSaving"
              @click="savePathSettings"
            >
              {{ settingsSaving ? "保存中..." : "保存设置" }}
            </button>
          </div>
        </section>
      </div>
    </Transition>

    <Transition name="fade-content">
      <div
        v-if="publishDialogVisible"
        class="dialog-overlay"
        @click.self="closePublishDialog"
      >
        <section class="dialog-card">
          <h3>一键上传文档</h3>
          <p>按顺序执行 git pull → git add . → git commit → git push，并实时显示命令行输出。</p>

          <p class="dialog-tip muted">
            当前仓库：{{ pathSettingsDocumentProjectPath || "未设置" }}
          </p>

          <div class="publish-steps">
            <span :class="['publish-step', publishJobStage === 'pull' || publishJobStage === 'done' ? 'active' : '']">pull</span>
            <span :class="['publish-step', ['add', 'commit', 'push', 'done'].includes(publishJobStage) ? 'active' : '']">add</span>
            <span :class="['publish-step', ['commit', 'push', 'done'].includes(publishJobStage) ? 'active' : '']">commit</span>
            <span :class="['publish-step', ['push', 'done'].includes(publishJobStage) ? 'active' : '']">push</span>
          </div>

          <p
            v-if="publishErrorMessage"
            class="dialog-tip error"
          >
            {{ publishErrorMessage }}
          </p>

          <p
            v-else-if="publishMessage"
            class="dialog-tip success"
          >
            {{ publishMessage }}
          </p>

          <p
            v-if="publishCommitMessage"
            class="dialog-tip muted"
          >
            Commit: {{ publishCommitMessage }}
          </p>

          <div
            v-if="publishConflictFiles.length > 0"
            class="dialog-conflicts"
          >
            <p class="dialog-conflicts-title">
              冲突文件（请先手动解决）：
            </p>
            <ul class="dialog-conflict-list">
              <li
                v-for="item in publishConflictFiles"
                :key="item"
              >
                {{ item }}
              </li>
            </ul>
          </div>

          <div
            ref="publishTerminalRef"
            class="publish-terminal"
          >
            <p
              v-if="publishLogs.length === 0"
              class="publish-terminal-empty"
            >
              点击“开始上传”后显示实时日志。
            </p>
            <p
              v-for="log in publishLogs"
              :key="log.id"
              :class="['publish-log-line', `lv-${log.level}`]"
            >
              <span class="publish-log-time">{{ formatPublishLogTime(log.time) }}</span>
              <span class="publish-log-text">{{ log.text }}</span>
            </p>
          </div>

          <div class="dialog-actions">
            <button
              type="button"
              class="dialog-action ghost"
              :disabled="publishBusy"
              @click="closePublishDialog"
            >
              取消
            </button>
            <button
              type="button"
              class="dialog-action primary"
              :disabled="publishBusy && publishJobStatus === 'running'"
              @click="runPublish"
            >
              {{ publishPrimaryActionLabel }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import MarkdownIt from "markdown-it";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ContentTree from "@/components/content/ContentTree.vue";
import {
  createArticleInSection,
  deleteArticleByPath,
  moveArticleToSection,
  saveArticleMarkdown,
} from "@/services/modules/editor";
import {
  fetchArticleMarkdown,
  fetchContentTree,
  fetchHomeMarkdown,
} from "@/services/modules/content";
import {
  fetchPublishJob,
  type PublishJobSnapshot,
  startPublishDocumentRepo,
  PublishRunningError,
} from "@/services/modules/publish";
import { fetchEditorPathSettings, saveEditorPathSettings } from "@/services/modules/settings";
import type { ContentNode } from "@/types/content";
import type { TocItem } from "@/types/toc";

const route = useRoute();
const router = useRouter();
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

const tree = ref<ContentNode[]>([]);
const openKeys = ref<Set<string>>(new Set());
const renderedHtml = ref("");
const editableMarkdownBody = ref("");
const originalMarkdownBody = ref("");
const searchKeyword = ref("");
const loading = ref(false);
const errorMessage = ref("");
const menuErrorMessage = ref("");
const editorErrorMessage = ref("");
const editorSuccessMessage = ref("");
const operationBusy = ref(false);
const editorDirty = ref(false);
const viewMode = ref<"read" | "edit">("read");
const originalFrontMatter = ref("");
const originalLineEnding = ref<"\n" | "\r\n">("\n");
const tocItems = ref<TocItem[]>([]);
const activeTocId = ref("");
const articleRef = ref<HTMLElement | null>(null);
const editorTextareaRef = ref<HTMLTextAreaElement | null>(null);
const readingProgress = ref(0);
const createDialogVisible = ref(false);
const createDialogSectionPath = ref("");
const createDialogSectionTitle = ref("");
const createDialogFileName = ref("");
const pathSettingsDialogVisible = ref(false);
const pathSettingsDocumentProjectPath = ref("");
const pathSettingsChainCodeRepoPath = ref("");
const pathSettingsErrorMessage = ref("");
const settingsSaving = ref(false);
const publishDialogVisible = ref(false);
const publishBusy = ref(false);
const publishErrorMessage = ref("");
const publishConflictFiles = ref<string[]>([]);
const publishJobId = ref("");
const publishJobStatus = ref<PublishJobSnapshot["status"] | "idle">("idle");
const publishJobStage = ref<PublishJobSnapshot["stage"]>("init");
const publishLogs = ref<PublishJobSnapshot["logs"]>([]);
const publishMessage = ref("");
const publishCommitMessage = ref("");
const publishTerminalRef = ref<HTMLElement | null>(null);
const docsSourceDirLabel = ref("document/docs");
const editorApiEnabled = import.meta.env.DEV;

let tocObserver: IntersectionObserver | null = null;
let progressRafId = 0;
let publishPollTimerId = 0;
let editorResizeRafId = 0;

const currentArticlePath = computed(() =>
  typeof route.query.article === "string" ? route.query.article : "",
);
const isSpecialArticle = computed(
  () => Boolean(currentArticlePath.value) && isSpecialIndexArticle(tree.value, currentArticlePath.value),
);
const showTocPanel = computed(() => Boolean(currentArticlePath.value) && !isSpecialArticle.value);

const currentTitle = computed(() => {
  if (!currentArticlePath.value) {
    return "Home";
  }

  return findTitleByPath(tree.value, currentArticlePath.value) ?? currentArticlePath.value;
});

const isEditMode = computed(() => viewMode.value === "edit");
const canEditCurrentArticle = computed(() => Boolean(currentArticlePath.value));
const canSaveCurrentArticle = computed(
  () => isEditMode.value && canEditCurrentArticle.value && editorDirty.value && !operationBusy.value,
);
const editModeTooltip = computed(() =>
  editorApiEnabled ? "编辑模式" : "编辑模式（仅 npm run dev 可用）",
);
const resetActionTooltip = computed(() => {
  if (operationBusy.value) {
    return "处理中";
  }

  return editorDirty.value ? "重置修改" : "暂无修改可重置";
});
const saveActionTooltip = computed(() => {
  if (operationBusy.value) {
    return "处理中";
  }

  if (!canEditCurrentArticle.value) {
    return "请先选择文章";
  }

  if (!editorDirty.value) {
    return "暂无修改可保存";
  }

  return "保存修改";
});
const pathSettingsTooltip = computed(() =>
  editorApiEnabled ? "项目路径设置" : "项目路径设置（仅 npm run dev 可用）",
);
const publishTooltip = computed(() =>
  editorApiEnabled ? "一键上传文档" : "一键上传（仅 npm run dev 可用）",
);
const publishPrimaryActionLabel = computed(() => {
  if (publishBusy.value) {
    return "执行中...";
  }

  if (publishJobStatus.value === "success") {
    return "再次上传";
  }

  return "开始上传";
});

const isSearching = computed(() => searchKeyword.value.trim().length > 0);
const searchKeywordNormalized = computed(() => searchKeyword.value.trim().toLowerCase());

const filteredTree = computed(() =>
  filterNodes(tree.value, searchKeywordNormalized.value),
);

watch(isEditMode, async (editing) => {
  if (!editing) {
    editorErrorMessage.value = "";
    editorSuccessMessage.value = "";
    return;
  }

  if (!canEditCurrentArticle.value) {
    editorErrorMessage.value = "编辑模式仅支持文章页面，请先选择左侧文章。";
    return;
  }

  await nextTick();
  resizeEditorHeight();
});

watch(
  [editableMarkdownBody, isEditMode, canEditCurrentArticle],
  async ([, editing, canEdit]) => {
    if (!editing || !canEdit) {
      return;
    }

    await nextTick();
    queueEditorHeightSync();
  },
  { flush: "post" },
);

watch(
  () => editorTextareaRef.value,
  (textarea) => {
    if (!textarea || !isEditMode.value || !canEditCurrentArticle.value) {
      return;
    }
    queueEditorHeightSync();
  },
  { flush: "post" },
);

onMounted(async () => {
  window.addEventListener("scroll", handleWindowScroll, { passive: true });
  window.addEventListener("resize", handleWindowScroll, { passive: true });
  await loadPathSettings();
  await loadTree();
  await loadCurrentArticle();
  updateReadingProgress();
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", handleWindowScroll);
  window.removeEventListener("resize", handleWindowScroll);
  stopPublishPolling();
  if (editorResizeRafId) {
    cancelAnimationFrame(editorResizeRafId);
    editorResizeRafId = 0;
  }
  if (progressRafId) {
    cancelAnimationFrame(progressRafId);
    progressRafId = 0;
  }
  disconnectTocObserver();
});

watch(
  () => route.query.article,
  async () => {
    expandActiveArticleAncestors();
    await loadCurrentArticle();
  },
);

watch(
  () => route.hash,
  async (hash) => {
    const anchorId = getHashId(hash);
    if (!anchorId) {
      return;
    }

    await nextTick();
    scrollToAnchor(anchorId, true);
  },
);

async function loadPathSettings() {
  if (!editorApiEnabled) {
    return;
  }

  try {
    const settings = await fetchEditorPathSettings();
    pathSettingsDocumentProjectPath.value = settings.documentProjectPath;
    pathSettingsChainCodeRepoPath.value = settings.chainCodeRepoPath;
    pathSettingsErrorMessage.value = "";
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取路径设置失败。";
    pathSettingsErrorMessage.value = message;
  }
}

function openPathSettingsDialog() {
  if (!editorApiEnabled) {
    editorErrorMessage.value = "路径设置仅在本地开发环境可用，请使用 npm run dev 启动。";
    return;
  }

  pathSettingsDialogVisible.value = true;
  pathSettingsErrorMessage.value = "";
  if (!pathSettingsDocumentProjectPath.value || !pathSettingsChainCodeRepoPath.value) {
    void loadPathSettings();
  }
}

function closePathSettingsDialog() {
  pathSettingsDialogVisible.value = false;
  pathSettingsErrorMessage.value = "";
}

function openPublishDialog() {
  if (!editorApiEnabled) {
    editorErrorMessage.value = "一键上传仅在本地开发环境可用，请使用 npm run dev 启动。";
    return;
  }

  publishDialogVisible.value = true;
  publishErrorMessage.value = "";
  publishConflictFiles.value = [];
  publishMessage.value = "";

  if (!pathSettingsDocumentProjectPath.value || !pathSettingsChainCodeRepoPath.value) {
    void loadPathSettings();
  }
}

function closePublishDialog() {
  if (publishBusy.value) {
    return;
  }

  publishDialogVisible.value = false;
  publishErrorMessage.value = "";
  publishConflictFiles.value = [];
}

async function runPublish() {
  if (!editorApiEnabled || publishBusy.value) {
    return;
  }

  if (!confirmDiscardUnsavedChanges()) {
    return;
  }

  publishBusy.value = true;
  publishErrorMessage.value = "";
  publishConflictFiles.value = [];
  publishMessage.value = "";
  publishCommitMessage.value = "";
  publishLogs.value = [];
  publishJobStatus.value = "idle";
  publishJobStage.value = "init";
  editorErrorMessage.value = "";
  editorSuccessMessage.value = "";

  try {
    const startResult = await startPublishDocumentRepo();
    publishJobId.value = startResult.jobId;
    startPublishPolling(startResult.jobId);
  } catch (error) {
    if (error instanceof PublishRunningError && error.jobId) {
      publishJobId.value = error.jobId;
      publishErrorMessage.value = error.message;
      startPublishPolling(error.jobId);
      return;
    }

    publishBusy.value = false;
    const message = error instanceof Error ? error.message : "文档上传失败。";
    publishErrorMessage.value = message;
    editorErrorMessage.value = message;
  }
}

function startPublishPolling(jobId: string) {
  stopPublishPolling();
  void syncPublishJob(jobId);
  publishPollTimerId = window.setInterval(() => {
    void syncPublishJob(jobId);
  }, 700);
}

function stopPublishPolling() {
  if (publishPollTimerId) {
    window.clearInterval(publishPollTimerId);
    publishPollTimerId = 0;
  }
}

async function syncPublishJob(jobId: string) {
  try {
    const snapshot = await fetchPublishJob(jobId);
    publishJobStatus.value = snapshot.status;
    publishJobStage.value = snapshot.stage;
    publishLogs.value = snapshot.logs ?? [];
    publishConflictFiles.value = snapshot.conflictFiles ?? [];
    publishMessage.value = snapshot.message ?? "";
    publishCommitMessage.value = snapshot.commitMessage ?? "";

    await nextTick();
    scrollPublishTerminalToBottom();

    if (snapshot.status !== "running") {
      stopPublishPolling();
      publishBusy.value = false;

      if (snapshot.status === "success") {
        editorSuccessMessage.value = snapshot.message ?? "文档上传完成。";
      } else if (snapshot.status === "conflict") {
        publishErrorMessage.value = snapshot.message ?? "git pull 出现冲突。";
        editorErrorMessage.value = "git pull 出现冲突，请先处理冲突后再上传。";
      } else if (snapshot.status === "error") {
        publishErrorMessage.value = snapshot.message ?? "上传任务执行失败。";
        editorErrorMessage.value = publishErrorMessage.value;
      }
    } else {
      publishBusy.value = true;
    }
  } catch (error) {
    stopPublishPolling();
    publishBusy.value = false;
    const message = error instanceof Error ? error.message : "读取上传进度失败。";
    publishErrorMessage.value = message;
    editorErrorMessage.value = message;
  }
}

function scrollPublishTerminalToBottom() {
  const terminal = publishTerminalRef.value;
  if (!terminal) {
    return;
  }
  terminal.scrollTop = terminal.scrollHeight;
}

function formatPublishLogTime(value: string) {
  if (!value) {
    return "--:--:--";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");
  const second = String(parsed.getSeconds()).padStart(2, "0");
  return `${hour}:${minute}:${second}`;
}

async function savePathSettings() {
  if (!editorApiEnabled || settingsSaving.value) {
    return;
  }

  if (!confirmDiscardUnsavedChanges()) {
    return;
  }

  const documentProjectPath = pathSettingsDocumentProjectPath.value.trim();
  const chainCodeRepoPath = pathSettingsChainCodeRepoPath.value.trim();
  if (!documentProjectPath || !chainCodeRepoPath) {
    pathSettingsErrorMessage.value = "请填写完整路径。";
    return;
  }

  settingsSaving.value = true;
  pathSettingsErrorMessage.value = "";
  editorErrorMessage.value = "";
  editorSuccessMessage.value = "";

  try {
    const saved = await saveEditorPathSettings({
      documentProjectPath,
      chainCodeRepoPath,
    });
    pathSettingsDocumentProjectPath.value = saved.documentProjectPath;
    pathSettingsChainCodeRepoPath.value = saved.chainCodeRepoPath;

    await router.replace({
      name: "home",
      query: {},
      hash: "",
    });
    await loadTree();
    await loadCurrentArticle();
    closePathSettingsDialog();
    editorSuccessMessage.value = "项目路径已更新。";
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存路径设置失败。";
    pathSettingsErrorMessage.value = message;
  } finally {
    settingsSaving.value = false;
  }
}

async function loadTree() {
  try {
    const treeData = await fetchContentTree();
    tree.value = treeData.nodes;
    docsSourceDirLabel.value = treeData.docsSourceDir || "document/docs";
    openKeys.value = collectDefaultOpenSectionKeys(treeData.nodes, currentArticlePath.value);
    menuErrorMessage.value = "";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load sidebar tree";
    menuErrorMessage.value = message;
  }
}

async function loadCurrentArticle() {
  loading.value = true;
  errorMessage.value = "";
  editorErrorMessage.value = "";
  disconnectTocObserver();

  try {
    const rawContent = currentArticlePath.value
      ? await fetchArticleMarkdown(currentArticlePath.value)
      : await fetchHomeMarkdown();

    const parsed = splitFrontMatter(rawContent);
    originalFrontMatter.value = parsed.frontMatter;
    originalMarkdownBody.value = parsed.body;
    editableMarkdownBody.value = parsed.body;
    originalLineEnding.value = detectLineEnding(rawContent);
    const { html, toc } = renderMarkdown(rawContent, isSpecialArticle.value);
    renderedHtml.value = html;
    tocItems.value = toc;
    activeTocId.value = toc[0]?.id ?? "";
    editorDirty.value = false;

    await nextTick();
    if (isEditMode.value && canEditCurrentArticle.value) {
      resizeEditorHeight();
    }
    observeHeadings();
    updateReadingProgress();

    const anchorId = getHashId(route.hash);
    if (anchorId) {
      scrollToAnchor(anchorId, false);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load markdown content";
    errorMessage.value = message;
    renderedHtml.value = "";
    editableMarkdownBody.value = "";
    originalMarkdownBody.value = "";
    tocItems.value = [];
    activeTocId.value = "";
    originalLineEnding.value = "\n";
    editorDirty.value = false;
  } finally {
    loading.value = false;
  }
}

function renderMarkdown(rawContent: string, specialMode = false): { html: string; toc: TocItem[] } {
  const body = stripFrontMatter(rawContent);
  if (specialMode) {
    return {
      html: renderSpecialMarkdown(body),
      toc: [],
    };
  }

  const normalizedBody = normalizeMarkdownForRender(body);
  const tokens = md.parse(normalizedBody, {});
  const toc: TocItem[] = [];
  const usedSlugs = new Map<string, number>();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== "heading_open") {
      continue;
    }

    const level = Number(token.tag.slice(1));
    if (Number.isNaN(level) || level < 1 || level > 4) {
      continue;
    }

    const inlineToken = tokens[index + 1];
    const headingText =
      inlineToken?.type === "inline" ? inlineToken.content.trim() : `Section ${index + 1}`;

    const slugBase = toSlug(headingText) || `section-${toc.length + 1}`;
    const slug = createUniqueSlug(slugBase, usedSlugs);
    token.attrSet("id", slug);

    if (level >= 2 && level <= 4) {
      toc.push({
        id: slug,
        text: headingText || `Section ${toc.length + 1}`,
        level: level as 2 | 3 | 4,
      });
    }
  }

  return {
    html: md.renderer.render(tokens, md.options, {}),
    toc,
  };
}

function renderSpecialMarkdown(content: string) {
  const withoutColumnsTag = content
    .replace(/^\s*\{\{<\s*columns\s*>\}\}\s*$/gim, "")
    .replace(/^\s*\{\{<\s*\/columns\s*>\}\}\s*$/gim, "");
  const withoutBlankHeadings = withoutColumnsTag.replace(/^\s*#\s*$/gm, "");
  const sections = withoutBlankHeadings
    .split(/^\s*<--->\s*$/gim)
    .map((section) => normalizeMarkdownForRender(section.trim()))
    .filter((section) => section.length > 0);

  if (sections.length === 0) {
    return md.render(normalizeMarkdownForRender(withoutBlankHeadings));
  }

  const sectionsHtml = sections
    .map((section) => `<section class="special-column">${md.render(section)}</section>`)
    .join("");
  return `<div class="special-columns">${sectionsHtml}</div>`;
}

function normalizeMarkdownForRender(content: string) {
  return content
    .replace(/^[ \t]*[-+*][ \t]*$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

function createUniqueSlug(base: string, usedSlugs: Map<string, number>) {
  const count = usedSlugs.get(base) ?? 0;
  usedSlugs.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function toSlug(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function observeHeadings() {
  disconnectTocObserver();

  if (tocItems.value.length === 0) {
    return;
  }

  const headingElements = tocItems.value
    .map((item) => document.getElementById(item.id))
    .filter((element): element is HTMLElement => Boolean(element));

  if (headingElements.length === 0) {
    return;
  }

  const visibleHeadingTops = new Map<string, number>();

  tocObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const target = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          visibleHeadingTops.set(target.id, entry.boundingClientRect.top);
        } else {
          visibleHeadingTops.delete(target.id);
        }
      });

      if (visibleHeadingTops.size > 0) {
        const nextActive = [...visibleHeadingTops.entries()].sort(
          (left, right) => Math.abs(left[1]) - Math.abs(right[1]),
        )[0][0];
        activeTocId.value = nextActive;
        return;
      }

      const passedHeadings = headingElements.filter(
        (heading) => heading.getBoundingClientRect().top <= 124,
      );
      activeTocId.value = passedHeadings.at(-1)?.id ?? headingElements[0].id;
    },
    {
      rootMargin: "-88px 0px -62% 0px",
      threshold: [0, 1],
    },
  );

  headingElements.forEach((heading) => tocObserver?.observe(heading));
}

function disconnectTocObserver() {
  if (tocObserver) {
    tocObserver.disconnect();
    tocObserver = null;
  }
}

function openToc(item: TocItem) {
  scrollToAnchor(item.id, true);
  activeTocId.value = item.id;
  closeDrawers();

  router.replace({
    name: "home",
    query: { ...route.query },
    hash: `#${encodeURIComponent(item.id)}`,
  });
}

function scrollToAnchor(anchorId: string, smooth: boolean) {
  const targetElement = document.getElementById(anchorId);
  if (!targetElement) {
    return;
  }

  targetElement.scrollIntoView({
    block: "start",
    behavior: smooth ? "smooth" : "auto",
  });
  activeTocId.value = anchorId;
}

function setMode(mode: "read" | "edit") {
  if (viewMode.value === mode) {
    return;
  }

  if (mode === "edit" && !editorApiEnabled) {
    editorErrorMessage.value = "编辑模式仅在本地开发环境可用，请使用 npm run dev 启动。";
    return;
  }

  if (!confirmDiscardUnsavedChanges()) {
    return;
  }

  viewMode.value = mode;
  editorErrorMessage.value = "";
  editorSuccessMessage.value = "";
  if (mode === "read") {
    closeCreateDialog();
  }
}

function markEditorDirty() {
  if (!isEditMode.value) {
    return;
  }

  editorDirty.value = editableMarkdownBody.value !== originalMarkdownBody.value;
  editorSuccessMessage.value = "";
  queueEditorHeightSync();
}

function handleContentAfterEnter() {
  if (!isEditMode.value || !canEditCurrentArticle.value) {
    return;
  }
  queueEditorHeightSync();
}

function resetEditorContent() {
  if (!isEditMode.value) {
    return;
  }

  editableMarkdownBody.value = originalMarkdownBody.value;
  editorDirty.value = false;
  editorErrorMessage.value = "";
  queueEditorHeightSync();
}

function queueEditorHeightSync() {
  if (!isEditMode.value) {
    return;
  }

  if (editorResizeRafId) {
    cancelAnimationFrame(editorResizeRafId);
  }

  editorResizeRafId = requestAnimationFrame(() => {
    resizeEditorHeight();
    editorResizeRafId = 0;
  });
}

function resizeEditorHeight() {
  const textarea = editorTextareaRef.value;
  if (!textarea) {
    return;
  }

  textarea.style.height = "auto";
  const nextHeight = Math.max(textarea.scrollHeight, 24 * 16);
  textarea.style.height = `${nextHeight}px`;
}

async function saveCurrentArticle() {
  if (!canEditCurrentArticle.value || !currentArticlePath.value) {
    editorErrorMessage.value = "请先选择一篇文章，再保存。";
    return;
  }

  operationBusy.value = true;
  editorErrorMessage.value = "";
  editorSuccessMessage.value = "";

  try {
    const markdownBody = normalizeNumberedHeadingEscapes(editableMarkdownBody.value);
    const markdownContent = composeMarkdownContent(
      originalFrontMatter.value,
      markdownBody,
      currentTitle.value,
      originalLineEnding.value,
    );

    await saveArticleMarkdown(currentArticlePath.value, markdownContent);
    await loadTree();
    await loadCurrentArticle();

    editorDirty.value = false;
    editorSuccessMessage.value = "文章已保存。";
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败，请重试。";
    editorErrorMessage.value = message;
  } finally {
    operationBusy.value = false;
  }
}

function openCreateDialog(payload: { sectionPath: string; sectionTitle: string }) {
  if (!isEditMode.value) {
    return;
  }

  createDialogVisible.value = true;
  createDialogSectionPath.value = payload.sectionPath;
  createDialogSectionTitle.value = payload.sectionTitle;
  createDialogFileName.value = "";
  editorErrorMessage.value = "";
}

function closeCreateDialog() {
  createDialogVisible.value = false;
  createDialogSectionPath.value = "";
  createDialogSectionTitle.value = "";
  createDialogFileName.value = "";
}

async function createArticle() {
  if (!createDialogSectionPath.value) {
    editorErrorMessage.value = "请选择目标目录后再创建文章。";
    return;
  }

  const fileName = createDialogFileName.value.trim();
  const title = fileName;
  if (!fileName) {
    editorErrorMessage.value = "请输入文件名。";
    return;
  }

  operationBusy.value = true;
  editorErrorMessage.value = "";
  editorSuccessMessage.value = "";

  try {
    const createdPath = await createArticleInSection({
      sectionPath: createDialogSectionPath.value,
      fileName,
      title,
    });

    closeCreateDialog();
    await loadTree();
    await openArticle(createdPath);
    editorSuccessMessage.value = "文章创建成功。";
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建文章失败，请重试。";
    editorErrorMessage.value = message;
  } finally {
    operationBusy.value = false;
  }
}

async function moveArticle(payload: { articlePath: string; targetSectionPath: string }) {
  if (!isEditMode.value || operationBusy.value) {
    return;
  }

  if (!confirmDiscardUnsavedChanges()) {
    return;
  }

  operationBusy.value = true;
  editorErrorMessage.value = "";
  editorSuccessMessage.value = "";

  try {
    const nextPath = await moveArticleToSection(payload);
    await loadTree();

    if (currentArticlePath.value === payload.articlePath) {
      await router.replace({
        name: "home",
        query: {
          article: nextPath,
        },
        hash: "",
      });
    }

    editorSuccessMessage.value = "文章移动成功。";
  } catch (error) {
    const message = error instanceof Error ? error.message : "移动文章失败，请重试。";
    editorErrorMessage.value = message;
  } finally {
    operationBusy.value = false;
  }
}

async function confirmDeleteArticle(articlePath: string) {
  if (!isEditMode.value || !articlePath || operationBusy.value) {
    return;
  }

  if (!window.confirm(`确认删除文章 ${articlePath} 吗？此操作不可撤销。`)) {
    return;
  }

  if (!confirmDiscardUnsavedChanges()) {
    return;
  }

  operationBusy.value = true;
  editorErrorMessage.value = "";
  editorSuccessMessage.value = "";

  try {
    await deleteArticleByPath(articlePath);
    await loadTree();

    if (currentArticlePath.value === articlePath) {
      await openHome();
    }
    editorSuccessMessage.value = "文章已删除。";
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除文章失败，请重试。";
    editorErrorMessage.value = message;
  } finally {
    operationBusy.value = false;
  }
}

function confirmDiscardUnsavedChanges() {
  if (!isEditMode.value || !editorDirty.value) {
    return true;
  }

  return window.confirm("当前有未保存修改，继续将丢失这些修改。是否继续？");
}

async function openArticle(articlePath: string) {
  if (!confirmDiscardUnsavedChanges()) {
    return;
  }

  closeDrawers();
  await router.push({
    name: "home",
    query: {
      article: articlePath,
    },
    hash: "",
  });
}

async function openHome() {
  if (!confirmDiscardUnsavedChanges()) {
    return;
  }

  closeDrawers();
  await router.push({
    name: "home",
    query: {},
    hash: "",
  });
}

function closeDrawers() {
  const menuToggle = document.getElementById("menu-control") as HTMLInputElement | null;
  const tocToggle = document.getElementById("toc-control") as HTMLInputElement | null;

  if (menuToggle) {
    menuToggle.checked = false;
  }

  if (tocToggle) {
    tocToggle.checked = false;
  }
}

function handleWindowScroll() {
  if (progressRafId) {
    cancelAnimationFrame(progressRafId);
  }

  progressRafId = requestAnimationFrame(() => {
    updateReadingProgress();
    progressRafId = 0;
  });
}

function updateReadingProgress() {
  const articleElement = articleRef.value;
  if (!articleElement) {
    readingProgress.value = 0;
    return;
  }

  const viewportHeight = window.innerHeight || 1;
  const scrollTop = window.scrollY || window.pageYOffset || 0;
  const articleTop = articleElement.offsetTop;
  const articleHeight = articleElement.offsetHeight;
  const start = articleTop - viewportHeight * 0.18;
  const end = articleTop + articleHeight - viewportHeight * 0.55;
  const range = Math.max(end - start, 1);
  const rawProgress = ((scrollTop - start) / range) * 100;
  const clamped = Math.min(100, Math.max(0, rawProgress));
  readingProgress.value = Number.isFinite(clamped) ? Math.round(clamped) : 0;
}

function getHashId(hash: string) {
  if (!hash) {
    return "";
  }

  const rawValue = hash.replace(/^#/, "");
  if (!rawValue) {
    return "";
  }

  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

function toggleSection(sectionKey: string) {
  const nextKeys = new Set(openKeys.value);
  if (nextKeys.has(sectionKey)) {
    nextKeys.delete(sectionKey);
  } else {
    nextKeys.add(sectionKey);
  }
  openKeys.value = nextKeys;
}

function stripFrontMatter(content: string) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

function splitFrontMatter(content: string) {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (!match) {
    return {
      frontMatter: "",
      body: content,
    };
  }

  return {
    frontMatter: match[0],
    body: content.slice(match[0].length),
  };
}

function composeMarkdownContent(
  frontMatter: string,
  body: string,
  fallbackTitle: string,
  lineEnding: "\n" | "\r\n",
) {
  const normalizedBody = applyLineEnding(body, lineEnding);
  if (frontMatter) {
    return `${applyLineEnding(frontMatter, lineEnding)}${normalizedBody}`;
  }

  const normalizedFrontMatter = applyLineEnding(buildDefaultFrontMatter(fallbackTitle), lineEnding);
  const bodyWithoutLeadingBreak = normalizedBody.replace(/^\r?\n+/, "");
  if (!bodyWithoutLeadingBreak) {
    return `${normalizedFrontMatter}${lineEnding}${lineEnding}`;
  }

  return `${normalizedFrontMatter}${lineEnding}${lineEnding}${bodyWithoutLeadingBreak}`;
}

function normalizeNumberedHeadingEscapes(content: string) {
  return content.replace(/^(#{1,6}\s+\d+)\\\.(?=\s)/gm, "$1.");
}

function buildDefaultFrontMatter(title: string) {
  const safeTitle = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return [
    "---",
    `title: "${safeTitle}"`,
    "weight: 1",
    "# bookFlatSection: false",
    "# bookToc: true",
    "# bookHidden: false",
    "# bookCollapseSection: false",
    "# bookComments: false",
    "# bookSearchExclude: false",
    "---",
  ].join("\n");
}

function detectLineEnding(content: string): "\n" | "\r\n" {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function applyLineEnding(content: string, lineEnding: "\n" | "\r\n") {
  return content.replace(/\r?\n/g, lineEnding);
}

function collectDefaultOpenSectionKeys(nodes: ContentNode[], activePath: string) {
  const keys = new Set<string>();
  const stack = [...nodes];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || node.type !== "section") {
      continue;
    }

    if (node.bookFlatSection) {
      keys.add(node.key);
    }

    if (Array.isArray(node.children)) {
      stack.push(...node.children);
    }
  }

  const activeAncestors = collectArticleAncestorSectionKeys(nodes, activePath);
  activeAncestors.forEach((key) => keys.add(key));

  return keys;
}

function expandActiveArticleAncestors() {
  const activeAncestors = collectArticleAncestorSectionKeys(tree.value, currentArticlePath.value);
  if (activeAncestors.length === 0) {
    return;
  }

  const nextKeys = new Set(openKeys.value);
  activeAncestors.forEach((key) => nextKeys.add(key));
  openKeys.value = nextKeys;
}

function collectArticleAncestorSectionKeys(nodes: ContentNode[], targetPath: string) {
  if (!targetPath) {
    return [];
  }

  const ancestors: string[] = [];
  if (findArticleWithAncestors(nodes, targetPath, ancestors)) {
    return ancestors;
  }

  return [];
}

function findArticleWithAncestors(
  nodes: ContentNode[],
  targetPath: string,
  ancestors: string[],
) {
  for (const node of nodes) {
    if (node.type === "article" && node.path === targetPath) {
      return true;
    }

    if (node.type !== "section") {
      continue;
    }

    if (node.special && node.indexPath === targetPath) {
      return true;
    }

    if (!Array.isArray(node.children)) {
      continue;
    }

    ancestors.push(node.key);
    const foundInChildren = findArticleWithAncestors(node.children, targetPath, ancestors);
    if (foundInChildren) {
      return true;
    }
    ancestors.pop();
  }

  return false;
}

function findTitleByPath(nodes: ContentNode[], targetPath: string): string | undefined {
  const stack = [...nodes];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    if (node.type === "article" && node.path === targetPath) {
      return node.title;
    }

    if (node.type === "section" && node.special && node.indexPath === targetPath) {
      return node.title;
    }

    if (Array.isArray(node.children)) {
      stack.push(...node.children);
    }
  }

  return undefined;
}

function isSpecialIndexArticle(nodes: ContentNode[], targetPath: string) {
  if (!targetPath) {
    return false;
  }

  const stack = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    if (node.type === "section" && node.special && node.indexPath === targetPath) {
      return true;
    }

    if (Array.isArray(node.children)) {
      stack.push(...node.children);
    }
  }

  return false;
}

function filterNodes(
  nodes: ContentNode[],
  keyword: string,
): ContentNode[] {
  if (!keyword) {
    return nodes;
  }

  const result: ContentNode[] = [];

  for (const node of nodes) {
    const selfMatched = node.title.toLowerCase().includes(keyword);

    if (node.type === "article") {
      if (selfMatched) {
        result.push(node);
      }
      continue;
    }

    const originalChildren = node.children ?? [];
    const childNodes = filterNodes(originalChildren, keyword);
    if (selfMatched) {
      result.push({
        ...node,
        children: originalChildren,
      });
      continue;
    }

    if (childNodes.length > 0) {
      result.push({
        ...node,
        children: childNodes,
      });
    }
  }

  return result;
}
</script>

<style scoped>
.book-root {
  --bg: #f6f8fb;
  --panel: #ffffff;
  --border: #e6eaf0;
  --text: #1f2937;
  --muted: #667085;
  --accent: #3b82f6;
  --accent-strong: #2563eb;
  --accent-soft: #eaf2ff;
  --danger-soft: #fff2f2;
  --danger-text: #c03f3f;
  --radius: 12px;
  --radius-sm: 10px;
  --shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
  --reading-max-width: 92ch;
  --mode-bar-height: 2.2rem;
  --mode-bar-top-space: 0.55rem;
  --mode-bar-bottom-space: 0.55rem;
  --chrome-offset: calc(
    var(--mode-bar-top-space) + var(--mode-bar-height) + var(--mode-bar-bottom-space)
  );
  --pane-top: calc(var(--chrome-offset) + 0.18rem);
  color: var(--text);
  background: var(--bg);
  padding-top: var(--pane-top);
  position: relative;
}

.book-root::before {
  content: "";
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--pane-top);
  background: var(--bg);
  z-index: 24;
  pointer-events: none;
}

.book-root.no-toc-panel .reading-progress {
  right: calc(max((100vw - 80rem) / 2, 0px) + 0.75rem);
}

.mode-bar-shell {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 28;
  pointer-events: none;
}

.mode-bar {
  max-width: 80rem;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: var(--mode-bar-height);
  margin: var(--mode-bar-top-space) auto var(--mode-bar-bottom-space);
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fbfdff;
  padding: 0.2rem 0.35rem;
  pointer-events: auto;
}

.mode-icon-group {
  display: inline-flex;
  align-items: center;
  gap: 0.34rem;
}

.mode-icon-wrap {
  position: relative;
  display: inline-flex;
}

.mode-icon-wrap::after {
  content: attr(data-tip);
  position: absolute;
  left: 50%;
  top: calc(100% + 0.42rem);
  bottom: auto;
  transform: translate(-50%, -3px);
  border-radius: 7px;
  background: rgba(16, 24, 40, 0.92);
  color: #fff;
  font-size: 0.72rem;
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  padding: 0.32rem 0.45rem;
  transition: opacity 0.14s ease, transform 0.14s ease;
  z-index: 8;
}

.mode-icon-wrap:hover::after {
  opacity: 1;
  transform: translate(-50%, 0);
}

.mode-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  height: 1.8rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  color: #5d6b83;
  cursor: pointer;
  padding: 0;
  transition: border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease;
}

.mode-icon-button svg {
  width: 1rem;
  height: 1rem;
}

.mode-icon-button:hover {
  background: #f4f7fd;
}

.mode-icon-button.active {
  border-color: rgba(59, 130, 246, 0.44);
  background: var(--accent-soft);
  color: var(--accent-strong);
}

.mode-icon-button:disabled {
  color: #96a2b7;
  background: #f8fafc;
  cursor: not-allowed;
  opacity: 0.66;
}

.mode-icon-button:focus-visible {
  outline: 2px solid rgba(59, 130, 246, 0.35);
  outline-offset: 2px;
}

.dialog-action {
  border: 1px solid var(--border);
  border-radius: 9px;
  background: #fff;
  color: var(--text);
  font-size: 0.79rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0.35rem 0.7rem;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.dialog-action.ghost:hover {
  background: #f5f8fd;
}

.dialog-action.primary {
  border-color: rgba(37, 99, 235, 0.4);
  background: var(--accent-strong);
  color: #fff;
}

.dialog-action.primary:hover {
  background: #1f57d8;
}

.dialog-action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.mode-alert {
  margin: 0 0 0.72rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 0.81rem;
  padding: 0.52rem 0.7rem;
}

.mode-alert.error {
  border-color: #f2caca;
  background: #fff2f2;
  color: #c03f3f;
}

.mode-alert.success {
  border-color: #b7e1ce;
  background: #effaf4;
  color: #147a44;
}

a {
  color: inherit;
  text-decoration: none;
}

img {
  vertical-align: baseline;
}

.container {
  max-width: 80rem;
  min-height: 100vh;
  margin: 0 auto;
  align-items: flex-start;
}

.flex {
  display: flex;
}

.align-center {
  align-items: center;
}

.justify-between {
  justify-content: space-between;
}

.flex-wrap {
  flex-wrap: wrap;
}

.hidden {
  display: none;
}

input.toggle {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  overflow: hidden;
}

.book-brand {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1rem;
  font-weight: 700;
}

.book-brand img {
  width: 1.6rem;
  height: 1.6rem;
  margin-right: 0.55rem;
  border-radius: 6px;
}

.book-menu {
  flex: 0 0 16rem;
  font-size: 0.875rem;
}

.book-menu-content {
  position: fixed;
  top: var(--pane-top);
  bottom: 0;
  width: 16rem;
  border-right: 1px solid var(--border);
  padding: 1rem;
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--panel);
}

.book-search {
  margin: 0.35rem 0 1rem;
}

.book-search input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: #fff;
  color: var(--text);
  font-size: 0.84rem;
  line-height: 1.2;
  padding: 0.38rem 0.62rem;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.book-search input::placeholder {
  color: #8b95a7;
}

.book-search input:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.14);
}

.menu-tip {
  margin: 0.75rem 0;
  border: 1px dashed #d4dbe8;
  border-radius: 10px;
  background: #fbfcff;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.4;
  padding: 0.6rem 0.7rem;
}

.menu-tip::before {
  content: "i";
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.05rem;
  height: 1.05rem;
  margin-right: 0.4rem;
  border-radius: 999px;
  border: 1px solid #c8d2e4;
  color: #7a869a;
  font-size: 0.75rem;
  font-weight: 700;
}

.menu-tip-error {
  border-color: #f1c5c5;
  background: var(--danger-soft);
  color: var(--danger-text);
}

.menu-tip-error::before {
  border-color: #e3a7a7;
  color: var(--danger-text);
}

.book-page {
  position: sticky;
  top: var(--pane-top);
  z-index: 1;
  align-self: flex-start;
  min-width: 20rem;
  flex-grow: 1;
  margin: 0 0.75rem 0.75rem 1rem;
  border: 1px solid var(--border);
  border-radius: 0;
  box-shadow: var(--shadow);
  background: var(--panel);
  padding: 1.2rem 1.4rem;
  overflow: hidden;
}

.book-page.special-article {
  background: var(--panel);
  border-color: var(--border);
  box-shadow: var(--shadow);
}

.book-page.special-article .book-header,
.book-page.special-article .mode-alert {
  color: var(--text);
}

.reading-progress {
  position: fixed;
  top: var(--pane-top);
  left: calc(max((100vw - 80rem) / 2, 0px) + 17rem);
  right: calc(max((100vw - 80rem) / 2, 0px) + 16.75rem);
  z-index: 25;
  height: 3px;
  margin: 0;
  background: rgba(59, 130, 246, 0.09);
  pointer-events: none;
  border-radius: 999px;
}

.reading-progress span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #3b82f6 0%, #2563eb 100%);
  transition: width 0.14s linear;
}

.book-header {
  display: none;
  margin-bottom: 1rem;
}

.book-header label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
}

.book-header-spacer {
  display: inline-flex;
  width: 2.5rem;
  height: 2.5rem;
  flex: 0 0 2.5rem;
}

.book-header label:focus-visible {
  outline: 2px solid rgba(59, 130, 246, 0.35);
  outline-offset: 2px;
}

.book-header img.book-icon {
  width: 1.2rem;
  height: 1.2rem;
}

.book-header aside {
  display: none;
  margin-top: 0.75rem;
  border-top: 1px solid var(--border);
  padding-top: 0.75rem;
}

.toc-mobile-link {
  width: 100%;
  border: 0;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  color: var(--muted);
  font-size: 0.82rem;
  cursor: pointer;
  padding: 0.35rem 0.45rem;
}

.toc-mobile-link.lv-3 {
  padding-left: 1rem;
}

.toc-mobile-link.lv-4 {
  padding-left: 1.35rem;
}

.toc-mobile-link.active {
  color: var(--accent-strong);
  background: var(--accent-soft);
}

.toc-mobile-item {
  margin: 0.2rem 0;
  color: var(--muted);
  font-size: 0.82rem;
}

.markdown {
  line-height: 1.74;
}

.markdown-inner {
  max-width: var(--reading-max-width);
  margin: 0 auto;
  padding: 0.2rem 0.5rem 0.35rem;
}

.markdown-inner.special-markdown {
  max-width: 100%;
  padding: 0.2rem 0.1rem 0.35rem;
}

.markdown-inner.special-markdown :deep(.special-columns) {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.2rem 2rem;
}

.markdown-inner.special-markdown :deep(.special-column) {
  min-width: 0;
}

.markdown-inner.special-markdown :deep(.special-column h2) {
  margin: 0 0 0.9rem;
  border: 0;
  color: #1f2937;
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.015em;
  padding: 0;
}

.markdown-inner.special-markdown :deep(.special-column p) {
  margin: 0.72rem 0;
  color: #2e3a4d;
  line-height: 1.35;
  padding: 0;
}

.markdown-inner.special-markdown :deep(.special-column a) {
  color: var(--accent-strong);
  text-decoration: none;
}

.markdown-inner.special-markdown :deep(.special-column a:hover) {
  color: #1f57d8;
  text-decoration: underline;
}

.markdown-inner.special-markdown :deep(.special-column strong) {
  color: #1f2937;
  font-weight: 600;
}

.markdown-editor {
  display: block;
  width: 100%;
  min-height: 24rem;
  border: 1px solid #c9d5e7;
  border-radius: 10px;
  background: #fcfdff;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.65);
  padding: 0.85rem 1rem;
  resize: none;
  overflow-x: hidden;
  overflow-y: auto;
  font-family: "JetBrains Mono", "Fira Code", "SFMono-Regular", Consolas, "Liberation Mono", Menlo,
    monospace;
  font-size: 0.94rem;
  line-height: 1.7;
  tab-size: 2;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  color: var(--text-main);
}

.markdown-editor:focus-visible {
  outline: 2px solid rgba(59, 130, 246, 0.35);
  outline-offset: 2px;
}

.markdown-inner :deep(> :first-child) {
  margin-top: 0;
}

.markdown-inner :deep(> :last-child) {
  margin-bottom: 0;
}

.markdown-inner :deep(h1),
.markdown-inner :deep(h2),
.markdown-inner :deep(h3),
.markdown-inner :deep(h4) {
  line-height: 1.24;
  font-weight: 620;
  letter-spacing: -0.01em;
  scroll-margin-top: 1.2rem;
}

.markdown-inner :deep(h1) {
  font-size: clamp(1.75rem, 2.4vw, 2.2rem);
  margin: 0 0 1.15rem;
  padding-bottom: 0.55rem;
  border-bottom: 1px solid #e7edf6;
}

.markdown-inner :deep(h2) {
  font-size: 1.35rem;
  margin-top: 2.05rem;
  margin-bottom: 0.86rem;
  border-left: 3px solid #d8e5ff;
  padding-left: 0.55rem;
}

.markdown-inner :deep(h3) {
  font-size: 1.16rem;
  margin-top: 1.55rem;
  margin-bottom: 0.65rem;
  padding-left: 0.9rem;
}

.markdown-inner :deep(h4) {
  font-size: 1.02rem;
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
  color: #31415b;
  padding-left: 1.2rem;
}

.markdown-inner :deep(p),
.markdown-inner :deep(li) {
  color: #2e3a4d;
}

.markdown-inner :deep(p) {
  margin: 0.88rem 0;
  padding-inline-start: 0.48rem;
  word-break: break-word;
}

.markdown-inner :deep(h1 + p),
.markdown-inner :deep(h2 + p),
.markdown-inner :deep(h3 + p),
.markdown-inner :deep(h4 + p) {
  padding-inline-start: 0.22rem;
}

.markdown-inner :deep(ul),
.markdown-inner :deep(ol) {
  margin: 0.88rem 0;
  padding-inline-start: 2rem;
  color: #2e3a4d;
}

.markdown-inner :deep(li) {
  margin: 0.35rem 0;
  padding-inline-start: 0.1rem;
}

.markdown-inner :deep(li > p),
.markdown-inner :deep(blockquote p),
.markdown-inner :deep(td p) {
  margin: 0.45rem 0;
  padding-inline-start: 0;
}

.markdown-inner :deep(a) {
  color: var(--accent-strong);
  text-decoration: underline;
  text-decoration-color: rgba(37, 99, 235, 0.35);
  text-underline-offset: 0.16rem;
}

.markdown-inner :deep(a:hover) {
  text-decoration-color: rgba(37, 99, 235, 0.6);
}

.markdown-inner :deep(code) {
  border: 1px solid #dbe3f0;
  border-radius: 6px;
  background: #f5f8fd;
  color: #223046;
  padding: 0.08rem 0.35rem;
  font-size: 0.86em;
}

.markdown-inner :deep(pre) {
  overflow-x: auto;
  border: 1px solid #dbe3f0;
  border-radius: 12px;
  background: #f8fbff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
  margin: 1.08rem 0;
  padding: 1rem;
}

.markdown-inner :deep(pre code) {
  border: 0;
  background: transparent;
  padding: 0;
}

.markdown-inner :deep(blockquote) {
  border-left: 3px solid #d8e5ff;
  border-radius: 0 10px 10px 0;
  background: #f8fbff;
  margin: 1.05rem 0;
  padding: 0.75rem 1rem;
}

.markdown-inner :deep(table) {
  display: block;
  overflow-x: auto;
  width: 100%;
  border-collapse: collapse;
  margin: 1.05rem 0;
}

.markdown-inner :deep(th) {
  text-align: left;
  font-weight: 600;
}

.markdown-inner :deep(th),
.markdown-inner :deep(td) {
  border: 1px solid var(--border);
  padding: 0.5rem 0.75rem;
}

.markdown-inner :deep(thead th) {
  background: #f7f9fc;
}

.markdown-inner :deep(img) {
  display: block;
  max-width: 100%;
  border-radius: 10px;
  margin: 1rem auto;
}

.markdown-inner :deep(hr) {
  border: 0;
  border-top: 1px solid #e6eaf0;
  margin: 1.1rem 0;
}

.loading-skeleton {
  max-width: var(--reading-max-width);
  margin: 0 auto;
  display: grid;
  gap: 0.55rem;
}

.s-line {
  display: block;
  height: 0.9rem;
  border-radius: 999px;
  background: linear-gradient(90deg, #eef2f8 0%, #f8fbff 45%, #eef2f8 100%);
  background-size: 220% 100%;
  animation: shimmer 1.4s ease infinite;
}

.w-60 {
  width: 60%;
}

.w-70 {
  width: 70%;
}

.w-80 {
  width: 80%;
}

.w-90 {
  width: 90%;
}

.w-95 {
  width: 95%;
}

.state-banner {
  max-width: var(--reading-max-width);
  margin: 0 auto;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: #f8fafc;
  color: var(--muted);
  padding: 0.65rem 0.78rem;
}

.state-banner-error {
  border-color: #f2caca;
  background: var(--danger-soft);
  color: var(--danger-text);
}

.book-footer {
  border-top: 1px solid var(--border);
  margin-top: 1rem;
  padding-top: 0.85rem;
  color: var(--muted);
  font-size: 0.79rem;
}

.book-toc {
  flex: 0 0 16rem;
  font-size: 0.75rem;
}

.book-toc-content {
  position: fixed;
  top: var(--pane-top);
  bottom: 0;
  width: 16rem;
  border-left: 1px solid var(--border);
  background: var(--panel);
  padding: 1rem;
  overflow-x: hidden;
  overflow-y: auto;
}

.toc-title {
  margin: 0;
  color: #354256;
  font-size: 0.79rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.toc-list {
  list-style: none;
  margin: 0.85rem 0 1rem;
  padding: 0;
}

.toc-list li + li {
  margin-top: 0.2rem;
}

.toc-link {
  width: 100%;
  border: 0;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.81rem;
  line-height: 1.35;
  padding: 0.36rem 0.45rem;
  transition: color 0.16s ease, background-color 0.16s ease;
}

.toc-link.lv-3 {
  padding-left: 0.95rem;
}

.toc-link.lv-4 {
  padding-left: 1.35rem;
}

.toc-link:hover {
  color: var(--text);
  background: #f3f6fb;
}

.toc-link:focus-visible {
  outline: 2px solid rgba(59, 130, 246, 0.35);
  outline-offset: 2px;
}

.toc-link.active {
  color: var(--accent-strong);
  background: var(--accent-soft);
}

.toc-empty {
  margin: 0.75rem 0;
  border: 1px dashed #d4dbe8;
  border-radius: 10px;
  color: var(--muted);
  font-size: 0.8rem;
  padding: 0.55rem 0.62rem;
}

.toc-item {
  margin: 0.3rem 0;
}

.toc-item.muted {
  color: var(--muted);
  font-size: 0.74rem;
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.26);
  padding: 1rem;
}

.dialog-card {
  width: min(28rem, 100%);
  border: 1px solid var(--border);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.18);
  padding: 1rem;
}

.dialog-card h3 {
  margin: 0;
  color: #1f2937;
  font-size: 1rem;
}

.dialog-card p {
  margin: 0.35rem 0 0.9rem;
  color: #667085;
  font-size: 0.82rem;
}

.dialog-tip {
  margin: 0.25rem 0 0.5rem;
  font-size: 0.8rem;
}

.dialog-tip.muted {
  color: #667085;
}

.dialog-tip.error {
  color: #b42318;
}

.dialog-tip.success {
  color: #0f7a42;
}

.publish-steps {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.35rem;
  margin: 0.2rem 0 0.65rem;
}

.publish-step {
  border: 1px solid #d8e0ee;
  border-radius: 999px;
  background: #f6f8fc;
  color: #64748b;
  font-size: 0.74rem;
  line-height: 1;
  text-align: center;
  padding: 0.32rem 0.42rem;
  text-transform: uppercase;
}

.publish-step.active {
  border-color: rgba(37, 99, 235, 0.42);
  background: #eaf2ff;
  color: #1d4ed8;
}

.dialog-conflicts {
  border: 1px dashed #e3a7a7;
  border-radius: 10px;
  background: #fff7f7;
  margin: 0.35rem 0 0.7rem;
  padding: 0.5rem 0.6rem;
}

.dialog-conflicts-title {
  margin: 0;
  color: #8f1f1f;
  font-size: 0.78rem;
  font-weight: 600;
}

.dialog-conflict-list {
  margin: 0.35rem 0 0;
  padding-left: 1rem;
  color: #7f1d1d;
  font-size: 0.76rem;
  line-height: 1.4;
}

.dialog-conflict-list li + li {
  margin-top: 0.12rem;
}

.publish-terminal {
  border: 1px solid #d8e0ee;
  border-radius: 11px;
  background: #0f172a;
  color: #e2e8f0;
  max-height: 16rem;
  margin: 0.1rem 0 0.7rem;
  overflow: auto;
  padding: 0.55rem 0.6rem;
}

.publish-terminal-empty {
  margin: 0;
  color: #94a3b8;
  font-size: 0.76rem;
}

.publish-log-line {
  display: flex;
  gap: 0.5rem;
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.35;
  font-family: "JetBrains Mono", "Consolas", "Liberation Mono", monospace;
}

.publish-log-line + .publish-log-line {
  margin-top: 0.18rem;
}

.publish-log-time {
  color: #94a3b8;
  flex: 0 0 auto;
}

.publish-log-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.publish-log-line.lv-command .publish-log-text {
  color: #93c5fd;
}

.publish-log-line.lv-stdout .publish-log-text {
  color: #d1d5db;
}

.publish-log-line.lv-stderr .publish-log-text {
  color: #fca5a5;
}

.publish-log-line.lv-info .publish-log-text {
  color: #a5b4fc;
}

.publish-log-line.lv-success .publish-log-text {
  color: #86efac;
}

.publish-log-line.lv-error .publish-log-text {
  color: #fda4af;
}

.dialog-label {
  display: grid;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
  color: #394961;
  font-size: 0.82rem;
}

.dialog-label input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: #fff;
  color: var(--text);
  font-size: 0.86rem;
  padding: 0.46rem 0.62rem;
}

.dialog-label input:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.14);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.55rem;
  margin-top: 0.1rem;
}

.fade-content-enter-active,
.fade-content-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.fade-content-enter-from,
.fade-content-leave-to {
  opacity: 0;
  transform: translateY(2px);
}

.book-menu-content,
.book-toc-content,
.book-page,
.book-header aside {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

@keyframes shimmer {
  100% {
    background-position: -120% 0;
  }
}

@media (max-width: 72rem) {
  .markdown-inner.special-markdown :deep(.special-columns) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 56rem) {
  #menu-control,
  #toc-control {
    display: inline;
  }

  .mode-bar {
    padding: 0.18rem 0.28rem;
    margin-bottom: 0.52rem;
  }

  .book-menu {
    visibility: hidden;
    margin-left: -16rem;
    z-index: 20;
  }

  .book-menu-content {
    border-right: 1px solid var(--border);
    box-shadow: none;
  }

  .book-toc {
    display: none;
  }

  .book-page {
    position: relative;
    top: 0;
    margin: 0;
    border-radius: 0;
    border-left: 0;
    border-right: 0;
    box-shadow: none;
  }

  .reading-progress {
    position: relative;
    top: 0;
    left: auto;
    right: auto;
    z-index: 4;
    margin-left: -1.4rem;
    margin-right: -1.4rem;
    margin-bottom: 1rem;
    border-radius: 0;
  }

  .book-header {
    display: block;
  }

  #menu-control:checked ~ main .book-menu {
    visibility: visible;
  }

  #menu-control:checked ~ main .book-menu .book-menu-content {
    transform: translateX(16rem);
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
  }

  #menu-control:checked ~ main .book-page {
    opacity: 0.24;
  }

  #menu-control:checked ~ main .book-menu-overlay {
    position: fixed;
    display: block;
    inset: 0;
    background: rgba(15, 23, 42, 0.2);
  }

  #toc-control:checked ~ main .book-header aside {
    display: block;
  }

  .markdown-inner {
    max-width: 100%;
    padding-inline: 0.1rem;
  }

  .markdown-inner.special-markdown :deep(.special-columns) {
    grid-template-columns: 1fr;
    gap: 0.8rem;
  }

  .markdown-inner :deep(h2) {
    padding-left: 0.45rem;
  }

  .markdown-inner :deep(h3) {
    padding-left: 0.55rem;
  }

  .markdown-inner :deep(h4),
  .markdown-inner :deep(p) {
    padding-left: 0.35rem;
  }

  .markdown-inner :deep(ul),
  .markdown-inner :deep(ol) {
    padding-inline-start: 1.6rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .book-menu-content,
  .book-toc-content,
  .book-page,
  .book-header aside,
  .book-search input,
  .mode-icon-button,
  .dialog-action,
  .mode-icon-wrap::after,
  .reading-progress span,
  .fade-content-enter-active,
  .fade-content-leave-active,
  .s-line {
    animation: none;
    transition: none;
  }

  html {
    scroll-behavior: auto;
  }
}
</style>
