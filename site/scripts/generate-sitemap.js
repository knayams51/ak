import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataPath = path.join(__dirname, '..', 'src', 'data', 'articles.json');
const publicDir = path.join(__dirname, '..', 'public');
const baseUrl = process.env.SITE_URL || 'https://ak-89y.pages.dev';

if (!fs.existsSync(dataPath)) {
  console.log('[GenerateSitemap] articles.json not found. Skipping.');
  process.exit(0);
}

const articles = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const staticRoutes = [
  '',
  '/about',
  '/archive',
  '/topics',
  '/search',
  '/methodology'
];

let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

for (const route of staticRoutes) {
  sitemapXml += `  <url>
    <loc>${baseUrl}${route}</loc>
    <changefreq>daily</changefreq>
    <priority>${route === '' ? '1.0' : '0.8'}</priority>
  </url>
`;
}

for (const art of articles) {
  sitemapXml += `  <url>
    <loc>${baseUrl}/articles/${art.slug}</loc>
    <lastmod>${art.modified_at || art.published_at}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
`;
}

sitemapXml += `</urlset>`;

fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemapXml, 'utf8');
console.log(`[GenerateSitemap] Generated sitemap.xml with ${staticRoutes.length + articles.length} URLs.`);
