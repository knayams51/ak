import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputDir = path.join(__dirname, '..', 'input', 'Periodic_Article_update');
const outputDataDir = path.join(__dirname, '..', 'src', 'data');
const publicDir = path.join(__dirname, '..', 'public');

if (!fs.existsSync(outputDataDir)) {
  fs.mkdirSync(outputDataDir, { recursive: true });
}
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

function cleanTitle(title) {
  if (!title) return '';
  return title
    .replace(/\s*\|\s*Hindustan Times.*$/i, '')
    .replace(/\s*\|\s*India News.*$/i, '')
    .replace(/\s*\|\s*Patna News.*$/i, '')
    .replace(/\s*-\s*Hindustan Times.*$/i, '')
    .trim();
}

console.log('[BuildSiteData] Ingesting periodic article packages from:', inputDir);

const allArticles = [];
const seenSlugs = new Set();

if (fs.existsSync(inputDir)) {
  const packageFolders = fs.readdirSync(inputDir).filter(f => {
    const full = path.join(inputDir, f);
    return fs.statSync(full).isDirectory();
  });

  for (const folder of packageFolders) {
    const packagePath = path.join(inputDir, folder);
    const recordsDir = path.join(packagePath, 'records');
    const contentDir = path.join(packagePath, 'content');

    if (!fs.existsSync(recordsDir)) continue;

    const recordFiles = fs.readdirSync(recordsDir).filter(f => f.endsWith('.json'));
    console.log(`[BuildSiteData] Ingesting package ${folder}: ${recordFiles.length} articles`);

    for (const file of recordFiles) {
      const recordRaw = fs.readFileSync(path.join(recordsDir, file), 'utf8');
      try {
        const record = JSON.parse(recordRaw);
        
        // Clean title
        record.title = cleanTitle(record.title);

        // Read full body markdown
        const contentPath = path.join(contentDir, `${record.slug}.md`);
        let contentMd = '';
        if (fs.existsSync(contentPath)) {
          contentMd = fs.readFileSync(contentPath, 'utf8');
        }

        record.body_markdown = contentMd;

        if (!seenSlugs.has(record.slug)) {
          seenSlugs.add(record.slug);
          allArticles.push(record);
        }
      } catch (err) {
        console.warn(`[BuildSiteData] Error parsing ${file}: ${err.message}`);
      }
    }
  }
}

// Sort chronologically descending
allArticles.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

console.log(`[BuildSiteData] Total ingested unique articles: ${allArticles.length}`);

// Write src/data/articles.json
const articlesJsonPath = path.join(outputDataDir, 'articles.json');
fs.writeFileSync(articlesJsonPath, JSON.stringify(allArticles, null, 2), 'utf8');
console.log(`[BuildSiteData] Wrote ${allArticles.length} articles to: ${articlesJsonPath}`);

// Build search index for client-side search
const searchIndex = allArticles.map(a => ({
  id: a.id,
  slug: a.slug,
  title: a.title,
  summary: a.summary,
  byline: a.byline,
  dateline: a.dateline,
  published_at: a.published_at,
  topic: a.topic ? a.topic.title : '',
  topic_slug: a.topic ? a.topic.slug : '',
  subtopic: a.subtopic ? a.subtopic.title : '',
  tags: a.tags || [],
  word_count: a.word_count
}));

const searchIndexPath = path.join(publicDir, 'search-index.json');
fs.writeFileSync(searchIndexPath, JSON.stringify(searchIndex, null, 2), 'utf8');
console.log(`[BuildSiteData] Wrote search index to: ${searchIndexPath}`);
