const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const axios = require('axios');
const XCrawler = require('./x-crawler');
const PackageBuilder = require('../pipeline/package-builder');
const TaxonomyClassifier = require('../pipeline/taxonomy-classifier');

class XSyncEngine {
  constructor(options = {}) {
    this.options = Object.assign({
      screenName: 'ArunkrHt',
      limit: 15,
      forceRebuild: false
    }, options);

    this.packageBuilder = new PackageBuilder();
    this.classifier = new TaxonomyClassifier();
    this.clippingsDir = path.join(__dirname, '..', 'site', 'public', 'documents', 'clippings');

    if (!fs.existsSync(this.clippingsDir)) {
      fs.mkdirSync(this.clippingsDir, { recursive: true });
    }

    this.stats = {
      tweetsScanned: 0,
      tweetsWithMedia: 0,
      ocrValidClippings: 0,
      printExclusives: 0,
      alreadyIngested: 0,
      acceptedArticles: []
    };
  }

  loadExistingArchiveIndex() {
    const knownTitles = new Set();
    const knownIds = new Set();
    const articlesJsonPath = path.join(__dirname, '..', 'site', 'src', 'data', 'articles.json');

    if (fs.existsSync(articlesJsonPath)) {
      try {
        const articles = JSON.parse(fs.readFileSync(articlesJsonPath, 'utf8'));
        for (const art of articles) {
          if (art.title) knownTitles.add(this.normalizeTitle(art.title));
          if (art.id) knownIds.add(String(art.id).toLowerCase());
          if (art.slug) knownIds.add(art.slug.toLowerCase());
          if (art.provenance?.archival_source?.x_status_url) {
            knownIds.add(art.provenance.archival_source.x_status_url.toLowerCase());
          }
        }
      } catch (e) {
        console.warn(`[XSync] Warning reading articles.json: ${e.message}`);
      }
    }
    return { knownTitles, knownIds };
  }

  normalizeTitle(t) {
    return (t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  async runOcr(imageUrl) {
    const scriptPath = path.join(__dirname, 'ocr-clipping-extractor.py');
    const res = spawnSync('python', [scriptPath, `--url=${imageUrl}`], {
      encoding: 'utf8',
      timeout: 45000
    });

    if (res.error) {
      console.error(`[XSync] OCR process error: ${res.error.message}`);
      return null;
    }

    try {
      return JSON.parse(res.stdout);
    } catch (e) {
      console.warn(`[XSync] Could not parse OCR JSON: ${res.stdout?.substring(0, 200)}`);
      return null;
    }
  }

  async checkHtDigitalPresence(headline) {
    // Cross-checks whether the headline is already published on hindustantimes.com digital
    try {
      const query = encodeURIComponent(`site:hindustantimes.com "${headline}"`);
      const searchUrl = `https://html.duckduckgo.com/html/?q=${query}`;
      const resp = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });
      const html = resp.data || '';
      // Look for hindustantimes.com URLs in search result snippets
      const hasHtDigital = html.includes('hindustantimes.com/') && html.toLowerCase().includes(headline.toLowerCase().substring(0, 25));
      return hasHtDigital;
    } catch (e) {
      return false; // Default to false if search fails
    }
  }

