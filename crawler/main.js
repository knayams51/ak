const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('./config');
const QueueManager = require('./queue-manager');
const DiscoveryService = require('./discovery');
const HTArticleExtractor = require('./extractor');
const AuthorDisambiguator = require('./author-filter');

class CrawlerEngine {
  constructor(options = {}) {
    this.options = Object.assign({
      limit: 50,
      discoverPages: 3,
      skipDiscoveryIfQueued: true
    }, options);

    this.queue = new QueueManager(config.paths.db_path);
    this.discovery = new DiscoveryService(this.queue);
    this.extractor = new HTArticleExtractor();
    this.disambiguator = new AuthorDisambiguator();

    this.stats = {
      processed: 0,
      accepted: 0,
      filteredOut: 0,
      failed: 0,
      startTime: new Date()
    };
  }

  async run() {
    console.log('===============================================================');
    console.log('   HT Crawl Engine: Arun Kumar (Patna Bureau Archive)');
    console.log('===============================================================');

    // 1. Check queue and run discovery if needed
    const queueStats = this.queue.getStats();
    console.log(`[Engine] Initial Queue Status: Total=${queueStats.total}, Pending=${queueStats.pending}, Articles=${queueStats.articles}`);

    if (queueStats.pending === 0 || !this.options.skipDiscoveryIfQueued) {
      console.log('[Engine] Queue empty or discovery requested. Starting discovery phase...');
      await this.discovery.discoverFromAuthorPage(this.options.discoverPages);
      await this.discovery.discoverFromSectionPages();
    }

    const updatedStats = this.queue.getStats();
    console.log(`[Engine] Ready to process. Pending URLs in queue: ${updatedStats.pending}`);

    // Ensure data directory exists
    const dataDir = path.dirname(config.paths.raw_output_jsonl);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // 2. Process Queue
    let processedCount = 0;
    while (processedCount < this.options.limit) {
      const batch = this.queue.getNext(1);
      if (!batch || batch.length === 0) {
        console.log('[Engine] No more pending items in queue.');
        break;
      }

      const item = batch[0];
      this.queue.markProcessing(item.id);
      console.log(`\n[Engine] [${processedCount + 1}/${this.options.limit}] Crawling: ${item.url}`);

      try {
        const articleData = await this.crawlSingleUrl(item.url);

        if (!articleData || !articleData.body_text) {
          console.warn(`[Engine] Warning: Empty body or failed extraction for ${item.url}`);
          this.queue.markFailed(item.id, 'Empty body or extraction failure');
          this.stats.failed++;
        } else {
          // Author Disambiguation Gate
          const evalResult = this.disambiguator.evaluate(articleData);

          if (evalResult.isValid) {
            console.log(`[Engine] [ACCEPTED] Score: ${evalResult.score} | Byline: "${articleData.byline}" | Dateline: "${articleData.dateline}"`);
            console.log(`         Headline: "${articleData.headline.substring(0, 70)}..."`);

            articleData.is_disambiguated = true;
            articleData.disambiguation_score = evalResult.score;
            articleData.disambiguation_reasons = evalResult.reasons;

            // Append to streaming JSONL
            fs.appendFileSync(config.paths.raw_output_jsonl, JSON.stringify(articleData) + '\n', 'utf8');

            // Save to internal registry
            this.queue.saveArticle(articleData);
            this.queue.markCompleted(item.id);
            this.stats.accepted++;
          } else {
            const reason = evalResult.warnings.join('; ') || 'Disambiguation score below threshold';
            console.log(`[Engine] [FILTERED OUT] Score: ${evalResult.score} | Reason: ${reason}`);
            this.queue.markFilteredOut(item.id, reason);
            this.stats.filteredOut++;
          }
        }
      } catch (err) {
        console.error(`[Engine] [ERROR] Failed crawling ${item.url}: ${err.message}`);
        this.queue.markFailed(item.id, err.message);
        this.stats.failed++;
      }

      processedCount++;
      this.stats.processed++;

      // Politeness Delay
      await new Promise(r => setTimeout(r, config.crawler.request_delay_ms));
    }

    // 3. Generate Crawl Report
    this.generateSummaryReport();
    return this.stats;
  }

  async crawlSingleUrl(url) {
    const headers = {
      'User-Agent': config.crawler.user_agents[Math.floor(Math.random() * config.crawler.user_agents.length)],
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.hindustantimes.com/'
    };

    const response = await axios.get(url, {
      headers,
      timeout: config.crawler.navigation_timeout_ms,
      validateStatus: (status) => status < 400
    });

    if (response.status !== 200) {
      throw new Error(`HTTP status ${response.status}`);
    }

    return this.extractor.extract(response.data, url);
  }

  generateSummaryReport() {
    const endTime = new Date();
    const durationSec = Math.round((endTime - this.stats.startTime) / 1000);
    const finalQueueStats = this.queue.getStats();

    const report = `# Crawler Execution & Disambiguation Summary

**Run Timestamp**: ${endTime.toISOString()}
**Duration**: ${durationSec} seconds

## Execution Statistics
- **Total Processed**: ${this.stats.processed}
- **Accepted (Arun Kumar Patna)**: ${this.stats.accepted}
- **Filtered Out (Namesakes/Non-matches)**: ${this.stats.filteredOut}
- **Failed Requests**: ${this.stats.failed}

## Queue Ledger
- **Total In Queue**: ${finalQueueStats.total}
- **Pending**: ${finalQueueStats.pending}
- **Completed**: ${finalQueueStats.completed}
- **Total Articles in Registry**: ${finalQueueStats.articles}

## Output Location
- Raw JSONL Stream: \`${config.paths.raw_output_jsonl}\`
- Queue Database/State: \`${config.paths.db_path}\`
`;

    if (!fs.existsSync(config.paths.reports_dir)) {
      fs.mkdirSync(config.paths.reports_dir, { recursive: true });
    }

    fs.writeFileSync(path.join(config.paths.reports_dir, 'crawl_summary.md'), report, 'utf8');
    console.log('\n[Engine] Summary report generated in reports/crawl_summary.md');
  }
}

module.exports = CrawlerEngine;

if (require.main === module) {
  const args = process.argv.slice(2);
  let limit = 50;
  let discoverPages = 3;

  for (const arg of args) {
    if (arg.startsWith('--limit=')) limit = parseInt(arg.split('=')[1], 10);
    if (arg.startsWith('--pages=')) discoverPages = parseInt(arg.split('=')[1], 10);
  }

  const engine = new CrawlerEngine({ limit, discoverPages });
  engine.run().then(stats => {
    console.log(`\nCrawl complete. Accepted: ${stats.accepted}, Filtered: ${stats.filteredOut}, Failed: ${stats.failed}`);
  }).catch(err => {
    console.error('Fatal engine error:', err);
  });
}
