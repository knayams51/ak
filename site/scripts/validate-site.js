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

// 2. Build index of on-disk content files in Periodic_Article_update packages
const diskContentMap = new Map();
if (fs.existsSync(inputDir)) {
  const packageFolders = fs.readdirSync(inputDir).filter(f => {
    try {
      return fs.statSync(path.join(inputDir, f)).isDirectory();
    } catch {
      return false;
    }
  });

  for (const folder of packageFolders) {
    const contentDir = path.join(inputDir, folder, 'content');
    if (fs.existsSync(contentDir)) {
      const files = fs.readdirSync(contentDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const slug = path.basename(file, '.md');
        if (!diskContentMap.has(slug)) {
          diskContentMap.set(slug, path.join(contentDir, file));
        }
      }
    }
  }
}
console.log(`[Validation] Indexed ${diskContentMap.size} content files across update packages on disk.`);

// 3. Check integrity, Non-Negotiable Body Rule, and cryptographic SHA-256 hash
let verifiedHashes = 0;
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
    continue;
  }

  // Verify that art.body_markdown exists and has length >= 20
  if (!art.body_markdown || art.body_markdown.length < 20) {
    console.error(`[FAIL] Missing or truncated body_markdown for ${art.slug}`);
    errors++;
    continue;
  }

  const expectedHash = art.provenance.verification.content_sha256;

  // Check on-disk content file if available
  const diskPath = diskContentMap.get(art.slug);
  let contentToVerify = art.body_markdown;
  if (diskPath) {
    try {
      const diskContent = fs.readFileSync(diskPath, 'utf8');
      if (!diskContent || diskContent.length < 20) {
        console.error(`[FAIL] On-disk content corrupted or empty for ${art.slug} (${diskPath})`);
        errors++;
      }
      contentToVerify = diskContent;
    } catch (err) {
      console.error(`[FAIL] Error reading on-disk content for ${art.slug}: ${err.message}`);
      errors++;
    }
  } else {
    console.warn(`[WARN] On-disk content markdown not found for ${art.slug}`);
    warnings++;
  }

  // Extract raw body text and compute SHA-256 hash candidates:
  // In pipeline/package-builder.js, contentMd = `# ${norm.title}\n\n**${norm.dateline}** — ${norm.body_text}`
  // and hash was computed over norm.body_text.
  const normContent = contentToVerify.replace(/\r\n/g, '\n');
  const headerMatch = normContent.match(/^# [^\n]+\n\n(?:\*\*[^*]+\*\*\s*—\s*)?/);
  const bodyTextA = headerMatch ? normContent.slice(headerMatch[0].length) : normContent;
  const hashA = crypto.createHash('sha256').update(bodyTextA, 'utf8').digest('hex');

  // Alternative candidate: body text after stripping headline only
  const headlineMatch = normContent.match(/^# [^\n]+\n\n/);
  const bodyTextB = headlineMatch ? normContent.slice(headlineMatch[0].length) : normContent;
  const hashB = crypto.createHash('sha256').update(bodyTextB, 'utf8').digest('hex');

  // Alternative candidate: full body markdown as packaged
  const hashC = crypto.createHash('sha256').update(normContent, 'utf8').digest('hex');
  const hashC_raw = crypto.createHash('sha256').update(contentToVerify, 'utf8').digest('hex');

  if (expectedHash === hashA || expectedHash === hashB || expectedHash === hashC || expectedHash === hashC_raw) {
    verifiedHashes++;
  } else {
    console.error(`[FAIL] SHA-256 mismatch for ${art.slug}! Expected ${expectedHash}`);
    errors++;
  }
}
console.log(`[Validation] Cryptographically verified ${verifiedHashes}/${articles.length} article content SHA-256 hashes.`);

// 4. Check search index
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
