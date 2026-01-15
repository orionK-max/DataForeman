import path from 'path';
import fs from 'fs/promises';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export function getAllowedPaths() {
  const pathsEnv = process.env.FLOW_ALLOWED_PATHS || '';
  if (!pathsEnv) return [];

  return pathsEnv
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => path.resolve(p));
}

export function validateAndResolvePath(filePath, allowedPaths) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new Error('Path must be a non-empty string');
  }

  // Basic hardening
  if (filePath.includes('\u0000')) {
    throw new Error('Invalid path');
  }

  const resolvedPath = path.resolve(filePath);

  if (!Array.isArray(allowedPaths) || allowedPaths.length === 0) {
    throw new Error('No filesystem paths are configured. Set FLOW_ALLOWED_PATHS environment variable.');
  }

  const isAllowed = allowedPaths.some(allowedBasePath => {
    const base = path.resolve(allowedBasePath);
    const relative = path.relative(base, resolvedPath);
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  });

  if (!isAllowed) {
    throw new Error(`Access denied: Path '${filePath}' is not in allowed paths`);
  }

  return resolvedPath;
}

export async function readFileLimited(resolvedPath, encoding = 'utf8') {
  const stats = await fs.stat(resolvedPath);
  if (stats.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File too large: ${stats.size} bytes (max ${MAX_FILE_SIZE_BYTES})`);
  }

  if (encoding === null) {
    return fs.readFile(resolvedPath);
  }

  return fs.readFile(resolvedPath, encoding);
}

export async function ensureParentDirExists(resolvedPath) {
  const dir = path.dirname(resolvedPath);
  await fs.mkdir(dir, { recursive: true });
}
