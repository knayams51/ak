const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const config = require('./config');
const QueueManager = require('./queue-manager');
const HTArticleExtractor = require('./extractor');
const AuthorDisambiguator = require('./author-filter');

async function crawlHistoricalPages() {
  console.log('===============================================================');
  console.log('   Scanning Deeper Patna & Bihar Section Feeds (Pages 4–25)');
  console.log('===============================================================');

  const queue = new QueueManager(config.paths.db_path);
  const extractor = new HTArticleExtractor();
  const disambiguator = new AuthorDisambiguator();
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': 'https://www.hindustantimes.com/'
  };

  // Section paginations
  const sectionPages = [];
  for (let p = 4; p <= 20; p++) {
    sectionPages.push(`https://www.hindustantimes.com/cities/patna-news/page-${p}`);
  }
  for (let p = 2; p <= 10; p++) {
    sectionPages.push(`https://www.hindustantimes.com/education/news/page-${p}`);
  }

  let discovered = 0;
  for (const pageUrl of sectionPages) {
    try {
      console.log(`[ArchiveScanner] Fetching archive index: ${pageUrl}`);
      const res = await axios.get(pageUrl, { headers, timeout: 15000, validateStatus: s => s < 400 });
      if (res.status === 200) {
        const $ = cheerio.load(res.data);
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href');
          if (href && href.match(/-(\d+)\.html$/) && !href.includes('/photos/') && !href.includes('/videos/') && !href.includes('/brand-stories/')) {
            const fullUrl = href.startsWith('http') ? href : `https://www.hindustantimes.com${href}`;
            if (queue.enqueue(fullUrl, 'section_archive_deep', 20)) {
              discovered++;
            }
          }
        });
      }
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      console.warn(`[ArchiveScanner] Error fetching ${pageUrl}: ${e.message}`);
    }
  }

  console.log(`\n[ArchiveScanner] Total newly discovered candidates enqueued: ${discovered}`);

  // Now process queued candidates
  let accepted = 0;
  let filtered = 0;
  let failed = 0;
  let count = 0;

  while (true) {
    const batch = queue.getNext(1);
    if (!batch || batch.length === 0) break;

    const item = batch[0];
    queue.markProcessing(item.id);
    count++;

    try {
      const response = await axios.get(item.url, { headers, timeout: 15000, validateStatus: s => s < 400 });
      if (response.status === 200) {
        const articleData = extractor.extract(response.data, item.url);
        const evalResult = disambiguator.evaluate(articleData);

        if (evalResult.isValid) {
          console.log(`\n[ACCEPTED #${accepted + 1}] (${evalResult.score}) "${articleData.headline.substring(0, 65)}..."`);
          console.log(`   Date: ${articleData.published_at} | Byline: ${articleData.byline} | Dateline: ${articleData.dateline}`);

          articleData.is_disambiguated = true;
          articleData.disambiguation_score = evalResult.score;
          articleData.disambiguation_reasons = evalResult.reasons;

          fs.appendFileSync(config.paths.raw_output_jsonl, JSON.stringify(articleData) + '\n', 'utf8');
          queue.saveArticle(articleData);
          queue.markCompleted(item.id);
          accepted++;
        } else {
          queue.markFilteredOut(item.id, evalResult.warnings.join('; ') || 'Disambiguation filtered');
          filtered++;
        }
      } else {
        queue.markFailed(item.id, `Status ${response.status}`);
        failed++;
      }
    } catch (err) {
      queue.markFailed(item.id, err.message);
      failed++;
    }

    if (count % 20 === 0) {
      console.log(`[Progress] Processed: ${count} | Accepted: ${accepted} | Filtered: ${filtered}`);
    }

    await new Promise(r => setTimeout(r, 600));
  }

  console.log('\n===============================================================');
  console.log(`Historical Section Deep Scan Complete: Processed=${count}, Accepted=${accepted}, Filtered=${filtered}`);
  console.log('===============================================================');
}

crawlHistoricalPages().catch(err => console.error('Historical crawl error:', err));
