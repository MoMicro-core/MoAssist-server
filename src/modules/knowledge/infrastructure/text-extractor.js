'use strict';

const path = require('node:path');
const { PDFParse } = require('pdf-parse');
const { BadRequestError } = require('../../../shared/application/errors');

const toExtension = (fileName = '') => path.extname(fileName).toLowerCase();

const extractJsonText = (buffer) => {
  const content = buffer.toString('utf8');
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
};

const extractPdfText = async (buffer) => {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
};

const extractTextFromBuffer = async ({ buffer, fileName, mimeType }) => {
  const extension = toExtension(fileName);

  if (extension === '.txt' || mimeType === 'text/plain') {
    return buffer.toString('utf8');
  }

  if (extension === '.json' || mimeType === 'application/json') {
    return extractJsonText(buffer);
  }

  if (extension === '.pdf' || mimeType === 'application/pdf') {
    return extractPdfText(buffer);
  }

  throw new BadRequestError('Only pdf, txt and json files are supported');
};

module.exports = { extractTextFromBuffer };
