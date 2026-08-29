const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');
const cheerio = require('cheerio');
const config = require('./config');
const QueueManager = require('./queue-manager');
const HTArticleExtractor = require('./extractor');
const AuthorDisambiguator = require('./author-filter');
const PackageBuilder = require('../pipeline/package-builder');

class DailySyncEngine {
  constructor(options = {}) {
    this.options = Object.assign({
      pages: 3,
      limit: 25,
      includeSections: true,
      forceRebuild: false
    }, options);

    this.queue = new QueueManager(config.paths.db_path);
    this.extractor = new HTArticleExtractor();
    this.disambiguator = new AuthorDisambiguator();
    this.packageBuilder = new PackageBuilder();

    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.hindustantimes.com/'
    };

    this.stats = {
      startTime: new Date(),
      discoveredCount: 0,
      alreadyKnownCount: 0,
      candidatesCrawled: 0,
      acceptedCount: 0,
      filteredCount: 0,
      failedCount: 0,
      newPackage: null,
      acceptedArticles: []
    };
  }

  /**
   * Main execution loop
   */
  async run() {
    console.log('===============================================================');
    console.log('   Arun Kumar Living Archive: Automated Daily Sync Engine      ');
    console.log('===============================================================');
    console.log(`[Sync] Timestamp: ${new Date().toISOString()}`);

    // 1. Build index of all currently known articles in the live archive
    const existingIndex = this.loadExistingArchiveIndex();
    console.log(`[Sync] Existing Archive Index: ${existingIndex.size} articles registered`);

    // 2. Discover recent candidate URLs from HT author feed & sections
    const candidateUrls = await this.discoverRecentCandidates(existingIndex);
    this.stats.discoveredCount = candidateUrls.length;
    console.log(`[Sync] Discovered ${candidateUrls.length} new candidate URLs to inspect.`);

    // 3. Process candidate URLs
    if (candidateUrls.length > 0) {
      console.log(`\n[Sync] Processing up to ${Math.min(candidateUrls.length, this.options.limit)} candidates...`);
      await this.processCandidates(candidateUrls.slice(0, this.options.limit));
    }

    // 4. Package newly accepted articles
    if (this.stats.acceptedCount > 0) {
      console.log(`\n[Sync] 🎯 Accepted ${this.stats.acceptedCount} new article(s) by Arun Kumar!`);
      const packageResult = this.packageBuilder.buildPackage(this.stats.acceptedArticles);
      this.stats.newPackage = packageResult;

      // 5. Rebuild site data and search index
      this.rebuildSiteData();
    } else {
      console.log('\n[Sync] ✅ Archive is completely up to date. No new articles needed packaging.');
      if (this.options.forceRebuild) {
        this.rebuildSiteData();
      }
    }

    // 6. Generate Daily Sync QA Report
    this.generateDailyReport();

    return this.stats;
  }

  /**
   * Load existing known articles to prevent duplicate processing
   */
  loadExistingArchiveIndex() {
    const knownUrls = new Set();
    const articlesJsonPath = path.join(__dirname, '..', 'site', 'src', 'data', 'articles.json');

    if (fs.existsSync(articlesJsonPath)) {
      try {
        const articles = JSON.parse(fs.readFileSync(articlesJsonPath, 'utf8'));
        for (const art of articles) {
          if (art.source_url) knownUrls.add(art.source_url.toLowerCase().trim());
          if (art.id) knownUrls.add(String(art.id).toLowerCase());
          if (art.slug) knownUrls.add(art.slug.toLowerCase());
        }
      } catch (e) {
        console.warn(`[Sync] Warning loading articles.json: ${e.message}`);
      }
    }

    // Also check crawler queue completed / filtered
    if (this.queue.fallbackState && this.queue.fallbackState.queue) {
      for (const item of this.queue.fallbackState.queue) {
        if (item.status === 'completed' || item.status === 'filtered_out') {
          knownUrls.add(item.url.toLowerCase().trim());
        }
      }
    }

    return knownUrls;
  }

  /**
   * Discover candidate URLs from Author pages and Patna/Education sections
   */
  async discoverRecentCandidates(existingIndex) {
    const candidateUrls = new Set();

    // 1. Arun Kumar Author Feed (Pages 1 to N)
    for (let page = 1; page <= this.options.pages; page++) {
      const url = page === 1 ? config.seeds.author_page : `${config.seeds.author_page_paged}${page}`;
      try {
        console.log(`[Discovery] Scanning Author Page ${page}: ${url}`);
        const response = await axios.get(url, { headers: this.headers, timeout: 15000 });
        if (response.status === 200) {
          const $ = cheerio.load(response.data);
          let foundCount = 0;

          const authorSelectors = 'h3.hdg3 a, .story-card a, .cartHolder a, .list-view a, .author-article-list a, .editorial a, div[data-article-id] a, .listingPage a, main a[href]';
          $(authorSelectors).each((_, el) => {
            const href = $(el).attr('href');
            if (!href) return;

            if (href.match(/-(\d+)\.html$/) && !href.includes('/photos/') && !href.includes('/videos/')) {
              const fullUrl = href.startsWith('http') ? href : `https://www.hindustantimes.com${href}`;
              const normalized = fullUrl.toLowerCase().trim();

              if (!existingIndex.has(normalized) && !candidateUrls.has(fullUrl)) {
                candidateUrls.add(fullUrl);
                foundCount++;
              } else {
                this.stats.alreadyKnownCount++;
              }
            }
          });

          console.log(`[Discovery] Author Page ${page}: ${foundCount} new candidates found.`);
          if (foundCount === 0 && page > 1) break;
        }
      } catch (err) {
        console.warn(`[Discovery] Failed checking author page ${page}: ${err.message}`);
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    // 2. Section Feeds (Patna News, Education)
    if (this.options.includeSections) {
      const sectionUrls = [config.seeds.section_patna, config.seeds.section_education];
      for (const sectionUrl of sectionUrls) {
        try {
          console.log(`[Discovery] Scanning Section: ${sectionUrl}`);
          const response = await axios.get(sectionUrl, { headers: this.headers, timeout: 15000 });
          if (response.status === 200) {
            const $ = cheerio.load(response.data);
            let foundCount = 0;

            $('a[href]').each((_, el) => {
              const href = $(el).attr('href');
              if (!href) return;

              if (href.match(/-(\d+)\.html$/) && (href.includes('/patna-news/') || href.includes('/education/'))) {
                const fullUrl = href.startsWith('http') ? href : `https://www.hindustantimes.com${href}`;
                const normalized = fullUrl.toLowerCase().trim();

                if (!existingIndex.has(normalized)) {
                  candidateUrls.add(fullUrl);
                  foundCount++;
                } else {
                  this.stats.alreadyKnownCount++;
                }
              }
            });

            console.log(`[Discovery] Section ${sectionUrl}: ${foundCount} new candidates found.`);
          }
        } catch (err) {
          console.warn(`[Discovery] Failed checking section ${sectionUrl}: ${err.message}`);
        }

        await new Promise(r => setTimeout(r, 1000));
      }
    }

    return Array.from(candidateUrls);
  }

  /**
   * Process and disambiguate candidate URLs
   */
  async processCandidates(urls) {
    for (let i = 0; i < urls.length; i++) {
      const targetUrl = urls[i];
      console.log(`\n[Process] [${i + 1}/${urls.length}] Fetching candidate: ${targetUrl}`);
      this.stats.candidatesCrawled++;

      try {
        const response = await axios.get(targetUrl, {
          headers: this.headers,
          timeout: 20000,
          validateStatus: (status) => status < 400
        });

        if (response.status !== 200) {
          throw new Error(`HTTP status ${response.status}`);
        }

        const articleData = this.extractor.extract(response.data, targetUrl);

        if (!articleData || !articleData.body_text || articleData.body_text.length < 50) {
          console.warn(`[Process] Empty body or extraction failure for ${targetUrl}`);
          this.stats.failedCount++;
          continue;
        }

        // Author Disambiguation Evaluation
        const evalResult = this.disambiguator.evaluate(articleData);

        if (evalResult.isValid) {
          console.log(`[Process] [ACCEPTED] ✅ Score: ${evalResult.score} | Dateline: "${articleData.dateline}" | Byline: "${articleData.byline}"`);
          console.log(`          Headline: "${articleData.headline.substring(0, 80)}..."`);
          console.log(`          Word Count: ${articleData.body_text.split(/\s+/).length} words`);

          articleData.is_disambiguated = true;
          articleData.disambiguation_score = evalResult.score;
          articleData.disambiguation_reasons = evalResult.reasons;

          // Append to persistent JSONL
          fs.appendFileSync(config.paths.raw_output_jsonl, JSON.stringify(articleData) + '\n', 'utf8');

          this.queue.enqueue(targetUrl, 'daily_sync', 20);
          this.queue.saveArticle(articleData);

          this.stats.acceptedArticles.push(articleData);
          this.stats.acceptedCount++;
        } else {
          const reason = evalResult.warnings.join('; ') || 'Disambiguation score below threshold';
          console.log(`[Process] [FILTERED OUT] ❌ Score: ${evalResult.score} | Reason: ${reason}`);
          this.queue.enqueue(targetUrl, 'daily_sync', 10);
          this.stats.filteredCount++;
        }

      } catch (err) {
        console.error(`[Process] [ERROR] Failed crawling ${targetUrl}: ${err.message}`);
        this.stats.failedCount++;
      }

      // Politeness delay
      await new Promise(r => setTimeout(r, 1200 + Math.random() * 600));
    }
  }

  /**
   * Trigger site data rebuild and integrity validation
   */
  rebuildSiteData() {
    console.log('\n===============================================================');
    console.log('   Rebuilding Living Archive Site Data & Search Indexes        ');
    console.log('===============================================================');

    const siteScripts = path.join(__dirname, '..', 'site', 'scripts');

    try {
      console.log('[Build] Ingesting all periodic article packages into src/data/articles.json...');
      execSync(`node "${path.join(siteScripts, 'build-site-data.js')}"`, { stdio: 'inherit' });

      console.log('[Build] Updating related content graphs...');
      execSync(`node "${path.join(siteScripts, 'generate-related-content.js')}"`, { stdio: 'inherit' });

      console.log('[Build] Generating dynamic XML sitemap...');
      execSync(`node "${path.join(siteScripts, 'generate-sitemap.js')}"`, { stdio: 'inherit' });

      console.log('[Build] Generating RSS feed...');
      execSync(`node "${path.join(siteScripts, 'generate-rss.js')}"`, { stdio: 'inherit' });

      console.log('[Build] Running site schema & integrity validation...');
      execSync(`node "${path.join(siteScripts, 'validate-site.js')}"`, { stdio: 'inherit' });

      console.log('[Build] ✅ Site data generation and validation completed successfully!');
    } catch (err) {
      console.error(`[Build] Error during site data rebuild: ${err.message}`);
      throw err;
    }
  }

  /**
   * Generate daily execution summary report in reports/daily_sync_report.md
   */
  generateDailyReport() {
    const endTime = new Date();
    const durationSec = Math.round((endTime - this.stats.startTime) / 1000);

    const articlesJsonPath = path.join(__dirname, '..', 'site', 'src', 'data', 'articles.json');
    let totalArchiveCount = 0;
    if (fs.existsSync(articlesJsonPath)) {
      try {
        const arts = JSON.parse(fs.readFileSync(articlesJsonPath, 'utf8'));
        totalArchiveCount = arts.length;
      } catch (e) {}
    }

    const acceptedRows = this.stats.acceptedArticles.map(a => 
      `- **[ACCEPTED]** [${a.headline.replace(/[\|\[\]]/g, '')}](${a.url})  \n  *Dateline: ${a.dateline} | Byline: ${a.byline} | SHA-256: \`${a.body_sha256.substring(0, 10)}...\`*`
    ).join('\n');

    const reportContent = `# Daily Sync & Living Archive QA Report

**Execution Date**: ${endTime.toISOString().split('T')[0]}  
**Execution Timestamp**: ${endTime.toISOString()}  
**Duration**: ${durationSec} seconds  
**Archive Total Articles**: **${totalArchiveCount} articles**

---

## 📊 Summary Metrics
| Metric | Value |
|---|---|
| **Discovered New Candidate URLs** | ${this.stats.discoveredCount} |
| **Already Known / Indexed URLs** | ${this.stats.alreadyKnownCount} |
| **Candidate URLs Crawled** | ${this.stats.candidatesCrawled} |
| **Accepted Arun Kumar Articles** | **${this.stats.acceptedCount}** |
| **Filtered Out (Namesakes / Non-Patna)** | ${this.stats.filteredCount} |
| **Failed Requests** | ${this.stats.failedCount} |
| **New Package Created** | \`${this.stats.newPackage ? this.stats.newPackage.runName : 'None (Up-to-date)'}\` |

---

## 📰 Ingested Articles in this Run
${this.stats.acceptedCount > 0 ? acceptedRows : '_No new articles discovered in this run. Archive is fully synchronized with Hindustan Times._'}

---

## 🛡️ Disambiguation & Integrity Policy
- **Target Author**: Arun Kumar, Senior Assistant Editor / Associate Editor (Patna Bureau)
- **Non-Negotiable Body Rule**: 100% full-text preservation (zero summarization, zero paraphrasing)
- **Integrity Level**: Cryptographic SHA-256 validation on every ingested article body
- **Edge Deployment Target**: Cloudflare Pages (\`https://ak-89y.pages.dev\`)
`;

    const reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    fs.writeFileSync(path.join(reportsDir, 'daily_sync_report.md'), reportContent, 'utf8');
    console.log(`\n[Sync] 📝 Daily sync report written to reports/daily_sync_report.md`);
  }
}

// CLI Execution Entrypoint
if (require.main === module) {
  const args = process.argv.slice(2);
  let pages = 3;
  let limit = 25;
  let forceRebuild = false;

  for (const arg of args) {
    if (arg.startsWith('--pages=')) pages = parseInt(arg.split('=')[1], 10);
    if (arg.startsWith('--limit=')) limit = parseInt(arg.split('=')[1], 10);
    if (arg === '--force-rebuild') forceRebuild = true;
  }

  const engine = new DailySyncEngine({ pages, limit, forceRebuild });
  engine.run().then(stats => {
    console.log(`\n🎉 Daily sync completed successfully! Accepted: ${stats.acceptedCount}, Filtered: ${stats.filteredCount}`);
    process.exit(0);
  }).catch(err => {
    console.error('\n❌ Fatal daily sync error:', err);
    process.exit(1);
  });
}

module.exports = DailySyncEngine;
