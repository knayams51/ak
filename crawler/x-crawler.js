const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

class XCrawler {
  constructor(options = {}) {
    this.options = Object.assign({
      screenName: 'ArunkrHt',
      limit: 20,
      scrollSteps: 4,
      scrollDelayMs: 2500,
      chromePath: this.findChromePath()
    }, options);
  }

  findChromePath() {
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
      return process.env.CHROME_PATH;
    }
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    throw new Error('Chrome or Edge executable not found. Please set CHROME_PATH environment variable.');
  }

  async crawlProfile(screenName = null, limit = null) {
    const targetUser = screenName || this.options.screenName;
    const maxTweets = limit || this.options.limit;
    const profileUrl = `https://x.com/${targetUser}`;

    console.log('===============================================================');
    console.log(`   X (Twitter) Profile Harvester: @${targetUser}               `);
    console.log('===============================================================');
    console.log(`[XCrawler] Target URL: ${profileUrl}`);
    console.log(`[XCrawler] Using Browser: ${this.options.chromePath}`);

    const browser = await puppeteer.launch({
      executablePath: this.options.chromePath,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,900'
      ]
    });

    const harvestedTweets = new Map();

    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1280, height: 900 });

      // Inject auth_token cookie if provided
      if (process.env.X_AUTH_TOKEN) {
        console.log(`[XCrawler] Authenticating session via X_AUTH_TOKEN secret...`);
        await page.setCookie({
          name: 'auth_token',
          value: process.env.X_AUTH_TOKEN.trim(),
          domain: '.x.com',
          path: '/',
          httpOnly: true,
          secure: true
        });
      }

      // Block unnecessary heavy resources
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (resourceType === 'font' || (resourceType === 'stylesheet' && req.url().includes('font'))) {
          req.abort();
        } else {
          req.continue();
        }
      });

      console.log(`[XCrawler] Loading profile page...`);
      await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 35000 });

      // Allow initial client-side hydrate
      await new Promise(r => setTimeout(r, 3500));

      console.log(`[XCrawler] Page title: "${await page.title()}"`);

      // Scroll and harvest loop
      for (let step = 0; step < this.options.scrollSteps; step++) {
        const batch = await page.evaluate(() => {
          const results = [];
          const articles = document.querySelectorAll('article');

          articles.forEach(art => {
            const textEl = art.querySelector('div[data-testid="tweetText"]');
            const text = textEl ? textEl.innerText.trim() : '';

            const timeEl = art.querySelector('time');
            const time = timeEl ? timeEl.getAttribute('datetime') : '';

            const linkEl = art.querySelector('a[href*="/status/"]');
            const statusUrl = linkEl ? linkEl.href : '';

            let tweetId = '';
            const idMatch = statusUrl.match(/\/status\/(\d+)/);
            if (idMatch) tweetId = idMatch[1];

            // Extract attached images (skipping avatars and emojis)
            const images = [];
            art.querySelectorAll('div[data-testid="tweetPhoto"] img, img[src*="pbs.twimg.com/media"]').forEach(img => {
              const src = img.src || '';
              if (src && src.includes('pbs.twimg.com/media') && !src.includes('profile_images')) {
                // Ensure uncompressed original JPG format
                let highRes = src;
                if (highRes.includes('&name=')) {
                  highRes = highRes.replace(/&name=[a-z0-9]+/i, '&name=orig');
                } else if (!highRes.includes('name=')) {
                  highRes += highRes.includes('?') ? '&name=orig' : '?format=jpg&name=orig';
                }
                if (highRes.includes('format=')) {
                  highRes = highRes.replace(/format=[a-z0-9]+/i, 'format=jpg');
                }
                if (!images.includes(highRes)) images.push(highRes);
              }
            });

            if (tweetId || text || images.length > 0) {
              results.push({
                tweet_id: tweetId,
                status_url: statusUrl,
                created_at: time,
                text: text,
                images: images,
                has_images: images.length > 0
              });
            }
          });

          return results;
        });

        // Store into map
        for (const t of batch) {
          const key = t.tweet_id || t.status_url || t.text.substring(0, 40);
          if (!harvestedTweets.has(key)) {
            harvestedTweets.set(key, t);
          }
        }

        console.log(`[XCrawler] Scroll step ${step + 1}/${this.options.scrollSteps} — Collected: ${harvestedTweets.size} unique tweets`);

        if (harvestedTweets.size >= maxTweets) break;

        // Scroll down
        await page.evaluate(() => window.scrollBy(0, 1200));
        await new Promise(r => setTimeout(r, this.options.scrollDelayMs));
      }

    } catch (err) {
      console.error(`[XCrawler] Error during crawl: ${err.message}`);
    } finally {
      await browser.close();
    }

    const tweetList = Array.from(harvestedTweets.values());
    console.log(`\n[XCrawler] Total harvested tweets: ${tweetList.length}`);
    const withImages = tweetList.filter(t => t.has_images);
    console.log(`[XCrawler] Tweets with attached images/clippings: ${withImages.length}`);

    return tweetList;
  }
}

// CLI test runner
if (require.main === module) {
  const args = process.argv.slice(2);
  let limit = 20;
  let screenName = 'ArunkrHt';

  for (const a of args) {
    if (a.startsWith('--limit=')) limit = parseInt(a.split('=')[1], 10);
    if (a.startsWith('--screen-name=')) screenName = a.split('=')[1];
  }

  const crawler = new XCrawler({ screenName, limit });
  crawler.crawlProfile().then(tweets => {
    console.log('\n--- Harvesting Results ---');
    tweets.forEach((t, i) => {
      console.log(`\n[#${i + 1}] ID: ${t.tweet_id} | Images: ${t.images.length}`);
      console.log(`     URL: ${t.status_url}`);
      console.log(`     Text: "${t.text.replace(/\n/g, ' ')}"`);
      if (t.images.length > 0) {
        console.log(`     Image: ${t.images[0]}`);
      }
    });
  }).catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = XCrawler;
