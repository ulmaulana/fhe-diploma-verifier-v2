import {describe,it,expect} from 'vitest';
import {assertChainConfig, contractInterface} from '../src/shared';
describe('chain boundary',()=>{
  it('rejects unsupported network, missing RPC and zero contract',()=>{
    const c={chainId:11155111,rpcUrl:'https://rpc.example',contractAddress:'0x'+'12'.repeat(20)};
    expect(()=>assertChainConfig({...c,chainId:1})).toThrow('Sepolia');
    expect(()=>assertChainConfig({...c,rpcUrl:''})).toThrow('RPC');
    expect(()=>assertChainConfig({...c,contractAddress:'0x'+'00'.repeat(20)})).toThrow();
    expect(assertChainConfig({...c,confirmations:1}).confirmations).toBe(2);
  });
  it('consumes generated ABI with bytes32 input binding and private comparison',()=>{
    const verify=contractInterface.getFunction('verify');
    expect(verify?.inputs[0]?.components?.map(c=>c.name)).toContain('uploadCommitment');
    expect(verify?.inputs[1]?.type).toBe('bytes32[4]');
    expect(contractInterface.getFunction('getComparison')).not.toBeNull();
  });
});
