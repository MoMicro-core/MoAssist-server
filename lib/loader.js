'use strict';

const fsp = require('node:fs').promises;
const path = require('node:path');

const loadDir = async (dir) => {
  const files = await fsp.readdir(dir, { withFileTypes: true });
  const container = {};
  for (const entry of files) {
    const fileName = entry.name;
    if (entry.isDirectory()) {
      const filePath = path.join(dir, fileName);
      container[fileName] = await loadDir(filePath);
      continue;
    }
    if (!fileName.endsWith('.js')) continue;
    const filePath = path.join(dir, fileName);
    const name = path.basename(fileName, '.js');
    container[name] = require(filePath);
  }
  return container;
};

const loadApplication = async (appPath = process.cwd()) => {
  const apiPath = path.join(appPath, './api');
  const configPath = path.join(appPath, './config');
  const config = await loadDir(configPath);
  const api = await loadDir(apiPath);
  return { api, config };
};

module.exports = { loadDir, loadApplication };
