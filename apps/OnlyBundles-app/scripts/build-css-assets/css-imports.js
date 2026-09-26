import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

export function resolveCssImports(sourcePath, css, seen = new Set()) {
  const sourceDir = dirname(sourcePath);

  return css.replace(
    /@import\s+(?:url\()?['"]([^'")]+)['"]\)?\s*;/g,
    (statement, importPath) => {
      if (/^(?:https?:)?\/\//.test(importPath) || importPath.startsWith('/')) {
        return statement;
      }

      const resolvedPath = join(sourceDir, importPath);
      if (seen.has(resolvedPath)) {
        return '';
      }
      if (!existsSync(resolvedPath)) {
        throw new Error(`Missing CSS import ${importPath} from ${sourcePath}`);
      }

      seen.add(resolvedPath);
      return resolveCssImports(resolvedPath, readFileSync(resolvedPath, 'utf-8'), seen);
    },
  );
}
