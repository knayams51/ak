const axios = require('axios');
const cheerio = require('cheerio');

async function testHistoricalMonth() {
  const url = 'https://www.hindustantimes.com/sitemap/march-2014.xml';
  console.log('Fetching', url);
  const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(res.data, { xmlMode: true });
  const urls = [];
  $('loc').each((_, elem) => {
    urls.push($(elem).text().trim());
  });
  console.log('Total URLs in March 2014 sitemap:', urls.length);
  const patnaOrBihar = urls.filter(u => u.includes('patna') || u.includes('bihar') || u.includes('education'));
  console.log('Patna/Bihar/Education URLs in March 2014:', patnaOrBihar.length);
  if (patnaOrBihar.length > 0) {
    console.log('Sample matching URLs:\n', patnaOrBihar.slice(0, 8).join('\n'));
  }
}

testHistoricalMonth();
