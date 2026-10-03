import { handle, json } from '@/server/http';
import { uploadToken } from '@/server/uploads';
export const runtime = 'nodejs';
export const POST = (request: Request) => handle(async () => json(await uploadToken(request)));
