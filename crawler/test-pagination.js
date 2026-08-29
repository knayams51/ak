const axios = require('axios');
const cheerio = require('cheerio');

async function testAuthorPages() {
  const base = 'https://www.hindustantimes.com/author/arun-kumar-101608310583746/page-';
  const headers = { 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };
  
  for (const p of [1, 2, 3, 5, 8, 10, 15, 20, 30, 50]) {
    try {
      const url = p === 1 ? 'https://www.hindustantimes.com/author/arun-kumar-101608310583746' : `${base}${p}`;
      const res = await axios.get(url, { headers, timeout: 10000, validateStatus: () => true });
      if (res.status === 200) {
        const $ = cheerio.load(res.data);
        const links = [];
        $('a[href]').each((_, elem) => {
          const href = $(elem).attr('href');
          if (href && href.match(/-(\d+)\.html$/) && !href.includes('/photos/') && !href.includes('/videos/')) {
            links.push(href);
          }
        });
        console.log(`Page ${p}: HTTP ${res.status}, found ${links.length} article links`);
        if (links.length > 0) {
          console.log(`   First: ${links[0]}`);
          console.log(`   Last:  ${links[links.length - 1]}`);
        }
      } else {
        console.log(`Page ${p}: HTTP ${res.status}`);
      }
      await new Promise(r => setTimeout(r, 1000));
    } catch(e) {
      console.log(`Page ${p}: Error ${e.message}`);
    }
  }
}

testAuthorPages();
