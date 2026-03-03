<template>
  <ul class="tree-list">
    <li
      v-for="node in nodes"
      :key="node.key"
      class="tree-item"
    >
      <template v-if="node.type === 'section'">
        <div class="tree-row">
          <button
            type="button"
            class="tree-section"
            :class="{
              open: canToggleSection(node) && isOpen(node.key),
              active: isSpecialSectionActive(node),
              'contains-active': hasActiveDescendant(node),
              'drop-target': dropSectionKey === node.key,
            }"
            @click="onSectionClick(node)"
            @dragover.prevent="onSectionDragOver(node.key)"
            @dragleave="onSectionDragLeave(node.key)"
            @drop.prevent="onSectionDrop($event, node.path)"
          >
            <span
              v-if="canToggleSection(node)"
              class="tree-arrow"
              :class="{ open: isOpen(node.key) }"
              aria-hidden="true"
            />
            <span
              v-else
              class="tree-arrow tree-arrow-placeholder"
              aria-hidden="true"
            />
            <span class="tree-label">{{ node.title }}</span>
          </button>

          <button
            v-if="editMode && node.path"
            type="button"
            class="tree-action create"
            title="Create article in this section"
            aria-label="Create article in this section"
            @click.stop="onCreateArticle(node.path, node.title)"
          >
            +
          </button>
        </div>

        <ContentTree
          v-if="node.children?.length && canToggleSection(node) && isOpen(node.key)"
          :nodes="node.children"
          :active-path="activePath"
          :open-keys="openKeys"
          :force-open="forceOpen"
          :edit-mode="editMode"
          @toggle="onToggle"
          @select="onSelect"
          @create-article="forwardCreateArticle"
          @move-article="forwardMoveArticle"
          @delete-article="forwardDeleteArticle"
        />
      </template>

      <div
        v-else
        class="tree-row"
      >
        <button
          type="button"
          class="tree-article"
          :class="{ active: node.path === activePath }"
          :draggable="editMode"
          @click="onSelect(node.path)"
          @dragstart="onArticleDragStart($event, node.path)"
          @dragend="clearDropTarget"
        >
          <span
            class="tree-dot"
            aria-hidden="true"
          />
          <span class="tree-label">{{ node.title }}</span>
        </button>

        <button
          v-if="editMode"
          type="button"
          class="tree-action delete"
          title="Delete article"
          aria-label="Delete article"
          @click.stop="forwardDeleteArticle(node.path)"
        >
          x
        </button>
      </div>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { ContentNode } from "@/types/content";

const props = defineProps<{
  nodes: ContentNode[];
  activePath: string;
  openKeys: Set<string>;
  forceOpen: boolean;
  editMode: boolean;
}>();

const emit = defineEmits<{
  (event: "toggle", sectionKey: string): void;
  (event: "select", articlePath: string): void;
  (event: "create-article", payload: { sectionPath: string; sectionTitle: string }): void;
  (event: "move-article", payload: { articlePath: string; targetSectionPath: string }): void;
  (event: "delete-article", articlePath: string): void;
}>();

const DRAG_PAYLOAD_KEY = "application/x-sololog-article-path";
const dropSectionKey = ref("");

function onToggle(sectionKey: string) {
  emit("toggle", sectionKey);
}

function onSectionClick(node: ContentNode) {
  if (isSpecialSection(node) && node.indexPath && !canToggleSection(node)) {
    emit("select", node.indexPath);
    return;
  }

  if (canToggleSection(node)) {
    onToggle(node.key);
  }
}

function onSelect(articlePath?: string) {
  if (!articlePath) {
    return;
  }

  emit("select", articlePath);
}

function onCreateArticle(sectionPath: string, sectionTitle: string) {
  emit("create-article", {
    sectionPath,
    sectionTitle,
  });
}

function forwardCreateArticle(payload: { sectionPath: string; sectionTitle: string }) {
  emit("create-article", payload);
}

function forwardMoveArticle(payload: { articlePath: string; targetSectionPath: string }) {
  emit("move-article", payload);
}

function forwardDeleteArticle(articlePath?: string) {
  if (!articlePath) {
    return;
  }

  emit("delete-article", articlePath);
}

function isOpen(sectionKey: string) {
  return props.forceOpen || props.openKeys.has(sectionKey);
}

function canToggleSection(node: ContentNode) {
  return node.type === "section" && Array.isArray(node.children) && node.children.length > 0;
}

function isSpecialSection(node: ContentNode) {
  return node.type === "section" && node.special === true && typeof node.indexPath === "string";
}

function isSpecialSectionActive(node: ContentNode) {
  return isSpecialSection(node) && node.indexPath === props.activePath;
}

function onArticleDragStart(event: DragEvent, articlePath?: string) {
  if (!props.editMode || !articlePath || !event.dataTransfer) {
    return;
  }

  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(DRAG_PAYLOAD_KEY, articlePath);
}

