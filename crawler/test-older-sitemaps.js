const axios = require('axios');
const cheerio = require('cheerio');
const HTArticleExtractor = require('./extractor');
const AuthorDisambiguator = require('./author-filter');

async function testOlderSitemaps() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
  };

  const testSitemaps = [
    'https://www.hindustantimes.com/sitemap/november-2010.xml',
    'https://www.hindustantimes.com/sitemap/october-2005.xml',
    'https://www.hindustantimes.com/sitemap/december-2012.xml'
  ];

  const extractor = new HTArticleExtractor();
  const disambiguator = new AuthorDisambiguator();

  for (const sm of testSitemaps) {
    try {
      console.log(`\nFetching ${sm}...`);
      const res = await axios.get(sm, { headers, timeout: 12000 });
      const $ = cheerio.load(res.data, { xmlMode: true });
      const urls = [];
      $('loc').each((_, elem) => {
        const u = $(elem).text().trim();
        if (u && (u.includes('patna') || u.includes('bihar') || u.includes('nitish') || u.includes('education'))) {
          urls.push(u);
        }
      });
      console.log(`Found ${urls.length} matching URLs in ${sm}`);
      if (urls.length > 0) {
        console.log('Sample candidate:', urls[0]);
        // Try to fetch and extract first URL
        const artRes = await axios.get(urls[0], { headers, timeout: 10000 });
        const art = extractor.extract(artRes.data, urls[0]);
        console.log('Extracted headline:', art.headline);
        console.log('Extracted byline:', art.byline);
        console.log('Extracted dateline:', art.dateline);
        console.log('Extracted published_at:', art.published_at);
        console.log('Body length:', art.body_text.length);
      }
    } catch (e) {
      console.error(`Error on ${sm}: ${e.message}`);
    }
  }
}

testOlderSitemaps();