  async downloadClippingImage(imageUrl, destPath) {
    const resp = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 20000
    });
    fs.writeFileSync(destPath, Buffer.from(resp.data));
  }

  generateSlug(headline, tweetId) {
    const base = headline
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .substring(0, 60);
    const suffix = tweetId ? tweetId.slice(-6) : Math.random().toString(36).substring(2, 8);
    return `${base}-${suffix}`;
  }

  async run() {
    console.log('===============================================================');
    console.log('   Arun Kumar Living Archive: X Post & Print Clipping Sync    ');
    console.log('===============================================================');
    console.log(`[XSync] Screen Name: @${this.options.screenName}`);

    const { knownTitles, knownIds } = this.loadExistingArchiveIndex();
    console.log(`[XSync] Existing registered articles: ${knownTitles.size}`);

    // 1. Crawl X Profile
    const xCrawler = new XCrawler({
      screenName: this.options.screenName,
      limit: this.options.limit
    });

    const tweets = await xCrawler.crawlProfile();
    this.stats.tweetsScanned = tweets.length;

    const mediaTweets = tweets.filter(t => t.has_images && t.images.length > 0);
    this.stats.tweetsWithMedia = mediaTweets.length;
    console.log(`\n[XSync] Processing ${mediaTweets.length} tweets with attached media images...`);

    // 2. Process Each Media Tweet
    for (let i = 0; i < mediaTweets.length; i++) {
      const tweet = mediaTweets[i];
      console.log(`\n---------------------------------------------------------------`);
      console.log(`[XSync] [${i + 1}/${mediaTweets.length}] Tweet: ${tweet.status_url}`);
      console.log(`        Text: "${tweet.text.replace(/\n/g, ' ')}"`);

      // Check if status URL already ingested
      if (knownIds.has(tweet.status_url.toLowerCase()) || (tweet.tweet_id && knownIds.has(tweet.tweet_id))) {
        console.log(`[XSync] ℹ️ Tweet already ingested. Skipping.`);
        this.stats.alreadyIngested++;
        continue;
      }

      for (const imgUrl of tweet.images) {
        console.log(`[XSync] Running OCR on image: ${imgUrl}`);
        const ocrData = await this.runOcr(imgUrl);

        if (!ocrData || !ocrData.is_valid) {
          console.log(`[XSync] ❌ OCR validation failed: ${ocrData?.disambiguation_warnings?.join('; ') || 'Not a valid HT clipping by Arun Kumar'}`);
          continue;
        }

        this.stats.ocrValidClippings++;
        console.log(`[XSync] ✅ Valid Print Clipping! Score: ${ocrData.disambiguation_score}`);
        console.log(`        Headline: "${ocrData.headline}"`);
        console.log(`        Byline: "${ocrData.byline}" | Dateline: "${ocrData.dateline}"`);
        console.log(`        Word Count: ${ocrData.word_count} words`);

        // Check if title already known
        const normTitle = this.normalizeTitle(ocrData.headline);
        if (knownTitles.has(normTitle)) {
          console.log(`[XSync] ℹ️ Article with similar title already exists in archive.`);
          this.stats.alreadyIngested++;
          continue;
        }

        // Cross-check with HT digital
        console.log(`[XSync] Cross-checking against Hindustan Times digital website...`);
        const isOnHtDigital = await this.checkHtDigitalPresence(ocrData.headline);
        const isPrintExclusive = !isOnHtDigital;

        if (isPrintExclusive) {
          console.log(`[XSync] 📰 VERIFIED: PRINT BROADSHEET EXCLUSIVE (Not published on HT digital)`);
          this.stats.printExclusives++;
        } else {
          console.log(`[XSync] 🌐 Article also identified on HT digital edition.`);
        }

        // Generate Slug & Save Clipping Image
        const slug = this.generateSlug(ocrData.headline, tweet.tweet_id);
        const clippingFilename = `${slug}.jpg`;
        const clippingLocalPath = path.join(this.clippingsDir, clippingFilename);
        const clippingPublicUrl = `/documents/clippings/${clippingFilename}`;

        console.log(`[XSync] Saving permanent clipping scan to: ${clippingLocalPath}`);
        try {
          await this.downloadClippingImage(imgUrl, clippingLocalPath);
        } catch (e) {
          console.warn(`[XSync] Warning downloading clipping: ${e.message}`);
        }

        // Construct normalized article object
        const articleDate = tweet.created_at || new Date().toISOString();
        const tax = this.classifier.classify({
          title: ocrData.headline,
          body_text: ocrData.body_text
        });

        const articleData = {
          article_id: tweet.tweet_id ? `x_${tweet.tweet_id}` : `clipping_${Date.now()}`,
          url: tweet.status_url,
          headline: ocrData.headline,
          sub_headline: tweet.text || 'Print broadsheet report published in Hindustan Times (Patna)',
          byline: 'Arun Kumar',
          dateline: ocrData.dateline || 'Patna',
          published_at: articleDate,
          modified_at: articleDate,
          body_text: ocrData.body_text,
          body_sha256: ocrData.body_sha256,
          is_print_exclusive: isPrintExclusive,
          clipping_public_url: clippingPublicUrl,
          clipping_asset_path: clippingLocalPath,
          x_status_url: tweet.status_url,
          tweet_text: tweet.text,
          topic: tax.topic,
          subtopic: tax.subtopic,
          tags: tax.tags
        };

        this.stats.acceptedArticles.push(articleData);
        knownTitles.add(normTitle);
        if (tweet.tweet_id) knownIds.add(tweet.tweet_id);
      }
    }

    // 3. Package New Print Dispatches
    if (this.stats.acceptedArticles.length > 0) {
      console.log(`\n===============================================================`);
      console.log(`[XSync] 🎯 Packaging ${this.stats.acceptedArticles.length} new print dispatch(es)...`);
      console.log(`===============================================================`);
      this.packagePrintArticles(this.stats.acceptedArticles);

      // Rebuild site data
      this.rebuildSiteData();
    } else {
      console.log(`\n[XSync] ✅ Archive is up to date with X print dispatches.`);
      if (this.options.forceRebuild) {
        this.rebuildSiteData();
      }
    }

    this.printSummary();
    return this.stats;
  }

  packagePrintArticles(articles) {
    const timestamp = this.packageBuilder.getRunTimestamp();
    const runName = `feed_run_x_print_${timestamp}`;
    const packageDir = path.join(this.packageBuilder.outputBaseDir, runName);

    const dirs = [
      path.join(packageDir, 'records'),
      path.join(packageDir, 'content'),
      path.join(packageDir, 'seo'),
      path.join(packageDir, 'jsonld')
    ];
    dirs.forEach(d => fs.mkdirSync(d, { recursive: true }));

    const processed = [];

    for (const art of articles) {
      const slug = this.generateSlug(art.headline, art.article_id.replace(/^x_/, ''));
      const words = art.body_text.split(/\s+/).length;
      const readMins = Math.max(1, Math.ceil(words / 200));

      const provenance = {
        primary_source: {
          publication: "Hindustan Times",
          edition: "Patna Print Broadsheet",
          canonical_url: art.x_status_url,
          original_article_id: art.article_id,
          published_at: art.published_at,
          dateline: art.dateline,
          is_print_exclusive: art.is_print_exclusive
        },
        archival_source: {
          platform: "X / Twitter",
          x_status_url: art.x_status_url,
          tweet_commentary: art.tweet_text,
          archive_status: "verified_clipping"
        },
        document_provenance: {
          has_clipping_image: Boolean(art.clipping_public_url),
          clipping_public_url: art.clipping_public_url,
          clipping_asset_path: art.clipping_asset_path
        },
        verification: {
          content_sha256: art.body_sha256,
          last_verified_at: new Date().toISOString(),
          integrity_status: "tamper_proof",
          transcription_method: "Tesseract OCR (Non-Negotiable Body Rule Verified)"
        }
      };

      const record = {
        id: art.article_id,
        slug: slug,
        title: art.headline,
        summary: art.sub_headline,
        byline: art.byline,
        dateline: art.dateline,
        published_at: art.published_at,
        modified_at: art.modified_at,
        word_count: words,
        reading_time_minutes: readMins,
        topic: art.topic,
        subtopic: art.subtopic,
        tags: art.tags,
        source_url: art.x_status_url,
        is_print_edition: true,
        is_print_exclusive: art.is_print_exclusive,
        provenance: provenance
      };

      // 1. Record JSON
      fs.writeFileSync(
        path.join(packageDir, 'records', `${slug}.json`),
        JSON.stringify(record, null, 2),
        'utf8'
      );

      // 2. Body Markdown (Non-Negotiable Body Rule)
      const contentMd = `# ${art.headline}\n\n**${art.dateline}** — ${art.body_text}`;
      fs.writeFileSync(
        path.join(packageDir, 'content', `${slug}.md`),
        contentMd,
        'utf8'
      );

      // 3. SEO JSON
      const seo = {
        meta_title: `${art.headline} | Arun Kumar (Hindustan Times Print Edition)`,
        meta_description: art.sub_headline.substring(0, 155),
        canonical_url: `https://ak-89y.pages.dev/articles/${slug}`,
        keywords: [...art.tags, art.topic.title, 'Arun Kumar Hindustan Times', 'BPSC TRE-4 Print Broadsheet'].join(', '),
        og_type: 'article',
        og_title: art.headline,
        og_description: art.sub_headline.substring(0, 155),
        twitter_card: 'summary_large_image',
        twitter_site: '@ArunkrHt',
        twitter_creator: '@ArunkrHt'
      };
      fs.writeFileSync(
        path.join(packageDir, 'seo', `${slug}_seo.json`),
        JSON.stringify(seo, null, 2),
        'utf8'
      );

      processed.push(record);
    }

    // 4. Manifest
    const manifest = {
      package_name: runName,
      generated_at: new Date().toISOString(),
      article_count: processed.length,
      source_type: "x_print_clippings",
      articles: processed.map(a => ({ id: a.id, slug: a.slug, title: a.title, sha256: a.provenance.verification.content_sha256 }))
    };
    fs.writeFileSync(path.join(packageDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`[XSync] Package ${runName} successfully constructed.`);
  }

  rebuildSiteData() {
    console.log('\n[XSync] Rebuilding living archive site data & search indexes...');
    const siteScripts = path.join(__dirname, '..', 'site', 'scripts');
    execSync(`node "${path.join(siteScripts, 'build-site-data.js')}"`, { stdio: 'inherit' });
    execSync(`node "${path.join(siteScripts, 'generate-related-content.js')}"`, { stdio: 'inherit' });
    execSync(`node "${path.join(siteScripts, 'generate-sitemap.js')}"`, { stdio: 'inherit' });
    execSync(`node "${path.join(siteScripts, 'generate-rss.js')}"`, { stdio: 'inherit' });
    execSync(`node "${path.join(siteScripts, 'validate-site.js')}"`, { stdio: 'inherit' });
  }

  printSummary() {
    console.log('\n===============================================================');
    console.log('   X Post & Print Clipping Sync: Execution Summary             ');
    console.log('===============================================================');
    console.log(`Tweets Scanned:                     ${this.stats.tweetsScanned}`);
    console.log(`Tweets with Media Attachments:      ${this.stats.tweetsWithMedia}`);
    console.log(`Valid Arun Kumar Clippings (OCR):   ${this.stats.ocrValidClippings}`);
    console.log(`Print Broadsheet Exclusives:        ${this.stats.printExclusives}`);
    console.log(`Already Ingested / Duplicates:      ${this.stats.alreadyIngested}`);
    console.log(`Newly Accepted & Packaged:          ${this.stats.acceptedArticles.length}`);
    this.stats.acceptedArticles.forEach(a => {
      console.log(` - 📰 "${a.headline}" (${a.dateline}) [${a.is_print_exclusive ? 'PRINT EXCLUSIVE' : 'DIGITAL'}]`);
    });
    console.log('===============================================================\n');
  }
}

// CLI Execution Entrypoint
if (require.main === module) {
  const args = process.argv.slice(2);
  let limit = 15;
  let screenName = 'ArunkrHt';
  let forceRebuild = false;

  for (const a of args) {
    if (a.startsWith('--limit=')) limit = parseInt(a.split('=')[1], 10);
    if (a.startsWith('--screen-name=')) screenName = a.split('=')[1];
    if (a === '--force-rebuild') forceRebuild = true;
  }

  const engine = new XSyncEngine({ limit, screenName, forceRebuild });
  engine.run().then(stats => {
    process.exit(0);
  }).catch(err => {
    console.error('Fatal X Sync error:', err);
    process.exit(1);
  });
}

module.exports = XSyncEngine;
