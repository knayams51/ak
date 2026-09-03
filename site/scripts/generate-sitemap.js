import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataPath = path.join(__dirname, '..', 'src', 'data', 'articles.json');
const taxonomyPath = path.join(__dirname, '..', 'src', 'config', 'taxonomy.config.json');
const publicDir = path.join(__dirname, '..', 'public');
const baseUrl = process.env.SITE_URL || 'https://ak-89y.pages.dev';

if (!fs.existsSync(dataPath)) {
  console.log('[GenerateSitemap] articles.json not found. Skipping.');
  process.exit(0);
}

const articles = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const taxonomy = JSON.parse(fs.readFileSync(taxonomyPath, 'utf8'));

const today = new Date().toISOString().split('T')[0];

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

if (taxonomy.topics && Array.isArray(taxonomy.topics)) {
  for (const topic of taxonomy.topics) {
    sitemapXml += `  <url>
    <loc>${baseUrl}/topics/${topic.slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>\n`;
  }
}

for (const art of articles) {
  const artDate = String(art.modified_at || art.published_at || today);
  const lastmod = artDate.split('T')[0];
  sitemapXml += `  <url>
    <loc>${baseUrl}/articles/${art.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
`;
}

sitemapXml += `</urlset>\n`;

fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemapXml, 'utf8');
const topicsCount = taxonomy.topics && Array.isArray(taxonomy.topics) ? taxonomy.topics.length : 0;
console.log(`[GenerateSitemap] Generated sitemap.xml with ${staticRoutes.length + topicsCount + articles.length} URLs.`);
