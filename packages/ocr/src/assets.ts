/**
 * Resolve package files at runtime from the application directory. Bundlers rewrite module
 * paths (import.meta.url, __dirname) of transpiled code, so this code must not depend on them.
 * The builtin is fetched through process.getBuiltinModule to keep it opaque to the bundler.
 */
function runtimeRequire(): NodeJS.Require {
  const { createRequire } = process.getBuiltinModule('node:module');
  const { join } = process.getBuiltinModule('node:path');
  const { existsSync } = process.getBuiltinModule('node:fs');
  // Native Netlify functions start at the repository root; Next starts at apps/web.
  const app = join(process.cwd(), 'apps/web/package.json');
  return createRequire(existsSync(app) ? app : join(process.cwd(), 'noop.js'));
}

export function resolveRuntimeAsset(specifier: string): string {
  return runtimeRequire().resolve(specifier);
}

export function requireRuntimeModule<T>(specifier: string): T {
  return runtimeRequire()(specifier) as T;
}
