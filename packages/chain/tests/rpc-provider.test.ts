import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchRequest, toUtf8Bytes, toUtf8String } from 'ethers';
import { ChainConfigurationError, checkedProvider, rpcRequest } from '../src/shared';

// Infura answers an over-quota batch with HTTP 200 and bare error objects without ids.
const infuraBatchLimit = Array.from({ length: 3 }, () => ({ code: -32005, message: 'Too Many Requests', data: { see: 'https://infura.io/dashboard' } }));
const batchResult = [1, 2, 3].map(id => ({ jsonrpc: '2.0', id, result: '0x01' }));

function stubbed(...bodies: unknown[]) {
  const request = rpcRequest('https://rpc.invalid');
  request.setThrottleParams({ slotInterval: 1 });
  const calls = vi.fn();
  request.getUrlFunc = async () => {
    const body = bodies[Math.min(calls.mock.calls.length, bodies.length - 1)];
    calls();
    return { statusCode: 200, statusMessage: 'OK', headers: { 'content-type': 'application/json' }, body: toUtf8Bytes(JSON.stringify(body)) };
  };
  return { request, calls };
}
const json = async (request: ReturnType<typeof rpcRequest>) => JSON.parse(toUtf8String((await request.send()).body!));

describe('rpcRequest throttling', () => {
  it('retries a batch rejected entirely by the provider rate limit', async () => {
    const { request, calls } = stubbed(infuraBatchLimit, infuraBatchLimit, batchResult);
    expect(await json(request)).toEqual(batchResult);
    expect(calls).toHaveBeenCalledTimes(3);
  });

  it('retries a single JSON-RPC response rejected by the rate limit', async () => {
    const { request, calls } = stubbed({ jsonrpc: '2.0', id: 1, error: { code: -32005, message: 'daily request count exceeded, request rate limited' } }, { jsonrpc: '2.0', id: 1, result: '0xaa36a7' });
    expect(await json(request)).toEqual({ jsonrpc: '2.0', id: 1, result: '0xaa36a7' });
    expect(calls).toHaveBeenCalledTimes(2);
  });

  it('does not replay a batch in which some calls already executed', async () => {
    const partial = [batchResult[0], infuraBatchLimit[0]];
    const { request, calls } = stubbed(partial, batchResult);
    expect(await json(request)).toEqual(partial);
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it('does not retry -32005 errors that are not rate limits', async () => {
    const tooWide = { jsonrpc: '2.0', id: 1, error: { code: -32005, message: 'query returned more than 10000 results' } };
    const { request, calls } = stubbed(tooWide, { jsonrpc: '2.0', id: 1, result: [] });
    expect(await json(request)).toEqual(tooWide);
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it('keeps the bounded request timeout', () => {
    expect(rpcRequest('https://rpc.invalid').timeout).toBe(20_000);
  });
});

describe('checkedProvider', () => {
  const contractAddress = '0x' + '12'.repeat(20);
  let rpcUrl = '';
  let chainId = '0xaa36a7';
  const sent: unknown[] = [];
  const answer = (payload: { id: number; method: string }) => ({ jsonrpc: '2.0', id: payload.id,
    result: payload.method === 'eth_chainId' ? chainId : payload.method === 'eth_getCode' ? '0x6080' : '0x10' });
  function stubRpc() {
    rpcUrl = `https://rpc-${Math.random().toString(36).slice(2)}.invalid`; // Fresh URL: a fresh cache entry.
    chainId = '0xaa36a7'; sent.length = 0;
    FetchRequest.registerGetUrl(async request => {
      const body = JSON.parse(toUtf8String(request.body!));
      sent.push(body);
      const reply = Array.isArray(body) ? body.map(answer) : answer(body);
      return { statusCode: 200, statusMessage: 'OK', headers: { 'content-type': 'application/json' }, body: toUtf8Bytes(JSON.stringify(reply)) };
    });
  }
  const config = () => ({ rpcUrl, chainId: 11155111, contractAddress, confirmations: 2 });
  const methods = () => sent.flatMap(body => (Array.isArray(body) ? body : [body]).map(item => (item as { method: string }).method));
  afterEach(() => FetchRequest.registerGetUrl(FetchRequest.createGetUrlFunc()));

  it('verifies the network once and reuses one provider without re-detecting the chain', async () => {
    stubRpc();
    const [first, second] = await Promise.all([checkedProvider(config()), checkedProvider(config())]);
    expect(second).toBe(first);
    await Promise.all([first.send('eth_blockNumber', []), first.send('eth_blockNumber', []), (await checkedProvider(config())).send('eth_blockNumber', [])]);
    expect(methods().filter(method => method === 'eth_chainId')).toHaveLength(1);
    expect(methods().filter(method => method === 'eth_getCode')).toHaveLength(1);
    expect(methods().filter(method => method === 'eth_blockNumber')).toHaveLength(3);
  });

  it('sends every call on its own so a rate-limited reply never covers executed calls', async () => {
    stubRpc();
    const provider = await checkedProvider(config());
    await Promise.all([provider.send('eth_blockNumber', []), provider.send('eth_gasPrice', []), provider.send('eth_blockNumber', [])]);
    expect(sent.every(body => !Array.isArray(body))).toBe(true);
  });

  it('rejects a mismatched chain and checks again on the next request', async () => {
    stubRpc();
    chainId = '0x1';
    await expect(checkedProvider(config())).rejects.toBeInstanceOf(ChainConfigurationError);
    chainId = '0xaa36a7';
    await expect(checkedProvider(config())).resolves.toBeDefined();
    expect(methods().filter(method => method === 'eth_chainId')).toHaveLength(2);
  });
});
