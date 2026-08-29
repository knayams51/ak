# Phase-Wise Execution Plan: Arun Kumar Journalistic Archive & Author Website

---

## 1. Plan Overview & Governance Principles

This document outlines the systematic, phased execution plan for building the complete digital archive and author website for **Arun Kumar** (Senior Assistant Editor, *Hindustan Times* Patna Bureau).

### Governance Rules:
1. **Local Git Saves at Every Milestone**: Every phase ends with a dedicated local Git staging and commit to maintain strict versioning and rollback capability.
2. **Checks & Balances Gates**: Automated verification scripts must achieve a 100% pass rate before advancing between phases.
3. **Pilot Validation First**: The crawler, normalizer, and SSG pipeline will be verified on a pilot cohort of 10-15 articles before running large-scale historical harvesting.
4. **Non-Negotiable Editorial Fidelity**: Article bodies are preserved with character-level accuracy; zero paraphrasing or hallucination.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               PHASE EXECUTION ROADMAP                                  │
└────────────────────────────────────────────────────────────────────────────────────────┘

  [Phase 0: Workspace & Git Init]
                │
                ▼
  [Phase 1: Social Profiles, Author Schema & Identity Configuration]
                │
                ▼
  [Phase 2: Stealth Crawler & Disambiguation Engine Implementation]
                │
                ▼
  [Phase 3: Pilot Crawl Validation & Quality Gate 1] ─── (Checks & Balances)
                │
                ▼
  [Phase 4: Normalization, Extraction & Packaging Pipeline]
                │
                ▼
  [Phase 5: Archival Provenance & Wayback Integration]
                │
                ▼
  [Phase 6: Astro SSG Website Construction (Adapted from website_assembler)]
                │
                ▼
  [Phase 7: End-to-End Pilot Ingestion & Quality Gate 2] ─── (Checks & Balances)
                │
                ▼
  [Phase 8: Full-Scale Harvesting, Build & Production Rollout]
```

---

## 2. Phase-by-Phase Execution Breakdown

### Phase 0: Workspace & Git Staging Initialization
* **Objective**: Set up clean directory structure, package manifests, and local Git repository tracking.
* **Key Tasks**:
  1. Initialize local Git repository in `c:\Users\Mayank Shekhar\Downloads\Arun_Kumar`.
  2. Create comprehensive `.gitignore` (ignoring `node_modules`, browser user data, OS cache, while tracking code, schemas, manifests, and configs).
  3. Scaffold subsystem directories:
     - `crawler/` (Crawling engine, browser pooling, SQLite queue)
     - `pipeline/` (Normalization, taxonomy classification, packaging)
     - `site/` (Astro static site generator)
     - `reports/` (Audit logs, crawl summaries, QA reports)
* **Checks & Balances**: Verify Git repository status, initial commit clean working tree.
* **Git Milestone**: `git commit -m "Milestone 0: Initial repository scaffolding & project structure"`

---

### Phase 1: Social Profiles, Author Schema & Identity Configuration
* **Objective**: Establish Arun Kumar's digital identity configuration, verified social links, and the Bihar Journalistic Beat Taxonomy.
* **Key Tasks**:
  1. Create `site/src/config/author.config.json`:
     - Full Name: Arun Kumar
     - Title: Senior Assistant Editor / Associate Editor
     - Bureau: Patna, Bihar (Hindustan Times)
     - Verified X (Twitter): `https://x.com/ArunkrHt` (`@ArunkrHt`)
     - Hindustan Times Author Profile: `https://www.hindustantimes.com/authors/arun-kumar`
     - Muck Rack Profile: `https://muckrack.com/arun-kumar-1`
     - Extensible Facebook / LinkedIn / Email hooks
     - Awards: K.C. Kulish Journalism Award (2014), Keshav Bhatt Journalism Award, LDM Fellowship
     - Experience: 25+ years covering Bihar politics, judiciary, higher education & governance
  2. Create `site/src/config/taxonomy.config.json` containing the 5 major Bihar journalistic beats and subtopics.
  3. Create Schema.org `Person` definition template for JSON-LD structured data.
* **Checks & Balances**: JSON syntax validation and schema integrity check.
* **Git Milestone**: `git commit -m "Milestone 1: Author profile schema, social media handles & taxonomy configuration"`

---

