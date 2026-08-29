const axios = require('axios');

async function testSitemaps() {
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36' };
  const sitemapUrls = [
    'https://www.hindustantimes.com/robots.txt',
    'https://www.hindustantimes.com/sitemap.xml',
    'https://www.hindustantimes.com/sitemap/archive.xml',
    'https://www.hindustantimes.com/sitemap/archive-2020.xml'
  ];
  
  for (const u of sitemapUrls) {
    try {
      const res = await axios.get(u, { headers, timeout: 8000, validateStatus: () => true });
      console.log(`HTTP ${res.status} for ${u}, length: ${typeof res.data === 'string' ? res.data.length : 0}`);
      if (typeof res.data === 'string' && res.data.length > 0) {
        console.log(res.data.substring(0, 400));
        console.log('--------------------------------------------------');
      }
    } catch(e) {
      console.log(`Error for ${u}: ${e.message}`);
    }
  }
}

testSitemaps();
