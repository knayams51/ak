const axios = require('axios');

async function testYearChunkCDX() {
  const years = [2014, 2015, 2018, 2020, 2022, 2024];
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) JournalisticArchiveBot/1.0' };
  
  for (const year of years) {
    try {
      const url = `https://web.archive.org/cdx/search/cdx?url=hindustantimes.com/patna/*&from=${year}0101&to=${year}1231&output=json&limit=6&filter=statuscode:200`;
      console.log(`[CDX] Querying year ${year}...`);
      const res = await axios.get(url, { headers, timeout: 12000 });
      if (Array.isArray(res.data) && res.data.length > 1) {
        console.log(`[CDX] Year ${year}: Found ${res.data.length - 1} records. Sample: ${res.data[1][2]}`);
      } else {
        console.log(`[CDX] Year ${year}: No records returned`);
      }
    } catch(e) {
      console.log(`[CDX] Year ${year} error: ${e.message}`);
    }
  }
}

testYearChunkCDX();
