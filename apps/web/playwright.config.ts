import {defineConfig} from '@playwright/test';
const port=process.env.E2E_PORT||'3000';
const baseURL=`http://localhost:${port}`;
export default defineConfig({testDir:'tests/e2e',fullyParallel:false,workers:1,timeout:60000,use:{baseURL,trace:'retain-on-failure',screenshot:'only-on-failure'},reporter:'list',webServer:{command:'pnpm start',url:`${baseURL}/verifikasi`,env:{PORT:port,APP_ORIGIN:baseURL},reuseExistingServer:!process.env.CI,timeout:120000}});
