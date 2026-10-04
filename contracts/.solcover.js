// solidity-coverage settings. The contract is compiled with viaIR; configureYulOptimizer keeps the
// instrumented build compilable. The FHEVM mock plugin detects coverage runs on its own.
module.exports = {
  istanbulReporter: ['text', 'text-summary', 'json-summary', 'html', 'lcov'],
  configureYulOptimizer: true,
  skipFiles: [],
};