### Phase 2: Stealth Crawler Engine Implementation (`crawler/`)
* **Objective**: Build the robust Hindustan Times crawler adapted from `esic_crawler` architecture.
* **Key Tasks**:
  1. Set up `crawler/package.json` with dependencies (`puppeteer-extra`, `puppeteer-extra-plugin-stealth`, `better-sqlite3`, `cheerio`, `axios`).
  2. Implement `queue-manager.js`: SQLite WAL request queue with states (`pending`, `processing`, `completed`, `failed`), atomic claim locks, retry tracking, and deduplication.
  3. Implement `browser-manager.js`: Stealth Puppeteer Chromium pool with memory recycling and resource blocking (ignoring images, stylesheets, media to optimize speed).
  4. Implement `discovery.js`: Traversal of HT author pages (`/authors/arun-kumar`) and section feeds (`/cities/patna-news`, `/education`).
  5. Implement `author-filter.js`: Multi-level author disambiguation engine:
     - Byline match: `"Arun Kumar"`
     - Dateline / Bureau match: `"Patna"`, `"PATNA:"`, `"Patna Bureau"`
     - Heuristic negative match: Ignore articles by namesake authors located in Delhi, Mumbai, Lucknow without Bihar datelines.
  6. Implement `extractor.js`: Structured extraction of headlines, sub-headlines, publication timestamps, dateline, JSON-LD newsArticle schema, and pure paragraph text.
* **Checks & Balances**: Unit tests for disambiguation filter using sample mock payloads from HT Patna and HT Delhi.
* **Git Milestone**: `git commit -m "Milestone 2: Stealth crawler engine, SQLite WAL queue & author disambiguation filter"`

---

### Phase 3: Pilot Crawl Validation (Checks & Balances Gate 1)
* **Objective**: Run live crawler on a bounded pilot cohort (10-15 articles) to validate stealth scraping and extraction accuracy.
* **Key Tasks**:
  1. Run `node crawler/pilot.js --limit=15`.
  2. Inspect crawl logs, SQLite queue states, and generated `data/crawled_articles.jsonl`.
  3. Validate author disambiguation: Ensure 100% of crawled articles are authored by Arun Kumar (Patna).
  4. Generate `reports/pilot_crawl_report.md`.
* **Checks & Balances**: Zero false positives in byline/dateline attribution; zero CAPTCHA/WAF blocks.
* **Git Milestone**: `git commit -m "Milestone 3: Pilot crawl successful with 15 validated articles & QA report"`

---

### Phase 4: Normalization & Packaging Pipeline (`pipeline/`)
* **Objective**: Transform raw crawled articles into standardized `website_assembler`-compliant feed packages (`feed_run_YYYYMMDD_HHMM/`).
* **Key Tasks**:
  1. Implement `normalizer.js`:
     - Clean text artifacts, ads, and tracking snippets.
     - Preserve full article paragraphs, quotes, and datelines without any rewriting (*Non-Negotiable Body Rule*).
  2. Implement `taxonomy-classifier.js`:
     - Auto-classify articles into one of the 5 canonical Bihar beats and subtopics based on keyword patterns, entities, and sectional tags.
  3. Implement `package-builder.js`:
     - Generate isolated `feed_run_YYYYMMDD_HHMM/` packages conforming to the specification:
       - `manifest.json`
       - `records/article.json`
       - `content/article.md`
       - `seo/article_seo.json`
       - `jsonld/article.json`
       - `qa_report.md`
* **Checks & Balances**: Execute character-level roundtrip check ensuring `article.md` perfectly matches raw source text.
* **Git Milestone**: `git commit -m "Milestone 4: Article normalization, taxonomy classifier & package generator"`

---

### Phase 5: Archival Provenance & Wayback Integration (`pipeline/`)
* **Objective**: Guarantee long-term preservation and tamper-proofing of all crawled articles.
* **Key Tasks**:
  1. Implement `wayback-archiver.mjs`:
     - Query Wayback Machine CDX API for existing snapshots.
     - Submit live HT URLs to Internet Archive Save Page Now API (`https://web.archive.org/save/...`).
     - Record immutable Wayback snapshot URLs and timestamps.
  2. Implement Content Integrity Hasher:
     - Compute SHA-256 hash of article body content.
  3. Create Provenance schema with primary HT live link, secondary Wayback archive link, and tertiary newspaper clipping PDF resolver.
* **Checks & Balances**: Verify live HTTP 200/302 response for Wayback snapshots and cryptographic hash consistency.
* **Git Milestone**: `git commit -m "Milestone 5: Wayback Machine auto-archiver & SHA-256 provenance integrity system"`

---

