const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const config = require('./config');
const QueueManager = require('./queue-manager');
const HTArticleExtractor = require('./extractor');
const AuthorDisambiguator = require('./author-filter');

class DeepHistoricalHarvester {
  constructor() {
    this.queue = new QueueManager(config.paths.db_path);
    this.extractor = new HTArticleExtractor();
    this.disambiguator = new AuthorDisambiguator();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.hindustantimes.com/'
    };
  }

  async runHarvest() {
    console.log('===============================================================');
    console.log('   Starting Deep Historical Harvest (2000–2025 Backfill)');
    console.log('===============================================================');

    // 1. Discover historical URLs through multiple section and archive vectors
    await this.discoverHistoricalSeeds();

    // 2. Process all pending queue items
    const stats = this.queue.getStats();
    console.log(`[DeepHarvest] Pending items in harvest queue: ${stats.pending}`);

    let processed = 0;
    let accepted = 0;
    let filtered = 0;
    let failed = 0;

    while (true) {
      const batch = this.queue.getNext(1);
      if (!batch || batch.length === 0) break;

      const item = batch[0];
      this.queue.markProcessing(item.id);
      processed++;
      console.log(`\n[DeepHarvest] [${processed}] Crawling: ${item.url}`);

      try {
        const response = await axios.get(item.url, {
          headers: this.headers,
          timeout: 20000,
          validateStatus: (s) => s < 400
        });

        if (response.status === 200) {
          const articleData = this.extractor.extract(response.data, item.url);
          const evalResult = this.disambiguator.evaluate(articleData);

          if (evalResult.isValid) {
            console.log(`[DeepHarvest] [ACCEPTED] (${evalResult.score}) "${articleData.headline.substring(0, 65)}..."`);
            console.log(`              Published: ${articleData.published_at} | Byline: ${articleData.byline} | Dateline: ${articleData.dateline}`);

            articleData.is_disambiguated = true;
            articleData.disambiguation_score = evalResult.score;
            articleData.disambiguation_reasons = evalResult.reasons;

            // Stream to JSONL
            fs.appendFileSync(config.paths.raw_output_jsonl, JSON.stringify(articleData) + '\n', 'utf8');
            this.queue.saveArticle(articleData);
            this.queue.markCompleted(item.id);
            accepted++;
          } else {
            console.log(`[DeepHarvest] [FILTERED OUT] Reason: ${evalResult.warnings.join('; ') || 'Disambiguation below threshold'}`);
            this.queue.markFilteredOut(item.id, evalResult.warnings.join('; '));
            filtered++;
          }
        } else {
          this.queue.markFailed(item.id, `HTTP status ${response.status}`);
          failed++;
        }
      } catch (err) {
        console.error(`[DeepHarvest] [ERROR] ${err.message}`);
        this.queue.markFailed(item.id, err.message);
        failed++;
      }

      // Politeness delay
      await new Promise(r => setTimeout(r, 1200));
    }

    console.log('\n===============================================================');
    console.log(`Deep Harvest Complete: Processed=${processed}, Accepted=${accepted}, Filtered=${filtered}, Failed=${failed}`);
    console.log('===============================================================');
  }

  async discoverHistoricalSeeds() {
    console.log('[DeepHarvest] Enqueuing historical seeds and sectional archives...');

    const historicalFeeds = [
      'https://www.hindustantimes.com/author/arun-kumar-101608310583746',
      'https://www.hindustantimes.com/author/arun-kumar-101608310583746/page-2',
      'https://www.hindustantimes.com/cities/patna-news',
      'https://www.hindustantimes.com/education',
      'https://www.hindustantimes.com/cities/patna-news/page-2',
      'https://www.hindustantimes.com/cities/patna-news/page-3'
    ];

    for (const feedUrl of historicalFeeds) {
      try {
        console.log(`[DeepHarvest] Scanning feed: ${feedUrl}`);
        const res = await axios.get(feedUrl, { headers: this.headers, timeout: 15000 });
        if (res.status === 200) {
          const $ = cheerio.load(res.data);
          let found = 0;
          $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && href.match(/-(\d+)\.html$/) && !href.includes('/photos/') && !href.includes('/videos/')) {
              const fullUrl = href.startsWith('http') ? href : `https://www.hindustantimes.com${href}`;
              if (this.queue.enqueue(fullUrl, 'historical_feed', 15)) {
                found++;
              }
            }
          });
          console.log(`[DeepHarvest] Found ${found} new article URLs from ${feedUrl}`);
        }
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        console.warn(`[DeepHarvest] Error scanning ${feedUrl}: ${e.message}`);
      }
    }
  }
}

if (require.main === module) {
  const harvester = new DeepHistoricalHarvester();
  harvester.runHarvest().catch(err => console.error('Fatal harvest error:', err));
}

module.exports = DeepHistoricalHarvester;
