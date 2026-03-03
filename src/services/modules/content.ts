import type { ContentTreeResponse } from "@/types/content";

const CONTENT_ROOT = "/content";

export async function fetchContentTree(): Promise<ContentTreeResponse> {
  const response = await fetch(`${CONTENT_ROOT}/content-tree.json`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to load content tree. Run npm run prepare:content first.");
  }

  return (await response.json()) as ContentTreeResponse;
}

export async function fetchHomeMarkdown(): Promise<string> {
  return fetchMarkdown(`${CONTENT_ROOT}/_index.md`);
}

export async function fetchArticleMarkdown(articlePath: string): Promise<string> {
  const encodedPath = articlePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return fetchMarkdown(`${CONTENT_ROOT}/docs/${encodedPath}`);
}

async function fetchMarkdown(url: string): Promise<string> {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load markdown file: ${url}`);
  }

  return await response.text();
}
