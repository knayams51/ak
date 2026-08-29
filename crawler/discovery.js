const axios = require('axios');
const cheerio = require('cheerio');
const config = require('./config');

class DiscoveryService {
  constructor(queueManager) {
    this.queue = queueManager;
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none'
    };
  }

  async discoverFromAuthorPage(maxPages = 5) {
    const discoveredUrls = new Set();
    console.log(`[Discovery] Starting Author Page Discovery: ${config.seeds.author_page}`);

    for (let page = 1; page <= maxPages; page++) {
      const url = page === 1 ? config.seeds.author_page : `${config.seeds.author_page_paged}${page}`;
      try {
        console.log(`[Discovery] Fetching author page ${page}: ${url}`);
        const response = await axios.get(url, {
          headers: this.headers,
          timeout: 15000
        });

        if (response.status !== 200) {
          console.warn(`[Discovery] Non-200 status (${response.status}) on ${url}`);
          break;
        }

        const $ = cheerio.load(response.data);
        let foundOnPage = 0;

        // Collect article links
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href');
          if (!href) return;

          // Match HT article patterns (e.g. /cities/patna-news/slug-1016...html or /education/slug-1016...html)
          if (href.match(/-(\d+)\.html$/) && !href.includes('/photos/') && !href.includes('/videos/')) {
            const fullUrl = href.startsWith('http') ? href : `https://www.hindustantimes.com${href}`;
            if (!discoveredUrls.has(fullUrl)) {
              discoveredUrls.add(fullUrl);
              this.queue.enqueue(fullUrl, 'author_feed', 20);
              foundOnPage++;
            }
          }
        });

        console.log(`[Discovery] Page ${page}: Discovered ${foundOnPage} article URLs`);
        if (foundOnPage === 0 && page > 1) {
          console.log(`[Discovery] No more articles found on page ${page}. Ending pagination.`);
          break;
        }

        // Politeness delay
        await new Promise(r => setTimeout(r, config.crawler.request_delay_ms));
      } catch (err) {
        console.error(`[Discovery] Error fetching author page ${page}: ${err.message}`);
        break;
      }
    }

    return Array.from(discoveredUrls);
  }

  async discoverFromSectionPages() {
    const discoveredUrls = new Set();
    const sections = [config.seeds.section_patna, config.seeds.section_education];

    for (const sectionUrl of sections) {
      try {
        console.log(`[Discovery] Fetching section page: ${sectionUrl}`);
        const response = await axios.get(sectionUrl, {
          headers: this.headers,
          timeout: 15000
        });

        if (response.status === 200) {
          const $ = cheerio.load(response.data);
          let found = 0;
          $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && href.match(/-(\d+)\.html$/) && (href.includes('/patna-news/') || href.includes('/education/'))) {
              const fullUrl = href.startsWith('http') ? href : `https://www.hindustantimes.com${href}`;
              if (!discoveredUrls.has(fullUrl)) {
                discoveredUrls.add(fullUrl);
                this.queue.enqueue(fullUrl, 'section_feed', 10);
                found++;
              }
            }
          });
          console.log(`[Discovery] Section ${sectionUrl}: Discovered ${found} URLs`);
        }
        await new Promise(r => setTimeout(r, config.crawler.request_delay_ms));
      } catch (err) {
        console.error(`[Discovery] Error crawling section ${sectionUrl}: ${err.message}`);
      }
    }

    return Array.from(discoveredUrls);
  }
}

module.exports = DiscoveryService;
