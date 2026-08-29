import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL || 'https://ak-89y.pages.dev',
  output: 'static',
  build: {
    format: 'directory'
  }
});
