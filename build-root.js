import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('===============================================================');
console.log('   Cloudflare Pages / Root Build: Arun Kumar Living Archive    ');
console.log('===============================================================');

const siteDir = path.join(__dirname, 'site');
const siteScripts = path.join(siteDir, 'scripts');
const siteDist = path.join(siteDir, 'dist');
const rootDist = path.join(__dirname, 'dist');

// Step 1: Run data generation
console.log('[Build] Step 1: Running site data preparation...');
execSync(`node "${path.join(siteScripts, 'build-site-data.js')}"`, { stdio: 'inherit' });
execSync(`node "${path.join(siteScripts, 'generate-related-content.js')}"`, { stdio: 'inherit' });
execSync(`node "${path.join(siteScripts, 'generate-sitemap.js')}"`, { stdio: 'inherit' });
execSync(`node "${path.join(siteScripts, 'generate-rss.js')}"`, { stdio: 'inherit' });
execSync(`node "${path.join(siteScripts, 'validate-site.js')}"`, { stdio: 'inherit' });

// Step 2: Compile with Astro
console.log('[Build] Step 2: Compiling static site with Astro SSG...');
const astroBin = path.join(__dirname, 'node_modules', '.bin', 'astro');
if (fs.existsSync(astroBin) || fs.existsSync(`${astroBin}.cmd`)) {
  execSync(`"${astroBin}" build --root site --outDir ../dist`, { stdio: 'inherit' });
} else {
  execSync('npm --prefix site run build', { stdio: 'inherit' });
  if (fs.existsSync(siteDist)) {
    if (fs.existsSync(rootDist)) {
      fs.rmSync(rootDist, { recursive: true, force: true });
    }
    fs.cpSync(siteDist, rootDist, { recursive: true });
  }
}

// Step 3: Mirror to site/dist
if (fs.existsSync(rootDist)) {
  if (fs.existsSync(siteDist)) {
    fs.rmSync(siteDist, { recursive: true, force: true });
  }
  fs.cpSync(rootDist, siteDist, { recursive: true });
  console.log(`[Build] Build complete! Output available in ./dist and ./site/dist (${fs.readdirSync(rootDist).length} items)`);
}