### Phase 6: Astro SSG Website Construction (`site/`)
* **Objective**: Build the fast, responsive, SEO-optimized static website adapted from `website_assembler`.
* **Key Tasks**:
  1. Set up `site/package.json` (Astro, Tailwind CSS/custom styles, Lucide icons).
  2. Implement Layouts:
     - `BaseLayout.astro`: Common head, OpenGraph, Twitter Cards, navigation, footer.
     - `ArticleLayout.astro`: Journalistic reading layout with social share and provenance bar.
     - `TopicLayout.astro` & `ArchiveLayout.astro`: Beat and timeline navigation.
  3. Implement Components:
     - `Header.astro` & `Footer.astro`: Navigation and Global Social Connect Bar (@ArunkrHt, Muck Rack, HT, RSS).
     - `ProvenanceBar.astro`: Live HT badge, Wayback verified snapshot link, SHA-256 verification, and PDF clipping toggle.
     - `SocialConnect.astro` & `SocialShareModal.astro`: Multi-channel social sharing and author follow widgets.
     - `ArticleCard.astro` & `TaxonomyBadge.astro`: Beat badges and article cards.
     - `TimelineFilter.astro`: Decadal and annual timeline filtering.
     - `RelatedArticles.astro`: Graph-based contextual recommendations.
  4. Implement Pages:
     - `index.astro`: Featured investigations, latest dispatches, beat overviews.
     - `about.astro`: Comprehensive biographical profile, 25+ years Bihar journalism career, awards (K.C. Kulish, Keshav Bhatt), fellowships, and social channels.
     - `archive.astro`: Year/month chronological archive.
     - `articles/[slug].astro`: Full article reader.
     - `topics/[topic]/[subtopic].astro`: Topic-specific deep-dive archives.
     - `search.astro`: Instant client-side search interface.
     - `methodology.astro`: Archival integrity manifesto & provenance explanation.
  5. Implement Build & QA Scripts (`site/scripts/`):
     - `build-site-data.js`: Ingestion adapter loading `feed_run_*` packages into Astro content models.
     - `generate-related-content.js`: Inverted entity & tag index for contextual related articles.
     - `generate-sitemap.js` & `generate-rss.js`: Dynamic XML sitemap and RSS 2.0 feeds.
     - Validation suite: `validate-articles.js`, `validate-provenance.js`, `validate-slugs.js`, `validate-images.js`.
* **Checks & Balances**: `npm run build` compiles 100% static HTML without hydration errors.
* **Git Milestone**: `git commit -m "Milestone 6: Complete Astro SSG frontend, UI components, social widgets & build pipeline"`

---

### Phase 7: End-to-End Pilot Ingestion & Verification Gates (Checks & Balances Gate 2)
* **Objective**: Ingest pilot articles, run the full validation suite, and test search, provenance, and UI rendering.
* **Key Tasks**:
  1. Transfer pilot `feed_run_*` package to `site/input/Periodic_Article_update/`.
  2. Execute `npm run build:data` to compile site data and search index.
  3. Execute `npm run validate` to run all integrity, provenance, and slug checks.
  4. Execute `npm run build` to generate static production assets.
  5. Test local preview server (`npm run preview`) to verify responsive design, dark/light modes, social links, and search.
  6. Generate `reports/pilot_validation_summary.md`.
* **Checks & Balances**: 0 validation errors, 0 broken links, search index fully populated.
* **Git Milestone**: `git commit -m "Milestone 7: End-to-end pilot ingestion verified with full QA validation pass"`

---

### Phase 8: Full-Scale Harvesting, Archiving & Production Readiness
* **Objective**: Execute deep crawl across Arun Kumar's historical archive, process batch updates, and finalize deployment-ready artifact.
* **Key Tasks**:
  1. Run production crawl across author archive and historical section feeds.
  2. Execute Wayback Machine archival queue for all newly crawled articles.
  3. Package articles into standard feed runs.
  4. Ingest, validate, and compile full static website.
  5. Generate final comprehensive QA and provenance report (`reports/final_qa_report.md`).
* **Checks & Balances**: Full audit report verifying total article count, 100% provenance resolution, zero duplicate slugs, and valid Schema.org graphs.
* **Git Milestone**: `git commit -m "Milestone 8: Full production harvest, archival verification & static build ready"`

---

## 3. Milestone & Verification Checklist Matrix

| Milestone | Phase | Key Deliverable | Verification Gate | Git Commit Tag |
|---|---|---|---|---|
| **M0** | Phase 0 | Directory Scaffolding & Git Init | Working tree clean, `.gitignore` active | `v0.1.0-scaffold` |
| **M1** | Phase 1 | Profile, Social & Taxonomy Config | JSON validation, schema integrity | `v0.2.0-config` |
| **M2** | Phase 2 | Stealth Crawler & Disambiguator | Disambiguation filter test pass | `v0.3.0-crawler` |
| **M3** | Phase 3 | Pilot Crawl (15 Articles) | Zero false bylines, valid JSONL | `v0.4.0-pilot-crawl` |
| **M4** | Phase 4 | Normalization & Packaging Engine | Zero-rewrite character roundtrip | `v0.5.0-pipeline` |
| **M5** | Phase 5 | Wayback Auto-Archiver & Hasher | SHA-256 check, live Wayback link | `v0.6.0-provenance` |
| **M6** | Phase 6 | Astro SSG Frontend & Social UI | Static compilation pass (`astro check`) | `v0.7.0-frontend` |
| **M7** | Phase 7 | Pilot Ingestion & Validation Suite | 100% QA pass on `validate:*` scripts | `v0.8.0-pilot-ingest` |
| **M8** | Phase 8 | Full Harvest, Build & Production | End-to-end static build & final report | `v1.0.0-release` |
