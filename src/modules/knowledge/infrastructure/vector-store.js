'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { spawn } = require('node:child_process');

const sanitizeFileName = (value) =>
  value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');

const chunkText = (input, chunkSize = 1500, overlap = 250) => {
  const text = input.replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const chunks = [];
  let cursor = 0;
  const step = Math.max(1, chunkSize - overlap);

  while (cursor < text.length) {
    const chunk = text.slice(cursor, cursor + chunkSize).trim();
    if (chunk) chunks.push(chunk);
    cursor += step;
  }

  return chunks;
};

const toFloatBuffer = (vector) => {
  const buffer = Buffer.alloc(vector.length * 4);
  vector.forEach((value, index) => {
    buffer.writeFloatLE(value, index * 4);
  });
  return buffer;
};

const parseSearchOutput = (stdout) =>
  stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [index, score] = line.split('\t');
      return { index: Number(index), score: Number(score) };
    })
    .filter((item) => Number.isFinite(item.index));

class VectorStore {
  constructor({ openai, baseDirectory, binaryPath }) {
    this.openai = openai;
    this.baseDirectory = baseDirectory;
    this.binaryPath = binaryPath;
  }

  async ensureChatbotDirectory(chatbotId) {
    const chatbotDirectory = path.join(
      this.baseDirectory,
      'chatbots',
      chatbotId,
    );
    const uploadsDirectory = path.join(chatbotDirectory, 'uploads');
    const knowledgeDirectory = path.join(chatbotDirectory, 'knowledge');
    const indexDirectory = path.join(chatbotDirectory, 'index');

    await Promise.all([
      fs.mkdir(uploadsDirectory, { recursive: true }),
      fs.mkdir(knowledgeDirectory, { recursive: true }),
      fs.mkdir(indexDirectory, { recursive: true }),
    ]);

    return {
      chatbotDirectory,
      uploadsDirectory,
      knowledgeDirectory,
      indexDirectory,
    };
  }

  async saveKnowledgeFile({
    chatbotId,
    fileId,
    fileName,
    buffer,
    text,
    embeddings,
    mimeType,
  }) {
    const directories = await this.ensureChatbotDirectory(chatbotId);
    const safeName = sanitizeFileName(fileName);
    const directory = path.join(directories.knowledgeDirectory, fileId);
    await fs.mkdir(directory, { recursive: true });

    const originalPath = path.join(
      directories.uploadsDirectory,
      `${fileId}-${safeName}`,
    );
    const textPath = path.join(directory, 'source.txt');
    const manifestPath = path.join(directory, 'manifest.json');
    const vectorsPath = path.join(directory, 'vectors.bin');

    const chunks = chunkText(text);
    const manifest = {
      id: fileId,
      name: fileName,
      mimeType,
      chunks: chunks.map((content, index) => ({
        id: `${fileId}:${index}`,
        content,
      })),
    };

    const vectorBuffer = Buffer.concat(embeddings.map(toFloatBuffer));

    await Promise.all([
      fs.writeFile(originalPath, buffer),
      fs.writeFile(textPath, text, 'utf8'),
      fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8'),
      fs.writeFile(vectorsPath, vectorBuffer),
    ]);

    return {
      directory,
      originalPath,
      textPath,
      manifestPath,
      vectorsPath,
      chunksCount: chunks.length,
    };
  }

  async rebuildIndex(chatbotId, files) {
    const directories = await this.ensureChatbotDirectory(chatbotId);
    const manifestEntries = [];
    const buffers = [];

    for (const file of files) {
      const [manifestRaw, vectorsBuffer] = await Promise.all([
        fs.readFile(file.manifestPath, 'utf8'),
        fs.readFile(file.vectorsPath),
      ]);
      const manifest = JSON.parse(manifestRaw);
      manifestEntries.push(
        ...manifest.chunks.map((chunk) => ({
          id: chunk.id,
          fileId: file.id,
          fileName: file.name,
          content: chunk.content,
        })),
      );
      buffers.push(vectorsBuffer);
    }

    await Promise.all([
      fs.writeFile(
        path.join(directories.indexDirectory, 'manifest.json'),
        JSON.stringify(manifestEntries, null, 2),
        'utf8',
      ),
      fs.writeFile(
        path.join(directories.indexDirectory, 'vectors.bin'),
        Buffer.concat(buffers),
      ),
    ]);

    return {
      manifestPath: path.join(directories.indexDirectory, 'manifest.json'),
      vectorsPath: path.join(directories.indexDirectory, 'vectors.bin'),
    };
  }

  async createEmbeddings(chunks) {
    return this.openai.createEmbeddings(chunks);
  }

  async search(chatbotId, query, limit = 5) {
    const indexDirectory = path.join(
      this.baseDirectory,
      'chatbots',
      chatbotId,
      'index',
    );
    const manifestPath = path.join(indexDirectory, 'manifest.json');
    const vectorsPath = path.join(indexDirectory, 'vectors.bin');

    if (!existsSync(manifestPath) || !existsSync(vectorsPath)) return [];

    const [manifestRaw, vector] = await Promise.all([
      fs.readFile(manifestPath, 'utf8'),
      this.openai.createEmbedding(query),
    ]);

    const manifest = JSON.parse(manifestRaw);
    if (!manifest.length) return [];

    const matches = existsSync(this.binaryPath)
      ? await this.searchWithBinary(vectorsPath, vector, limit)
      : await this.searchWithJavascript(vectorsPath, vector, limit);

    return matches
      .map((match) => ({
        ...manifest[match.index],
        score: match.score,
      }))
      .filter((entry) => entry.content);
  }

  async searchWithBinary(vectorsPath, vector, limit) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binaryPath, [
        vectorsPath,
        String(vector.length),
        String(limit),
      ]);
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', reject);

      child.on('close', async (code) => {
        if (code !== 0) {
          try {
            resolve(
              await this.searchWithJavascript(vectorsPath, vector, limit),
            );
          } catch (error) {
            reject(new Error(stderr || error.message));
          }
          return;
        }
        resolve(parseSearchOutput(stdout));
      });

      child.stdin.end(toFloatBuffer(vector));
    });
  }

  async searchWithJavascript(vectorsPath, vector, limit) {
    const file = await fs.readFile(vectorsPath);
    const values = new Float32Array(
      file.buffer,
      file.byteOffset,
      file.byteLength / 4,
    );
    const dimension = vector.length;
    const scores = [];

    for (let index = 0; index < values.length / dimension; index += 1) {
      let score = 0;
      const offset = index * dimension;
      for (let position = 0; position < dimension; position += 1) {
        score += values[offset + position] * vector[position];
      }
      scores.push({ index, score });
    }

    return scores
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }
}

module.exports = { VectorStore, chunkText };
