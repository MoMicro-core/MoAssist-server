import type { KnowledgeFile, OpenAIGateway, VectorSearchResult } from '../../../types';

export interface VectorStorePaths {
  chatbotDirectory: string;
  uploadsDirectory: string;
  knowledgeDirectory: string;
  indexDirectory: string;
}

export interface KnowledgeFileArtifact {
  directory: string;
  originalPath: string;
  textPath: string;
  manifestPath: string;
  vectorsPath: string;
  chunksCount: number;
}

export interface IndexArtifact {
  manifestPath: string;
  vectorsPath: string;
}

export interface VectorMatch {
  index: number;
  score: number;
}

export class VectorStore {
  constructor(args: {
    openai: OpenAIGateway;
    baseDirectory: string;
    binaryPath: string;
  });

  ensureChatbotDirectory(chatbotId: string): Promise<VectorStorePaths>;
  saveKnowledgeFile(args: {
    chatbotId: string;
    fileId: string;
    fileName: string;
    buffer: Buffer;
    text: string;
    embeddings: number[][];
    mimeType: string;
  }): Promise<KnowledgeFileArtifact>;
  rebuildIndex(chatbotId: string, files: KnowledgeFile[]): Promise<IndexArtifact>;
  createEmbeddings(chunks: string[]): Promise<number[][]>;
  search(chatbotId: string, query: string, limit?: number): Promise<VectorSearchResult[]>;
  searchWithBinary(
    vectorsPath: string,
    vector: number[],
    limit: number,
  ): Promise<VectorMatch[]>;
  searchWithJavascript(
    vectorsPath: string,
    vector: number[],
    limit: number,
  ): Promise<VectorMatch[]>;
}

export function chunkText(
  input: string,
  chunkSize?: number,
  overlap?: number,
): string[];
