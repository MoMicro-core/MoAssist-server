'use strict';

const fs = require('node:fs');
const util = require('node:util');
const path = require('node:path');

const DATETIME_LENGTH = 23;

class Logger {
  constructor(logPath) {
    this.path = logPath;
    // const filePath = path.join(logPath, `${itemName}.log`);
    // this.stream = fs.createWriteStream(filePath, { flags: 'a' });
    this.regexp = new RegExp(path.dirname(this.path), 'g');
  }

  close() {
    return new Promise((resolve) => this.stream.end(resolve));
  }

  write(s) {
    const now = new Date().toISOString();
    const date = now.substring(0, DATETIME_LENGTH);
    const line = date + '\t' + s;
    const out = line.replace(/[\n\r]\s*/g, '; ') + '\n';
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;
    const stream = fs.createWriteStream(
      path(this.path, formattedDate + '.log'),
      { flags: 'a' },
    );
    stream.write(out);
  }

  log(...args) {
    const msg = util.format(...args);
    this.write(msg);
  }
}

module.exports = () => Object.freeze(new Logger('./log'));
