const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const config = require('./config');
const QueueManager = require('./queue-manager');
const HTArticleExtractor = require('./extractor');
const AuthorDisambiguator = require('./author-filter');

class HistoricalDeepWavesHarvester {
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

  async run(options = { startYear: 2002, endYear: 2013, maxPerMonth: 40, concurrency: 6 }) {
    console.log('===============================================================');
    console.log(`   Hindustan Times Deep Historical Waves (${options.startYear}–${options.endYear})`);
    console.log('===============================================================');

    // 1. Discover monthly sitemaps for 2002 to 2013
    const monthlySitemaps = await this.discoverMonthlySitemaps(options.startYear, options.endYear);
    console.log(`[DeepWaves] Found ${monthlySitemaps.length} monthly sitemaps matching ${options.startYear}–${options.endYear}`);

    // 2. Scan sitemaps and enqueue candidates
    let totalEnqueued = 0;
    for (const sitemapUrl of monthlySitemaps) {
      const enqueued = await this.scanMonthlySitemap(sitemapUrl, options.maxPerMonth);
      totalEnqueued += enqueued;
    }
    console.log(`\n[DeepWaves] Total candidate articles enqueued: ${totalEnqueued}`);

    // 3. Process candidate URLs with concurrent worker pool
    await this.processQueue(options.concurrency);
  }

  async discoverMonthlySitemaps(startYear, endYear) {
    try {
      console.log('[DeepWaves] Reading sitemap index from https://www.hindustantimes.com/sitemap/index.xml...');
      const res = await axios.get('https://www.hindustantimes.com/sitemap/index.xml', { headers: this.headers, timeout: 15000 });
      const $ = cheerio.load(res.data, { xmlMode: true });
      const matching = [];

      $('loc').each((_, elem) => {
        const text = $(elem).text().trim();
        if (text && !text.includes('/photos-') && !text.includes('/videos-') && !text.includes('telugu') && !text.includes('bangla')) {
          for (let y = startYear; y <= endYear; y++) {
            if (text.includes(`-${y}.xml`) || text.includes(`/${y}.xml`)) {
              matching.push(text);
              break;
            }
          }
        }
      });

      return matching;
    } catch (e) {
      console.error(`[DeepWaves] Error discovering sitemaps: ${e.message}`);
      return [];
    }
  }

  async scanMonthlySitemap(sitemapUrl, maxPerMonth = 40) {
    try {
      const res = await axios.get(sitemapUrl, { headers: this.headers, timeout: 15000 });
      const $ = cheerio.load(res.data, { xmlMode: true });
      const candidates = [];

      $('loc').each((_, elem) => {
        const url = $(elem).text().trim();
        if (!url || url.includes('/photos/') || url.includes('/videos/') || url.includes('/brand-stories/')) {
          return;
        }

        const lower = url.toLowerCase();
        if (
          lower.includes('patna') ||
          lower.includes('bihar') ||
          lower.includes('nitish') ||
          lower.includes('bpsc') ||
          lower.includes('university') ||
          lower.includes('college') ||
          lower.includes('election') ||
          lower.includes('/cities/patna-news/') ||
          lower.includes('/education/') ||
          lower.includes('/patna/')
        ) {
          candidates.push(url);
        }
      });

      console.log(`[DeepWaves] ${path.basename(sitemapUrl)}: ${candidates.length} candidates`);
      const toEnqueue = candidates.slice(0, maxPerMonth);
      let count = 0;
      for (const u of toEnqueue) {
        if (this.queue.enqueue(u, 'deep_waves_2002_2013', 25)) {
          count++;
        }
      }
      return count;
    } catch (e) {
      console.warn(`   Error reading ${sitemapUrl}: ${e.message}`);
      return 0;
    }
  }

  async processQueue(concurrency = 6) {
    console.log('\n===============================================================');
    console.log(`   Processing Candidates with ${concurrency} Concurrent Workers`);
    console.log('===============================================================');

    let processed = 0;
    let accepted = 0;
    let filtered = 0;
    let failed = 0;
    let running = true;

    const worker = async (workerId) => {
      while (running) {
        const items = this.queue.getNext(1);
        if (!items || items.length === 0) {
          break;
        }

        const item = items[0];
        this.queue.markProcessing(item.id);
        processed++;

        try {
          const res = await axios.get(item.url, {
            headers: this.headers,
            timeout: 12000,
            validateStatus: s => s < 400
          });

          if (res.status === 200) {
            const article = this.extractor.extract(res.data, item.url);
            const evalResult = this.disambiguator.evaluate(article);

            if (evalResult.isValid) {
              accepted++;
              console.log(`\n[W${workerId}] [ACCEPTED #${accepted}] (${evalResult.score}) "${article.headline.substring(0, 60)}..."`);
              console.log(`     Published: ${article.published_at} | Byline: ${article.byline} | Dateline: ${article.dateline}`);

              article.is_disambiguated = true;
              article.disambiguation_score = evalResult.score;
              article.disambiguation_reasons = evalResult.reasons;

              fs.appendFileSync(config.paths.raw_output_jsonl, JSON.stringify(article) + '\n', 'utf8');
              this.queue.saveArticle(article);
              this.queue.markCompleted(item.id);
            } else {
              this.queue.markFilteredOut(item.id, evalResult.warnings.join('; ') || 'Disambiguation filtered');
              filtered++;
            }
          } else {
            this.queue.markFailed(item.id, `HTTP ${res.status}`);
            failed++;
          }
        } catch (err) {
          this.queue.markFailed(item.id, err.message);
          failed++;
        }

        if (processed % 25 === 0) {
          console.log(`[Deep Waves Progress] Processed: ${processed} | Accepted: ${accepted} | Filtered: ${filtered} | Failed: ${failed}`);
        }

        await new Promise(r => setTimeout(r, 350));
      }
    };

    const workers = [];
    for (let i = 1; i <= concurrency; i++) {
      workers.push(worker(i));
    }

    await Promise.all(workers);
    this.queue.saveFallback(true);

    console.log('\n===============================================================');
    console.log(`Deep Waves Harvest Complete: Processed=${processed}, Accepted=${accepted}, Filtered=${filtered}`);
    console.log('===============================================================');
  }
}

if (require.main === module) {
  const harvester = new HistoricalDeepWavesHarvester();
  harvester.run({ startYear: 2002, endYear: 2013, maxPerMonth: 35, concurrency: 6 })
    .catch(err => console.error('Deep Waves error:', err));
}

module.exports = HistoricalDeepWavesHarvester;
