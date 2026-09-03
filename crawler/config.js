const path = require('path');

module.exports = {
  // Target author information
  target_author: {
    name: "Arun Kumar",
    normalized_names: ["arun kumar", "arun kr", "arunkr", "arunkrht"],
    designation: "Senior Assistant Editor",
    bureau: "Patna",
    author_url: "https://www.hindustantimes.com/authors/arun-kumar",
    author_id_pattern: /arun-kumar/i
  },

  // Disambiguation rules
  disambiguation: {
    required_bylines: [
      "Arun Kumar",
      "Arun Kr",
      "By Arun Kumar",
      "HT Correspondent / Arun Kumar",
      "Arun Kumar / HT Correspondent"
    ],
    positive_datelines: [
      "Patna",
      "PATNA",
      "PATNA:",
      "Patna Bureau",
      "Gaya",
      "Muzaffarpur",
      "Bhagalpur",
      "Darbhanga",
      "Purnia",
      "Bihar"
    ],
    negative_datelines: [
      "New Delhi",
      "NEW DELHI",
      "Mumbai",
      "MUMBAI",
      "Bengaluru",
      "Lucknow",
      "Chandigarh",
      "Kolkata",
      "Hyderabad",
      "Bhopal"
    ],
    positive_topics: [
      "bihar",
      "patna",
      "nitish kumar",
      "patna high court",
      "bpsc",
      "bsusc",
      "patna university",
      "education",
      "assembly election",
      "special vigilance unit",
      "svu"
    ]
  },

  // Discovery seed endpoints
  seeds: {
    author_page: "https://www.hindustantimes.com/author/arun-kumar-101608310583746",
    author_page_paged: "https://www.hindustantimes.com/author/arun-kumar-101608310583746/page-",
    section_patna: "https://www.hindustantimes.com/cities/patna-news",
    section_education: "https://www.hindustantimes.com/education",
    section_india: "https://www.hindustantimes.com/india-news",
    wayback_cdx_api: "https://web.archive.org/cdx/search/cdx?url=hindustantimes.com/*&matchType=prefix&filter=statuscode:200&output=json&collapse=urlkey"
  },

  // Crawl performance and stealth settings
  crawler: {
    concurrency: 2,
    request_delay_ms: 1500,
    navigation_timeout_ms: 45000,
    max_retries: 3,
    user_agents: [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
    ],
    blocked_resource_types: [
      "image",
      "stylesheet",
      "font",
      "media",
      "texttrack",
      "eventsource",
      "websocket"
    ]
  },

  // Output storage paths
  paths: {
    db_path: path.join(__dirname, 'data', 'crawler_queue.db'),
    raw_output_jsonl: path.join(__dirname, 'data', 'crawled_articles.jsonl'),
    reports_dir: path.join(__dirname, '..', 'reports')
  }
};