function onSectionDragOver(sectionKey: string) {
  if (!props.editMode) {
    return;
  }

  dropSectionKey.value = sectionKey;
}

function onSectionDragLeave(sectionKey: string) {
  if (dropSectionKey.value === sectionKey) {
    dropSectionKey.value = "";
  }
}

function onSectionDrop(event: DragEvent, sectionPath?: string) {
  clearDropTarget();
  if (!props.editMode || !sectionPath || !event.dataTransfer) {
    return;
  }

  const articlePath = event.dataTransfer.getData(DRAG_PAYLOAD_KEY).trim();
  if (!articlePath) {
    return;
  }

  const sourceSectionPath = extractParentSection(articlePath);
  if (sourceSectionPath === sectionPath) {
    return;
  }

  emit("move-article", {
    articlePath,
    targetSectionPath: sectionPath,
  });
}

function clearDropTarget() {
  dropSectionKey.value = "";
}

function extractParentSection(articlePath: string) {
  const normalized = articlePath.replace(/\\/g, "/");
  const splitIndex = normalized.lastIndexOf("/");
  return splitIndex > -1 ? normalized.slice(0, splitIndex) : "";
}

function hasActiveDescendant(node: ContentNode) {
  if (!props.activePath || !Array.isArray(node.children)) {
    return false;
  }

  const stack = [...node.children];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    if (current.type === "article" && current.path === props.activePath) {
      return true;
    }

    if (Array.isArray(current.children)) {
      stack.push(...current.children);
    }
  }

  return false;
}
</script>

<style scoped>
.tree-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.tree-list .tree-list {
  margin-top: 0.2rem;
  margin-left: 0.38rem;
  border-left: 1px dashed var(--border, #e6eaf0);
  padding-left: 0.55rem;
}

.tree-item {
  margin: 0.18rem 0;
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.tree-section,
.tree-article {
  flex: 1;
  width: 100%;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1.3;
  padding: 0.36rem 0.4rem;
  transition: background-color 0.16s ease, color 0.16s ease;
}

.tree-section {
  display: flex;
  align-items: center;
  gap: 0.38rem;
  color: #2f3c52;
  font-weight: 600;
}

.tree-section.contains-active {
  color: var(--accent-strong, #2563eb);
}

.tree-section.active {
  background: var(--accent-soft, #eaf2ff);
  color: var(--accent-strong, #2563eb);
  box-shadow: inset 2px 0 0 var(--accent, #3b82f6);
}

.tree-section.drop-target {
  background: var(--accent-soft, #eaf2ff);
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.35);
}

.tree-article {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.42rem;
  color: #56647d;
  padding-left: 0.95rem;
}

.tree-label {
  min-width: 0;
  overflow-wrap: anywhere;
}

.tree-arrow {
  position: relative;
  width: 0.92rem;
  height: 0.92rem;
  flex-shrink: 0;
}

.tree-arrow::before {
  content: "";
  position: absolute;
  top: 0.25rem;
  left: 0.2rem;
  width: 0.34rem;
  height: 0.34rem;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  opacity: 0.72;
  transform: rotate(-45deg);
  transition: transform 0.18s ease, opacity 0.18s ease;
}

.tree-arrow.open::before {
  opacity: 0.9;
  transform: rotate(45deg) translateY(-1px);
}

.tree-arrow-placeholder::before {
  display: none;
}

.tree-dot {
  width: 0.34rem;
  height: 0.34rem;
  border-radius: 999px;
  background: #c4cedd;
  flex-shrink: 0;
}

.tree-section:hover,
.tree-article:hover {
  background: #f2f6fc;
}

.tree-section:focus-visible,
.tree-article:focus-visible,
.tree-action:focus-visible {
  outline: 2px solid rgba(59, 130, 246, 0.3);
  outline-offset: 2px;
}

.tree-article.active {
  background: var(--accent-soft, #eaf2ff);
  color: var(--accent-strong, #2563eb);
  font-weight: 600;
  box-shadow: inset 2px 0 0 var(--accent, #3b82f6);
}

.tree-article.active .tree-dot {
  background: var(--accent, #3b82f6);
}

.tree-action {
  flex-shrink: 0;
  width: 1.7rem;
  height: 1.7rem;
  border: 1px solid var(--border, #e6eaf0);
  border-radius: 8px;
  background: #fff;
  color: #64748b;
  font-size: 0.86rem;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}

.tree-action:hover {
  background: #f3f6fb;
}

.tree-action.create {
  color: var(--accent-strong, #2563eb);
}

.tree-action.create:hover {
  border-color: rgba(59, 130, 246, 0.4);
  background: var(--accent-soft, #eaf2ff);
}

.tree-action.delete {
  color: #b42318;
}

.tree-action.delete:hover {
  border-color: #f2caca;
  background: #fff1f0;
}

@media (prefers-reduced-motion: reduce) {
  .tree-section,
  .tree-article,
  .tree-arrow::before,
  .tree-action {
    transition: none;
  }
}
</style>
