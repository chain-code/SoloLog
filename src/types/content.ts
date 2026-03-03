export interface ContentTreeResponse {
  generatedAt: string;
  docsSourceDir: string;
  nodes: ContentNode[];
}

export interface ContentNode {
  key: string;
  type: "section" | "article";
  title: string;
  path?: string;
  indexPath?: string;
  special?: boolean;
  weight?: number;
  bookFlatSection?: boolean;
  children?: ContentNode[];
}
