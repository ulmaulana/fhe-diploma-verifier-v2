import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
import { resolve, relative } from "node:path";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";

// Packages that locate their own WASM, workers or data files relative to their
// install directory at runtime. They stay external and ship whole.
const RUNTIME_ASSET_PACKAGES = [
  '@zama-fhe/relayer-sdk',
  'tesseract.js', 'mupdf', 'zxing-wasm', '@tesseract.js-data/ind', '@tesseract.js-data/eng',
];

// Trace the installed production dependency closure, including pnpm's lookup
// aliases. A glob over the SDK directory alone misses dependencies of ethers.
function runtimeTraceIncludes() {
  const patterns = new Set<string>();
  const visited = new Set<string>();
  function visit(name: string, owner: string, optional = false) {
    const lookup = createRequire(resolve(owner, 'package.json'));
    const directory = lookup.resolve.paths(`${name}/package.json`)?.map(base => resolve(base, name))
      .find(candidate => existsSync(resolve(candidate, 'package.json')));
    if (!directory) {
      if (optional) return;
      throw new Error(`Missing runtime production dependency: ${name}`);
    }
    patterns.add(`${relative(__dirname, directory).replaceAll('\\', '/')}/**/*`);
    const canonical = realpathSync(directory);
    if (visited.has(canonical)) return;
    visited.add(canonical);
    const manifest = JSON.parse(readFileSync(resolve(canonical, 'package.json'), 'utf8'));
    for (const dependency of Object.keys(manifest.dependencies || {})) visit(dependency, canonical);
    for (const dependency of Object.keys(manifest.optionalDependencies || {})) visit(dependency, canonical, true);
  }
  for (const name of RUNTIME_ASSET_PACKAGES) visit(name, __dirname);
  return [...patterns];
}
const config: NextConfig = {
  // pnpm dependencies and chain/WASM packages live outside apps/web.
  outputFileTracingRoot: resolve(__dirname, "../.."),
  // Workflow's generated dynamic require is opaque to Next's static tracer, and the
  // OCR package resolves language data and zxing's WASM at runtime from the app
  // directory. Include each external subtree, including its WASM and data files.
  outputFileTracingIncludes: {
    '/*': [...runtimeTraceIncludes(), './src/server/assets/**/*'],
  },
  devIndicators: false,
  agentRules: false,
  transpilePackages: ["@verifikasi/domain", "@verifikasi/chain", "@verifikasi/ocr"],
  poweredByHeader: false,
  // These engines resolve their WASM, worker scripts or data relative to their own
  // directory. Bundling them into a Next chunk would move that directory away from
  // the shipped binaries.
  serverExternalPackages: ["pg", "node-tfhe", "node-tkms", ...RUNTIME_ASSET_PACKAGES],
  // Optional peers of the wallet stack: MetaMask SDK's React Native storage and
  // pino's pretty printer. Neither runs in this web build, so resolve them empty.
  webpack(webpackConfig) {
    webpackConfig.resolve.alias = {
      ...webpackConfig.resolve.alias,
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };
    return webpackConfig;
  },
  async headers() { return [{ source: "/(.*)", headers: [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "same-origin" },
    { key: "X-Frame-Options", value: "DENY" }
  ] }]; }
};
export default withWorkflow(config);
