import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const settingsFile = path.join(projectRoot, ".sololog-paths.json");

const defaultDocumentProjectPath = "C:/Users/tianzhiwei/Desktop/document";

const publicContentDir = path.join(projectRoot, "public", "content");
const publicDocsDir = path.join(publicContentDir, "docs");
const treeOutputFile = path.join(publicContentDir, "content-tree.json");
const homeOutputFile = path.join(publicContentDir, "_index.md");

async function main() {
  const { docsSourceDir, homeSourceFile } = await resolveContentSourcePaths();
  await ensurePathExists(docsSourceDir, "docs source directory");
  await ensurePathExists(homeSourceFile, "home markdown file");

  await fs.mkdir(publicContentDir, { recursive: true });
  await fs.rm(publicDocsDir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 120,
  });
  await fs.rm(path.join(publicContentDir, "content-search.json"), { force: true });
  await fs.cp(docsSourceDir, publicDocsDir, { recursive: true });
  await fs.copyFile(homeSourceFile, homeOutputFile);

  const rootSection = await buildSection(docsSourceDir, "");
  const treePayload = {
    generatedAt: new Date().toISOString(),
    docsSourceDir,
    nodes: rootSection.children,
  };

  await fs.writeFile(treeOutputFile, JSON.stringify(treePayload, null, 2), "utf8");

  const stats = summarizeNodes(rootSection.children);
  console.log(
    `[prepare:content] sections=${stats.sections}, articles=${stats.articles}, docs=${docsSourceDir}`,
  );
}

async function resolveContentSourcePaths() {
  const docsSourceDirFromEnv = process.env.DOCS_SOURCE_DIR?.trim();
  const homeSourceFileFromEnv = process.env.HOME_INDEX_FILE?.trim();
  if (docsSourceDirFromEnv && homeSourceFileFromEnv) {
    return {
      docsSourceDir: docsSourceDirFromEnv,
      homeSourceFile: homeSourceFileFromEnv,
    };
  }

  try {
    const raw = await fs.readFile(settingsFile, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.documentProjectPath === "string" && parsed.documentProjectPath.trim()) {
      const documentProjectPath = parsed.documentProjectPath.trim();
      return {
        docsSourceDir: path.join(documentProjectPath, "docs"),
        homeSourceFile: path.join(documentProjectPath, "_index.md"),
      };
    }
  } catch {
    // fallback to default path
  }

  return {
    docsSourceDir: path.join(defaultDocumentProjectPath, "docs"),
    homeSourceFile: path.join(defaultDocumentProjectPath, "_index.md"),
  };
}

async function ensurePathExists(targetPath, label) {
  try {
    await fs.access(targetPath);
  } catch {
    throw new Error(`Missing ${label}: ${targetPath}`);
  }
}

async function buildSection(absDir, relDir) {
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  const visibleEntries = entries.filter((entry) => !entry.name.startsWith("."));

  const indexFilePath = path.join(absDir, "_index.md");
  const hasIndex = await exists(indexFilePath);
  const indexMeta = hasIndex ? parseFrontMatter(await fs.readFile(indexFilePath, "utf8")).attrs : {};

  const sectionTitle =
    asString(indexMeta.title ?? indexMeta.tiltle) ??
    (relDir ? path.posix.basename(relDir) : "Docs");
  const sectionWeight = asNumber(indexMeta.weight);
  const sectionFlat = asBoolean(indexMeta.bookFlatSection);
  const sectionSpecial = asBoolean(indexMeta.special) ?? false;
  const sectionIndexPath = hasIndex && relDir ? toPosix(relDir, "_index.md") : undefined;

  const children = [];

  for (const entry of visibleEntries) {
    const absPath = path.join(absDir, entry.name);

    if (entry.isDirectory()) {
      const nextRel = toPosix(relDir, entry.name);
      const childSection = await buildSection(absPath, nextRel);
      if (childSection.children.length > 0 || childSection.special) {
        children.push(childSection);
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!entry.name.toLowerCase().endsWith(".md") || entry.name === "_index.md") {
      continue;
    }

    const relFilePath = toPosix(relDir, entry.name);
    const articleContent = await fs.readFile(absPath, "utf8");
    const parsedArticle = parseFrontMatter(articleContent);
    const articleMeta = parsedArticle.attrs;
    const title = asString(articleMeta.title) ?? removeExtension(entry.name);

    children.push({
      key: `article:${relFilePath}`,
      type: "article",
      title,
      path: relFilePath,
      weight: asNumber(articleMeta.weight),
    });
  }

  children.sort(sortNodes);

  return {
    key: `section:${relDir || "root"}`,
    type: "section",
    title: sectionTitle,
    path: relDir || undefined,
    indexPath: sectionIndexPath,
    special: sectionSpecial,
    weight: sectionWeight,
    bookFlatSection: sectionFlat,
    children,
  };
}

function sortNodes(left, right) {
  if (left.type !== right.type) {
    return left.type === "section" ? -1 : 1;
  }

  const leftWeight = left.weight ?? Number.MAX_SAFE_INTEGER;
  const rightWeight = right.weight ?? Number.MAX_SAFE_INTEGER;

  if (leftWeight !== rightWeight) {
    return leftWeight - rightWeight;
  }

  return left.title.localeCompare(right.title, "zh-Hans-CN");
}

function parseFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return {
      attrs: {},
      body: content,
    };
  }

  const attrs = {};
  const lines = match[1].split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const kvMatch = line.match(/^([A-Za-z0-9_\-]+)\s*:\s*(.+)$/);
    if (!kvMatch) {
      continue;
    }

    const key = kvMatch[1];
    const rawValue = kvMatch[2].trim();
    attrs[key] = normalizeValue(rawValue);
  }

  return {
    attrs,
    body: content.slice(match[0].length),
  };
}

function normalizeValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  if (/^-?\d+$/.test(value)) {
    return Number(value);
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return value;
}

function removeExtension(filename) {
  return filename.replace(/\.md$/i, "");
}

function asString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value) {
  return typeof value === "boolean" ? value : undefined;
}

function toPosix(...segments) {
  return segments
    .filter(Boolean)
    .join("/")
    .replace(/\\/g, "/");
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function summarizeNodes(nodes) {
  const result = {
    sections: 0,
    articles: 0,
  };

  const stack = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    if (node.type === "section") {
      result.sections += 1;
      if (Array.isArray(node.children)) {
        stack.push(...node.children);
      }
      continue;
    }

    result.articles += 1;
  }

  return result;
}

main().catch((error) => {
  console.error(`[prepare:content] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
