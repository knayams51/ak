const fs = require('fs');
const path = require('path');
const PackageBuilder = require('./package-builder');

function runPipeline() {
  const jsonlPath = path.join(__dirname, '..', 'crawler', 'data', 'crawled_articles.jsonl');
  if (!fs.existsSync(jsonlPath)) {
    console.error(`[Pipeline] Error: Crawled articles file not found at ${jsonlPath}`);
    process.exit(1);
  }

  console.log(`[Pipeline] Loading articles from ${jsonlPath}...`);
  const lines = fs.readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean);
  const articles = [];

  for (const line of lines) {
    try {
      const art = JSON.parse(line);
      articles.push(art);
    } catch (e) {
      console.warn(`[Pipeline] Skipping invalid JSON line: ${e.message}`);
    }
  }

  console.log(`[Pipeline] Found ${articles.length} valid crawled articles.`);
  const builder = new PackageBuilder();
  const result = builder.buildPackage(articles, 'feed_run_pilot_pass');

  console.log('\n[Pipeline] Summary:');
  console.log(`- Run Name: ${result.runName}`);
  console.log(`- Package Directory: ${result.packageDir}`);
  console.log(`- Total Packaged Articles: ${result.articleCount}`);
}

if (require.main === module) {
  runPipeline();
}

module.exports = runPipeline;
