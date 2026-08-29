const config = require('./config');

class AuthorDisambiguator {
  constructor(customConfig = null) {
    this.config = customConfig || config.disambiguation;
    this.targetAuthor = (customConfig && customConfig.target_author) || config.target_author;
  }

  /**
   * Disambiguates whether an article was written by Arun Kumar (HT Patna)
   * @param {Object} articleData
   * @returns {Object} { isValid: boolean, score: number, reasons: string[], warnings: string[] }
   */
  evaluate(articleData) {
    const reasons = [];
    const warnings = [];
    let score = 0;

    const byline = (articleData.byline || '').toLowerCase().trim();
    const dateline = (articleData.dateline || '').toLowerCase().trim();
    const body = (articleData.body_text || '').toLowerCase();
    const headline = (articleData.headline || '').toLowerCase();
    const url = (articleData.url || '').toLowerCase();
    const jsonldAuthor = this.extractJsonldAuthor(articleData.jsonld_data);

    // 1. Byline Verification
    let bylineMatches = false;
    for (const name of this.targetAuthor.normalized_names) {
      if (byline.includes(name) || (jsonldAuthor && jsonldAuthor.includes(name))) {
        bylineMatches = true;
        score += 40;
        reasons.push(`Byline matched target author name '${name}'`);
        break;
      }
    }

    // Direct author slug in URL check (e.g. /authors/arun-kumar)
    if (url.includes('arun-kumar')) {
      score += 20;
      reasons.push('URL indicates target author archive origin');
    }

    if (!bylineMatches && !url.includes('arun-kumar')) {
      return {
        isValid: false,
        score: 0,
        reasons: ['Byline does not match Arun Kumar'],
        warnings: ['Rejected due to missing byline match']
      };
    }

    // 2. Dateline & Location Verification
    let datelinePositive = false;
    for (const posDateline of this.config.positive_datelines) {
      const lowerPos = posDateline.toLowerCase();
      if (dateline.includes(lowerPos) || body.startsWith(lowerPos) || headline.includes(lowerPos)) {
        datelinePositive = true;
        score += 30;
        reasons.push(`Dateline matched positive Bihar location '${posDateline}'`);
        break;
      }
    }

    // Check for negative locations (Namesakes in Delhi, Mumbai, etc.)
    let datelineNegative = false;
    for (const negDateline of this.config.negative_datelines) {
      const lowerNeg = negDateline.toLowerCase();
      if (dateline.includes(lowerNeg) && !datelinePositive) {
        datelineNegative = true;
        score -= 50;
        warnings.push(`Dateline matched negative location '${negDateline}'`);
        break;
      }
    }

    // 3. Topic & Content Entity Relevance (Bihar politics, high court, universities)
    let topicEntityHits = 0;
    for (const topic of this.config.positive_topics) {
      if (body.includes(topic) || headline.includes(topic)) {
        topicEntityHits++;
      }
    }

    if (topicEntityHits > 0) {
      const topicScore = Math.min(30, topicEntityHits * 10);
      score += topicScore;
      reasons.push(`Found ${topicEntityHits} Bihar topic/entity markers in content`);
    }

    // Final Decision
    const isValid = score >= 50 && !datelineNegative;

    return {
      isValid,
      score,
      reasons,
      warnings,
      details: {
        bylineMatches,
        datelinePositive,
        datelineNegative,
        topicEntityHits
      }
    };
  }

  extractJsonldAuthor(jsonldData) {
    if (!jsonldData) return null;
    try {
      const data = typeof jsonldData === 'string' ? JSON.parse(jsonldData) : jsonldData;
      if (data.author) {
        if (typeof data.author === 'string') return data.author.toLowerCase();
        if (Array.isArray(data.author)) {
          return data.author.map(a => (typeof a === 'string' ? a : a.name || '')).join(' ').toLowerCase();
        }
        if (data.author.name) return data.author.name.toLowerCase();
      }
      return null;
    } catch (e) {
      return null;
    }
  }
}

// Quick CLI test runner
if (require.main === module) {
  const filter = new AuthorDisambiguator();
  console.log('Testing Author Disambiguator:');

  const testCases = [
    {
      name: 'Valid HT Patna Article',
      data: {
        byline: 'Arun Kumar, Hindustan Times',
        dateline: 'Patna',
        headline: 'Patna High Court issues directive on mental health hospital facilities',
        body_text: 'PATNA: The Patna High Court on Wednesday expressed displeasure over the state of mental health infrastructure...',
        url: 'https://www.hindustantimes.com/cities/patna-news/patna-high-court-mental-health-101612345.html'
      },
      expected: true
    },
    {
      name: 'Invalid HT Delhi Namesake Article',
      data: {
        byline: 'Arun Kumar',
        dateline: 'New Delhi',
        headline: 'Delhi Metro phase 4 construction pace increases',
        body_text: 'NEW DELHI: The Delhi Metro Rail Corporation announced new tenders for phase 4...',
        url: 'https://www.hindustantimes.com/cities/delhi-news/delhi-metro-phase-4-101619999.html'
      },
      expected: false
    }
  ];

  for (const tc of testCases) {
    const result = filter.evaluate(tc.data);
    const passed = result.isValid === tc.expected;
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${tc.name} -> score: ${result.score}, isValid: ${result.isValid}`);
    console.log(`  Reasons: ${result.reasons.join('; ')}`);
    if (result.warnings.length) console.log(`  Warnings: ${result.warnings.join('; ')}`);
  }
}

module.exports = AuthorDisambiguator;
