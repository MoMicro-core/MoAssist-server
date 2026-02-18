'use strict';

const path = require('node:path');
const fsp = require('node:fs/promises');
async function getFilesRecursively(rootDir, currentDir = '') {
  const dirPath = path.join(rootDir, currentDir);
  const filesList = [];

  try {
    const items = await fsp.readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      const itemRelativePath = path.join(currentDir, item.name);

      if (item.isFile()) {
        filesList.push(itemRelativePath);
      } else if (item.isDirectory()) {
        const nestedFiles = await getFilesRecursively(
          rootDir,
          itemRelativePath,
        );
        filesList.push(...nestedFiles);
      }
    }

    return filesList;
  } catch (error) {
    console.error(`Error reading directory "${dirPath}":`, error.message);
    return [];
  }
}
module.exports = {
  edit: {
    type: 'post',
    access: ['admin'],
    handler: async ({ filePath, files }) => {
      if (Array.isArray(files)) return { message: 'Only one file is allowed' };
      const uploadPath = path.join(process.cwd(), 'static', filePath);
      await fsp.mkdir(path.dirname(uploadPath), { recursive: true });
      const { _buf: fileBuffer } = files;
      await fsp.writeFile(uploadPath, fileBuffer);
      return { message: 'File uploaded successfully' };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Upload static file',
      description:
        'Upload a file to the static assets directory. Use ' +
        'multipart/form-data with the file in the "files" key, session ' +
        '"token", and "filePath" specifying the destination path within ' +
        'the static directory. Admin access required.' +
        '\n\nFields (multipart/form-data):' +
        '\n- required: token, filePath, files (single file)',
      consumes: ['multipart/form-data'],
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
  },

  getAll: {
    type: 'post',
    access: ['admin'],
    handler: async () => {
      const dirPath = path.join(process.cwd(), 'static');
      console.log(process.cwd());
      console.log({ dirPath });
      const filesList = await getFilesRecursively(dirPath);

      return { files: filesList };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Get all static files',
      description:
        'Retrieve a list of all files in the static assets directory, ' +
        'including files in subdirectories. Returns relative file paths. ' +
        'Admin access required.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            files: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  },
};
