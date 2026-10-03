import { maintainNetlifyJobs } from '../server/netlify-queue';

export default async () => { await maintainNetlifyJobs(); };
// The build adds the schedule and runtime asset includes to the generated entrypoint.
