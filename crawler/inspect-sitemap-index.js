const axios = require('axios');
const cheerio = require('cheerio');

async function parseSitemaps() {
  const res = await axios.get('https://www.hindustantimes.com/sitemap/index.xml', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(res.data, { xmlMode: true });
  const locs = [];
  $('loc').each((_, elem) => {
    const text = $(elem).text().trim();
    if (text && !text.includes('/photos-') && !text.includes('/videos-') && !text.includes('telugu') && !text.includes('bangla')) {
      locs.push(text);
    }
  });
  console.log('Total text article sitemaps found:', locs.length);
  console.log('Recent 10 sitemaps:\n', locs.slice(0, 10).join('\n'));
  console.log('\nEarliest 15 sitemaps:\n', locs.slice(-15).join('\n'));
}

parseSitemaps();
