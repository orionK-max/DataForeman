#!/usr/bin/env node

/**
 * Filter and format libplctag debug output
 * - Strip duplicate timestamps (2025-10-15 14:15:35.376)
 * - Add [EIP] badge for clarity
 * - Pass through other lines unchanged
 */

import { Transform } from 'stream';

// Regex to match libplctag timestamp format: YYYY-MM-DD HH:MM:SS.mmm
const timestampRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} /;

// Create transform stream with line-by-line processing
const filterStream = new Transform({
  transform(chunk, encoding, callback) {
    const lines = chunk.toString().split('\n');
    const filtered = lines.map(line => {
      if (timestampRegex.test(line)) {
        // Strip timestamp and add [EIP] badge
        return '[EIP] ' + line.replace(timestampRegex, '');
      }
      return line;
    }).join('\n');
    
    callback(null, filtered);
  }
});

// Pipe stdin through filter to stdout
process.stdin.pipe(filterStream).pipe(process.stdout);

// Handle errors
filterStream.on('error', (err) => {
  console.error('Filter error:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});
