const crypto = require('crypto');

class ArticleNormalizer {
  /**
   * Strictly normalizes article text and metadata according to the Non-Negotiable Body Rule.
   * Preserves exact journalistic wording, paragraphs, and datelines without any rewriting.
   */
  normalize(rawArticle) {
    const headline = this.cleanString(rawArticle.headline);
    const subHeadline = this.cleanString(rawArticle.sub_headline || '');
    const byline = this.cleanString(rawArticle.byline || 'Arun Kumar');
    const dateline = this.cleanString(rawArticle.dateline || 'Patna');
    const url = rawArticle.url.trim();

    // 1. Exact Paragraph Preservation
    let paragraphs = [];
    if (Array.isArray(rawArticle.paragraphs) && rawArticle.paragraphs.length > 0) {
      paragraphs = rawArticle.paragraphs.map(p => this.cleanParagraph(p)).filter(Boolean);
    } else if (rawArticle.body_text) {
      paragraphs = rawArticle.body_text.split(/\n\s*\n/).map(p => this.cleanParagraph(p)).filter(Boolean);
    }

    const cleanBodyText = paragraphs.join('\n\n');

    // 2. Cryptographic Content Hash (SHA-256)
    const contentSha256 = crypto.createHash('sha256').update(cleanBodyText, 'utf8').digest('hex');

    // 3. Slug Generation
    const slug = this.generateSlug(headline, rawArticle.article_id);

    // 4. Standardized ISO Timestamps
    const publishedIso = this.parseDate(rawArticle.published_at);
    const modifiedIso = this.parseDate(rawArticle.modified_at) || publishedIso;

    // 5. Reading Time Calculation (~200 words per minute)
    const wordCount = cleanBodyText.split(/\s+/).filter(Boolean).length;
    const readingTimeMin = Math.max(1, Math.ceil(wordCount / 200));

    return {
      id: rawArticle.article_id || slug,
      slug: slug,
      title: headline,
      summary: subHeadline || (paragraphs[0] ? paragraphs[0].substring(0, 160) + '...' : ''),
      byline: byline,
      dateline: dateline,
      published_at: publishedIso,
      modified_at: modifiedIso,
      word_count: wordCount,
      reading_time_minutes: readingTimeMin,
      source_url: url,
      content_sha256: contentSha256,
      body_text: cleanBodyText,
      paragraphs: paragraphs
    };
  }

  cleanString(str) {
    if (!str) return '';
    return str
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  cleanParagraph(p) {
    if (!p) return '';
    const cleaned = p
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned;
  }

  generateSlug(headline, id) {
    let slug = headline
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 80);

    if (!slug) slug = 'article';
    if (id) {
      const shortId = id.toString().slice(-6);
      slug = `${slug}-${shortId}`;
    }
    return slug;
  }

  parseDate(dateStr) {
    if (!dateStr) return new Date().toISOString();
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toISOString();
      }
    } catch (e) {}
    return new Date().toISOString();
  }
}

module.exports = ArticleNormalizer;
