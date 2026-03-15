export interface ExtractTextInput {
  buffer: Buffer;
  fileName?: string;
  mimeType?: string;
}

export function extractTextFromBuffer(
  input: ExtractTextInput,
): Promise<string>;
