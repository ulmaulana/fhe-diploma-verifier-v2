import tseslint from 'typescript-eslint';
export default tseslint.config(
  {ignores:['**/node_modules/**','**/.next/**','**/.well-known/workflow/**','**/generated/**','**/artifacts/**','**/cache/**','**/fhevmTemp/**']},
  ...tseslint.configs.recommended,
  {files:['**/*.ts','**/*.tsx'],rules:{'@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}],'@typescript-eslint/no-explicit-any':'error','no-debugger':'error','eqeqeq':['error','smart']}},
);
