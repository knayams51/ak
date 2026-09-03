const cheerio = require('cheerio');
const crypto = require('crypto');

class HTArticleExtractor {
  constructor() {
    this.noiseSelectors = [
      'script',
      'style',
      'noscript',
      'iframe',
      '.ad-container',
      '.ads-holder',
      '.adBox',
      '.storyAd',
      '.share-icons',
      '.social-share',
      '.related-stories',
      '.read-also',
      '.dont-miss',
      '.newsletter-box',
      '.subscription-prompt',
      '.comment-box',
      '#comments',
      '.footer-ad',
      '.taboola-container',
      '.outbrain_widget_container',
      '.live-blog-update-time'
    ];
  }

  extract(html, url = '') {
    const $ = cheerio.load(html);

    // 1. Extract JSON-LD NewsArticle structured data
    let jsonldData = null;
    $('script[type="application/ld+json"]').each((_, elem) => {
      try {
        const text = $(elem).html();
        if (!text) return;
        const parsed = JSON.parse(text);
        if (parsed['@type'] === 'NewsArticle' || parsed['@type'] === 'Article') {
          jsonldData = parsed;
        } else if (Array.isArray(parsed['@graph'])) {
          const articleNode = parsed['@graph'].find(g => g && (g['@type'] === 'NewsArticle' || g['@type'] === 'Article'));
          if (articleNode) {
            jsonldData = articleNode;
          }
        } else if (Array.isArray(parsed)) {
          const articleNode = parsed.find(g => g && (g['@type'] === 'NewsArticle' || g['@type'] === 'Article'));
          if (articleNode) {
            jsonldData = articleNode;
          }
        }
      } catch (e) {
        // Continue searching
      }
    });

    // 2. Headline
    let headline = '';
    if (jsonldData && jsonldData.headline) {
      headline = jsonldData.headline;
    } else {
      headline = $('h1.hdg1, h1.story-headline, h1.article-title, h1').first().text().trim();
    }

    // 3. Sub-headline / Summary
    let subHeadline = '';
    if (jsonldData && jsonldData.description) {
      subHeadline = jsonldData.description;
    } else {
      subHeadline = $('.story-summary, .article-subtitle, .hdg2, h2.sortHdg').first().text().trim();
    }

    // 4. Byline
    let byline = '';
    if (jsonldData && jsonldData.author) {
      if (typeof jsonldData.author === 'string') {
        byline = jsonldData.author;
      } else if (Array.isArray(jsonldData.author)) {
        byline = jsonldData.author.map(a => (typeof a === 'string' ? a : a.name)).filter(Boolean).join(', ');
      } else if (jsonldData.author.name) {
        byline = jsonldData.author.name;
      }
    }
    if (!byline) {
      byline = $('.storyBy, .byLine, .author-name, .story-byline, .author').first().text().replace(/^By:?\s*/i, '').trim();
    }
    if (!byline) {
      byline = '';
    }

    // 5. Timestamps
    let publishedAt = '';
    let modifiedAt = '';
    if (jsonldData) {
      publishedAt = jsonldData.datePublished || '';
      modifiedAt = jsonldData.dateModified || publishedAt;
    }
    if (!publishedAt) {
      const timeAttr = $('time').attr('datetime') || $('.story-date, .dateTime, .pub-date').first().text().trim();
      publishedAt = timeAttr || new Date().toISOString();
    }

    // 6. Clean Body Extraction (Strict Preservation)
    // Remove noise elements
    this.noiseSelectors.forEach(sel => $(sel).remove());

    // Look for article content container
    const contentSelectors = [
      '.storyDetails',
      '.story-details',
      '.detail',
      '.storyContent',
      '#dataHolder',
      '.content-holder',
      'article'
    ];

    let $bodyContainer = null;
    for (const sel of contentSelectors) {
      if ($(sel).length > 0) {
        $bodyContainer = $(sel);
        break;
      }
    }
    if (!$bodyContainer) {
      $bodyContainer = $('body');
    }

    const paragraphs = [];
    $bodyContainer.find('p').each((_, elem) => {
      const pText = $(elem).text().replace(/\s+/g, ' ').trim();
      // Skip empty or ad disclaimer paragraphs
      if (!pText || pText.length < 5) return;
      if (/^(also read|read:|watch:|subscribe to|follow us|advertisement)/i.test(pText)) return;
      paragraphs.push(pText);
    });

    const bodyText = paragraphs.join('\n\n');

    // 7. Dateline Extraction
    let dateline = '';
    const firstP = paragraphs[0] || '';
    const datelineMatch = firstP.match(/^([A-Z\s]{3,20}):\s*/);
    if (datelineMatch) {
      dateline = datelineMatch[1].trim();
    } else if (jsonldData && jsonldData.dateline) {
      dateline = (typeof jsonldData.dateline === 'string' ? jsonldData.dateline : (jsonldData.dateline.name || '')).trim();
    } else if (jsonldData && jsonldData.contentLocation) {
      const loc = jsonldData.contentLocation;
      dateline = (typeof loc === 'string' ? loc : (loc.name || '')).trim();
    }

    // 8. Article ID & URL
    let articleId = '';
    const idMatch = url.match(/-(\d+)\.html/);
    if (idMatch) {
      articleId = idMatch[1];
    } else {
      articleId = crypto.createHash('md5').update(url || headline).digest('hex').substring(0, 16);
    }

    // 9. SHA-256 Content Hash
    const bodySha256 = crypto.createHash('sha256').update(bodyText, 'utf8').digest('hex');

    return {
      article_id: articleId,
      url: url,
      headline: headline,
      sub_headline: subHeadline,
      byline: byline,
      dateline: dateline,
      published_at: publishedAt,
      modified_at: modifiedAt,
      body_text: bodyText,
      body_sha256: bodySha256,
      paragraphs: paragraphs,
      jsonld_data: jsonldData
    };
  }
}

module.exports = HTArticleExtractor;
