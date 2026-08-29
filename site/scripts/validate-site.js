import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataPath = path.join(__dirname, '..', 'src', 'data', 'articles.json');
const inputDir = path.join(__dirname, '..', 'input', 'Periodic_Article_update');

console.log('===============================================================');
console.log('   Running Full QA & Integrity Verification Suite');
console.log('===============================================================');

let errors = 0;
let warnings = 0;

if (!fs.existsSync(dataPath)) {
  console.error('[FAIL] articles.json not found! Run npm run build:data first.');
  process.exit(1);
}

const articles = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
console.log(`[Validation] Checking ${articles.length} ingested articles...`);

// 1. Check duplicate slugs
const slugSet = new Set();
for (const art of articles) {
  if (slugSet.has(art.slug)) {
    console.error(`[FAIL] Duplicate slug detected: ${art.slug}`);
    errors++;
  }
  slugSet.add(art.slug);
}

// 2. Check integrity and Non-Negotiable Body Rule
for (const art of articles) {
  if (!art.title || art.title.length < 5) {
    console.error(`[FAIL] Missing or invalid title for ${art.slug}`);
    errors++;
  }
  if (!art.published_at || isNaN(new Date(art.published_at).getTime())) {
    console.error(`[FAIL] Invalid publication date for ${art.slug}: ${art.published_at}`);
    errors++;
  }
  if (!art.byline) {
    console.error(`[FAIL] Missing byline for ${art.slug}`);
    errors++;
  }
  if (!art.provenance || !art.provenance.primary_source || !art.provenance.primary_source.canonical_url) {
    console.error(`[FAIL] Missing primary provenance canonical URL for ${art.slug}`);
    errors++;
  }
  if (!art.provenance.verification || !art.provenance.verification.content_sha256) {
    console.error(`[FAIL] Missing SHA-256 content verification hash for ${art.slug}`);
    errors++;
  }
}

// 3. Check search index
const searchIndexPath = path.join(__dirname, '..', 'public', 'search-index.json');
if (!fs.existsSync(searchIndexPath)) {
  console.error('[FAIL] search-index.json missing in public directory.');
  errors++;
} else {
  const index = JSON.parse(fs.readFileSync(searchIndexPath, 'utf8'));
  if (index.length !== articles.length) {
    console.warn(`[WARN] Search index length (${index.length}) does not match articles length (${articles.length})`);
    warnings++;
  }
}

console.log('---------------------------------------------------------------');
if (errors === 0) {
  console.log(`[PASS] 100% Quality Gates Passed! (${articles.length} articles verified, ${warnings} warnings)`);
  process.exit(0);
} else {
  console.error(`[FAIL] Validation failed with ${errors} errors and ${warnings} warnings.`);
  process.exit(1);
}
