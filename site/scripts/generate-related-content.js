import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataPath = path.join(__dirname, '..', 'src', 'data', 'articles.json');
const outputPath = path.join(__dirname, '..', 'src', 'data', 'related-content.json');

if (!fs.existsSync(dataPath)) {
  console.log('[GenerateRelatedContent] articles.json not found. Skipping.');
  process.exit(0);
}

const articles = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const relatedGraph = {};

for (const art of articles) {
  const currentTags = new Set((art.tags || []).map(t => t.toLowerCase()));
  const currentTopic = art.topic ? art.topic.id : '';

  const scored = [];
  for (const candidate of articles) {
    if (candidate.slug === art.slug) continue;

    let score = 0;
    if (candidate.topic && candidate.topic.id === currentTopic) score += 5;
    if (candidate.subtopic && art.subtopic && candidate.subtopic.id === art.subtopic.id) score += 5;

    if (candidate.tags) {
      for (const t of candidate.tags) {
        if (currentTags.has(t.toLowerCase())) score += 3;
      }
    }

    if (score > 0) {
      scored.push({
        slug: candidate.slug,
        title: candidate.title,
        published_at: candidate.published_at,
        topic: candidate.topic,
        score
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || new Date(b.published_at) - new Date(a.published_at));
  relatedGraph[art.slug] = scored.slice(0, 4);
}

fs.writeFileSync(outputPath, JSON.stringify(relatedGraph, null, 2), 'utf8');
console.log(`[GenerateRelatedContent] Generated related graph for ${Object.keys(relatedGraph).length} articles.`);
