import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://arunkumar-journalism.org',
  output: 'static',
  build: {
    format: 'directory'
  }
});
