import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';
import { terser } from 'rollup-plugin-terser';

import { preserveShebangs } from 'rollup-plugin-preserve-shebangs';

export default [
  {
    input: 'src/expoize.ts',
    output: [
      { file: 'build/expoize.js', format: 'cjs' },
      { file: 'build/expoize.min.js', format: 'cjs', plugins: [terser()] },
      { file: 'build/expoize.esm.js', format: 'esm' },
    ],
    plugins: [typescript(), preserveShebangs()],
  },
  {
    input: 'src/types.ts',
    output: [{ file: 'build/expoize.d.ts', format: 'es' }],
    plugins: [dts()],
  },
];
