import fs from 'fs';
import path from 'path';

const distDir = 'site/dist';

function inspectHtml(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  
  const ogTypeMatch = html.match(/<meta property="og:type" content="([^"]+)"/);
  const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
  const twitterImageMatch = html.match(/<meta name="twitter:image" content="([^"]+)"/);
  const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)"/);
  
  // Dateline / markdown checks
  const hasAsteriskBold = html.includes('**Patna**') || html.includes('**New Delhi**');
  const hasStrongTag = html.includes('<strong>Patna</strong>') || html.includes('<strong>');

  return {
    filePath,
    ogType: ogTypeMatch ? ogTypeMatch[1] : null,
    ogImage: ogImageMatch ? ogImageMatch[1] : null,
    twitterImage: twitterImageMatch ? twitterImageMatch[1] : null,
    canonical: canonicalMatch ? canonicalMatch[1] : null,
    hasAsteriskBold,
    hasStrongTag
  };
}

console.log('--- Inspecting Homepage ---');
console.log(inspectHtml(path.join(distDir, 'index.html')));

console.log('\n--- Inspecting About Page ---');
console.log(inspectHtml(path.join(distDir, 'about', 'index.html')));

console.log('\n--- Inspecting Article Pages ---');
const articlesDir = path.join(distDir, 'articles');
const articleFolders = fs.readdirSync(articlesDir).filter(f => fs.statSync(path.join(articlesDir, f)).isDirectory());

let checkedCount = 0;
let errors = 0;

for (const folder of articleFolders) {
  const articleHtmlPath = path.join(articlesDir, folder, 'index.html');
  if (fs.existsSync(articleHtmlPath)) {
    const res = inspectHtml(articleHtmlPath);
    checkedCount++;
    if (!res.ogImage || !res.ogImage.startsWith('http')) {
      console.error(`ERROR in ${folder}: og:image is not absolute: ${res.ogImage}`);
      errors++;
    }
    if (!res.twitterImage || !res.twitterImage.startsWith('http')) {
      console.error(`ERROR in ${folder}: twitter:image is not absolute: ${res.twitterImage}`);
      errors++;
    }
    if (res.ogType !== 'article') {
      console.error(`ERROR in ${folder}: og:type is not 'article': ${res.ogType}`);
      errors++;
    }
    if (res.hasAsteriskBold) {
      console.error(`ERROR in ${folder}: Found unparsed **dateline** asterisks!`);
      errors++;
    }
    if (!res.canonical || !res.canonical.startsWith('http')) {
      console.error(`ERROR in ${folder}: canonical is not absolute: ${res.canonical}`);
      errors++;
    }
  }
}

console.log(`\nVerified ${checkedCount} article pages. Total errors: ${errors}`);

// Print a couple of sample articles
if (articleFolders.length > 0) {
  console.log('\nSample 1 (first article):');
  console.log(inspectHtml(path.join(articlesDir, articleFolders[0], 'index.html')));
  
  console.log('\nSample 2 (second article):');
  console.log(inspectHtml(path.join(articlesDir, articleFolders[1], 'index.html')));
}
