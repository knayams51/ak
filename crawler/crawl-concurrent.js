const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const config = require('./config');
const QueueManager = require('./queue-manager');
const HTArticleExtractor = require('./extractor');
const AuthorDisambiguator = require('./author-filter');

async function runConcurrentHarvest(concurrency = 6) {
  console.log('===============================================================');
  console.log(`   Running Concurrent Historical Crawler (${concurrency} Workers)`);
  console.log('===============================================================');

  const queue = new QueueManager(config.paths.db_path);
  const extractor = new HTArticleExtractor();
  const disambiguator = new AuthorDisambiguator();
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': 'https://www.hindustantimes.com/'
  };

  let active = true;
  let processed = 0;
  let accepted = 0;
  let filtered = 0;
  let failed = 0;

  async function worker(workerId) {
    while (active) {
      const items = queue.getNext(1);
      if (!items || items.length === 0) {
        break;
      }

      const item = items[0];
      queue.markProcessing(item.id);
      processed++;

      try {
        const res = await axios.get(item.url, { headers, timeout: 12000, validateStatus: s => s < 400 });
        if (res.status === 200) {
          const article = extractor.extract(res.data, item.url);
          const evalResult = disambiguator.evaluate(article);

          if (evalResult.isValid) {
            accepted++;
            console.log(`\n[W${workerId}] [ACCEPTED #${accepted}] (${evalResult.score}) "${article.headline.substring(0, 60)}..."`);
            console.log(`     Date: ${article.published_at} | Byline: ${article.byline} | Dateline: ${article.dateline}`);

            article.is_disambiguated = true;
            article.disambiguation_score = evalResult.score;
            article.disambiguation_reasons = evalResult.reasons;

            fs.appendFileSync(config.paths.raw_output_jsonl, JSON.stringify(article) + '\n', 'utf8');
            queue.saveArticle(article);
            queue.markCompleted(item.id);
          } else {
            queue.markFilteredOut(item.id, evalResult.warnings.join('; ') || 'Disambiguation filtered');
            filtered++;
          }
        } else {
          queue.markFailed(item.id, `HTTP ${res.status}`);
          failed++;
        }
      } catch (err) {
        queue.markFailed(item.id, err.message);
        failed++;
      }

      if (processed % 25 === 0) {
        console.log(`[Batch Progress] Processed: ${processed} | Accepted: ${accepted} | Filtered: ${filtered} | Failed: ${failed}`);
      }

      await new Promise(r => setTimeout(r, 400));
    }
  }

  const workers = [];
  for (let i = 1; i <= concurrency; i++) {
    workers.push(worker(i));
  }

  await Promise.all(workers);
  queue.saveFallback(true);

  console.log('\n===============================================================');
  console.log(`Concurrent Crawl Complete: Processed=${processed}, Accepted=${accepted}, Filtered=${filtered}, Failed=${failed}`);
  console.log('===============================================================');
}

runConcurrentHarvest(6).catch(err => console.error('Concurrent harvest error:', err));
