import { defineConfig } from 'vitest/config'

// GitHub Pages 는 /<repo>/ 하위에서 서비스된다. 로컬 dev 는 루트.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/classic-bgm-dj-3d/' : '/',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}))
