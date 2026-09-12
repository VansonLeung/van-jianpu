import type { ElectrobunConfig } from 'electrobun';

export default {
  app: { name: 'Van Jianpu', identifier: 'org.vanjianpu.desktop', version: '0.1.0', description: 'Jianpu transcription and Erhu playback' },
  build: {
    mainProcess: 'bun',
    bun: { entrypoint: 'src/main.ts', external: ['dotenv', 'express', 'sharp', 'zod'] },
    copy: { runtime: 'runtime' },
    mac: { bundleCEF: false, bundleWGPU: false, defaultRenderer: 'native', codesign: false, notarize: false, createDmg: true },
    win: { bundleCEF: false, bundleWGPU: false, defaultRenderer: 'native' },
    linux: { bundleCEF: false, bundleWGPU: false, defaultRenderer: 'native' },
  },
  runtime: { exitOnLastWindowClosed: true },
} satisfies ElectrobunConfig;
