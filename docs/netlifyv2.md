7:22:23 PM: build-image version: 7a1e7ed00899c543db47ec830f049923edb8731f (noble-new-builds)
7:22:23 PM: buildbot version: cf5224f6f98dc5f5fb728b906142adbb63361b91
7:22:23 PM: Building with cache
7:22:23 PM: Starting to prepare the repo for build
7:22:23 PM: Preparing Git Reference refs/heads/main
7:22:25 PM: Installing dependencies
7:22:25 PM: mise by @jdx – installing 1 tool
7:22:25 PM: mise ⇢ python@3.14.3  2ms · already installed
7:22:25 PM: mise ████████████████ 1/1 · installed 0 tools · 1 already installed in 4ms
7:22:25 PM: mise ~/.config/mise/config.toml tools: python@3.14.3
7:22:25 PM: mise by @jdx – installing 1 tool
7:22:25 PM: mise ⇢ ruby@3.4.8  1ms · already installed
7:22:25 PM: mise ████████████████ 1/1 · installed 0 tools · 1 already installed in 1ms
7:22:25 PM: mise ~/.config/mise/config.toml tools: ruby@3.4.8
7:22:26 PM: mise by @jdx – installing 1 tool
7:22:26 PM: mise ⇢ go@1.26.2  1ms · already installed
7:22:26 PM: mise ████████████████ 1/1 · installed 0 tools · 1 already installed in 2ms
7:22:26 PM: mise ~/.config/mise/config.toml tools: go@1.26.2
7:22:26 PM: v24.21.0 is already installed.
7:22:26 PM: Now using node v24.21.0 (npm v11.19.0)
7:22:26 PM: Enabling Node.js Corepack
7:22:27 PM: pnpm workspaces detected
7:22:27 PM: Installing npm packages using pnpm version 10.19.0
7:22:27 PM: Scope: all 8 workspace projects
7:22:27 PM: Lockfile is up to date, resolution step is skipped
7:22:29 PM: Already up to date
7:22:31 PM: ╭ Warning ─────────────────────────────────────────────────────────────────────╮
7:22:31 PM: │                                                                              │
7:22:31 PM: │   Ignored build scripts: @swc/core, bufferutil, cbor-extract,                │
7:22:31 PM: │   tesseract.js, utf-8-validate.                                              │
7:22:31 PM: │   Run "pnpm approve-builds" to pick which dependencies should be allowed     │
7:22:31 PM: │   to run scripts.                                                            │
7:22:31 PM: │                                                                              │
7:22:31 PM: ╰──────────────────────────────────────────────────────────────────────────────╯
7:22:31 PM: Done in 3.5s using pnpm v10.19.0
7:22:31 PM: npm packages installed using pnpm
7:22:31 PM: Successfully installed dependencies
7:22:31 PM: Detected 0 framework(s)
7:22:32 PM: Starting build script
7:22:32 PM: Section completed: initializing
Building
Complete
7:22:34 PM: Netlify Build
7:22:34 PM: ────────────────────────────────────────────────────────────────
7:22:34 PM: ​
7:22:34 PM: ❯ Version
7:22:34 PM:   @netlify/build 37.0.0
7:22:34 PM: ​
7:22:34 PM: ❯ Flags
7:22:34 PM:   accountId: 6ab6640137cdee84cecf4071
7:22:34 PM:   baseRelDir: true
7:22:34 PM:   buildId: 6ab6677e69daada084c8f3b5
7:22:34 PM:   deployId: 6ab6677e69daada084c8f3b7
7:22:34 PM:   packagePath: apps/web
7:22:34 PM: ​
7:22:34 PM: ❯ Current directory
7:22:34 PM:   /opt/build/repo
7:22:34 PM: ​
7:22:34 PM: ❯ Config file
7:22:34 PM:   No config file was defined: using default values.
7:22:34 PM: ​
7:22:34 PM: ❯ Context
7:22:34 PM:   production
7:22:34 PM: ​
7:22:34 PM: Build command from Netlify app
7:22:34 PM: ────────────────────────────────────────────────────────────────
7:22:34 PM: ​
7:22:34 PM: $ pnpm --filter @verifikasi/web build:vercel
7:22:34 PM: > @verifikasi/web@0.1.0 build:vercel /opt/build/repo/apps/web
7:22:34 PM: > pnpm --filter @verifikasi/contracts build && pnpm build
7:22:34 PM: > @verifikasi/contracts@0.1.0 build /opt/build/repo/contracts
7:22:34 PM: > node scripts/build.cjs
7:22:53 PM: Compiled 24 Solidity files successfully (evm target: cancun).
7:22:53 PM: > @verifikasi/web@0.1.0 build /opt/build/repo/apps/web
7:22:53 PM: > node ../../scripts/run-web.mjs build && node ../../scripts/check-deployment.mjs
7:22:54 PM: ▲ Next.js 16.3.6 (webpack)
7:22:56 PM: workflows build complete (10 steps, 1 workflow, time 71ms)
7:22:56 PM: ✓ Running next.config.ts took 1689ms
7:22:56 PM: ⚠ No build cache found. Please configure build caching for faster rebuilds. Read more: https://nextjs.org/docs/messages/no-cache
7:22:56 PM:   Creating an optimized production build ...
7:23:42 PM: ⚠ Compiled with warnings in 45s
7:23:42 PM: Circular dependency between chunks with runtime (5733, webpack, 8114)
7:23:42 PM: This prevents using hashes of each other and should be avoided.
7:23:42 PM: ../../node_modules/.pnpm/@vercel+queue@0.3.1/node_modules/@vercel/queue/dist/index.mjs
7:23:42 PM: Critical dependency: the request of a dependency is an expression
7:23:42 PM: Import trace for requested module:
7:23:42 PM: ../../node_modules/.pnpm/@vercel+queue@0.3.1/node_modules/@vercel/queue/dist/index.mjs
7:23:42 PM: ../../node_modules/.pnpm/@workflow+world-vercel@4.7.4/node_modules/@workflow/world-vercel/dist/queue.js
7:23:42 PM: ../../node_modules/.pnpm/@workflow+world-vercel@4.7.4/node_modules/@workflow/world-vercel/dist/index.js
7:23:42 PM: ../../node_modules/.pnpm/@workflow+core@4.8.9_ws@8.18.0_bufferutil@4.1.0_utf-8-validate@5.0.10_/node_modules/@workflow/core/dist/runtime/world.js
7:23:42 PM: ../../node_modules/.pnpm/@workflow+core@4.8.9_ws@8.18.0_bufferutil@4.1.0_utf-8-validate@5.0.10_/node_modules/@workflow/core/dist/runtime.js
7:23:42 PM: ../../node_modules/.pnpm/workflow@4.8.9_@nestjs+common@12.1.0_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+core@12_f2c36362d6c8fe1c13d0a6fab827744c/node_modules/workflow/dist/runtime.js
7:23:42 PM: ./src/app/.well-known/workflow/v1/flow/route.js
7:23:42 PM:   Running TypeScript ...
7:23:52 PM:   Finished TypeScript in 10.3s ...
7:23:52 PM:   Collecting page data using 2 workers ...
7:23:53 PM:   Generating static pages using 2 workers (0/17) ...
7:23:53 PM:   Generating static pages using 2 workers (4/17)
7:23:56 PM:   Generating static pages using 2 workers (8/17)
7:23:56 PM:   Generating static pages using 2 workers (12/17)
7:23:56 PM: ✓ Generating static pages using 2 workers (17/17) in 2.7s
7:23:58 PM:   Finalizing page optimization ...
7:23:58 PM:   Collecting build traces ...
7:24:14 PM: Route (app)
7:24:14 PM: ┌ ○ /
7:24:14 PM: ├ ○ /_not-found
7:24:14 PM: ├ ƒ /.well-known/workflow/v1/flow
7:24:14 PM: ├ ƒ /.well-known/workflow/v1/step
7:24:14 PM: ├ ƒ /.well-known/workflow/v1/webhook/[token]
7:24:14 PM: ├ ƒ /api/credentials/[id]
7:24:14 PM: ├ ƒ /api/credentials/[id]/document
7:24:14 PM: ├ ƒ /api/credentials/[id]/document/download
7:24:14 PM: ├ ƒ /api/credentials/[id]/proof
7:24:14 PM: ├ ƒ /api/credentials/[id]/verification
7:24:14 PM: ├ ƒ /api/credentials/drafts
7:24:14 PM: ├ ƒ /api/demo
7:24:14 PM: ├ ƒ /api/internal/maintenance
7:24:14 PM: ├ ƒ /api/portal/challenge
7:24:14 PM: ├ ƒ /api/portal/config
7:24:14 PM: ├ ƒ /api/portal/session
7:24:14 PM: ├ ƒ /api/session
7:24:14 PM: ├ ƒ /api/uploads/[id]/finalize
7:24:14 PM: ├ ƒ /api/uploads/intents
7:24:14 PM: ├ ƒ /api/uploads/token
7:24:14 PM: ├ ƒ /api/verifications
7:24:14 PM: ├ ƒ /api/verifications/[id]
7:24:14 PM: ├ ƒ /api/verifications/[id]/report
7:24:14 PM: ├ ƒ /api/verifications/[id]/retry
7:24:14 PM: ├ ○ /bantuan
7:24:14 PM: ├ ƒ /c/[credentialId]
7:24:14 PM: ├ ○ /icon.svg
7:24:14 PM: ├ ƒ /panduan
7:24:14 PM: ├ ƒ /penerbit
7:24:14 PM: ├ ○ /riwayat
7:24:14 PM: └ ƒ /verifikasi
7:24:14 PM: ○  (Static)   prerendered as static content
7:24:14 PM: ƒ  (Dynamic)  server-rendered on demand
7:24:17 PM: Traced Node SDK imports with TFHE/TKMS WASM; PostgreSQL driver imports successfully.
7:24:19 PM: Traced OCR engines (MuPDF, zxing, tesseract.js ind+eng) read the synthetic fixture from the app directory.
7:24:19 PM: Deployment trace includes Node SDK, both WASM engines, PostgreSQL and OCR engines with ind+eng data (161 MiB before platform packaging).
7:24:19 PM: ​
7:24:19 PM: (build.command completed in 1m 45s)
7:24:19 PM: ​
7:24:26 PM: (Netlify Build completed in 1m 52.4s)
7:24:27 PM: Section completed: building
7:24:40 PM: Finished processing build request in 2m16.371s
Deploying
Complete
7:24:19 PM: Deploy site
7:24:19 PM: ────────────────────────────────────────────────────────────────
7:24:19 PM: ​
7:24:19 PM: Starting to deploy site from 'apps/web/.next'
7:24:20 PM: Calculating files to upload
7:24:22 PM: 550 new file(s) to upload
7:24:22 PM: 0 new function(s) to upload
7:24:23 PM: Starting to upload
7:24:23 PM: 10% uploaded
7:24:23 PM: 20% uploaded
7:24:23 PM: 30% uploaded
7:24:24 PM: 40% uploaded
7:24:24 PM: 50% uploaded
7:24:24 PM: 60% uploaded
7:24:24 PM: 70% uploaded
7:24:24 PM: 80% uploaded
7:24:24 PM: 90% uploaded
7:24:26 PM: 100% uploaded
7:24:26 PM: Section completed: deploying
7:24:26 PM: Site deploy was successfully initiated
7:24:26 PM: ​
7:24:26 PM: (Deploy site completed in 7.2s)
Cleanup
Complete
7:24:26 PM: Netlify Build Complete
7:24:26 PM: ────────────────────────────────────────────────────────────────
7:24:26 PM: ​
7:24:27 PM: Caching artifacts
7:24:38 PM: Uploading cache of size 398.8MB
7:24:39 PM: Section completed: cleanup
Post-processing
Complete
7:24:26 PM: Starting post processing
7:24:26 PM: Skipping form detection
7:24:26 PM: Post processing - header rules
7:24:26 PM: Post processing - redirect rules
7:24:26 PM: Post processing done
7:24:26 PM: Section completed: postprocessing
7:24:27 PM: Site is live ✨