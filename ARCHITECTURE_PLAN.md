# Architecture Plan: Arun Kumar (Hindustan Times Patna) Journalistic Archive & Author Website

---

## 1. Executive Summary & Vision

This architectural plan defines the end-to-end design for building the official digital archive and personal journalism website for **Arun Kumar**, Senior Assistant Editor / Associate Editor at the *Hindustan Times* (Patna Bureau). 

Arun Kumar has documented over two and a half decades of Bihar's political history, higher education landscape, Patna High Court jurisprudence, state administrative governance, and social developments. As an authoritative journalist, recipient of the prestigious **K.C. Kulish Journalism Award** and the **Keshav Bhatt Journalism Award**, and an **LDM Fellow**, his body of work represents a primary historical record of contemporary Bihar.

To build this website, we combine the battle-tested, high-reliability engineering elements of two reference systems:
1. **The Distributed Crawler Engine (`esic_crawler`)**: Autonomous discovery, SQLite WAL transactional request queue, stealth browser automation, deep pagination, rate-limiting, and crash-safe streaming persistence.
2. **The Provenance-First Website Assembler (`website_assembler`)**: Strict editorial fidelity (the *Non-Negotiable Body Rule*), multi-tier taxonomy classification, cryptographic and archival provenance (Wayback Machine integration & PDF clipping support), rich Schema.org `NewsArticle` metadata, Astro static site generation (SSG), client-side search, social media integration, and automated QA verification.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   END-TO-END SYSTEM PIPELINE                                │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
  [ Hindustan Times / Web / Social Feeds ]
             │
             ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ 1. HARVESTING & DISCOVERY LAYER (Crawler-Adapted)               │
  │    • HT Author Feeds & Search CDX                               │
  │    • Section Archives (Cities/Patna, Education, Bihar Politics) │
  │    • Author Disambiguation & Byline Filter Engine               │
  │    • Social Presence Discovery (@ArunkrHt, Muck Rack, LinkedIn) │
  │    • SQLite WAL Queue + Puppeteer Stealth Pool                  │
  └────────────────────────────────┬────────────────────────────────┘
                                   │ Raw HTML / JSON-LD / Snapshots / Social Meta
                                   ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ 2. EXTRACTION, NORMALIZATION & PACKAGING LAYER                  │
  │    • Non-Negotiable Body Preservation (Zero Hallucination/Edit) │
  │    • Dateline, Byline & Publication Timestamp Normalization     │
  │    • Topic & Subtopic Taxonomy Classifier (Bihar Beat Structure)│
  │    • Social Metadata & Citation Cross-Linking                   │
  │    • Package Generator (`feed_run_YYYYMMDD_HHMM/` Contract)     │
  └────────────────────────────────┬────────────────────────────────┘
                                   │ Standardized Article Packages
                                   ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ 3. PROVENANCE & ARCHIVAL REGISTRY                               │
  │    • Live HT Canonical URLs & Article GUIDs                     │
  │    • Internet Archive Wayback Machine Auto-Archiver             │
  │    • Archival Newspaper Scan / PDF Provenance Resolver          │
  │    • Content Hash (SHA-256) & Audit Trail QA Reports            │
  └────────────────────────────────┬────────────────────────────────┘
                                   │ Verified Ingestion Stream
                                   ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ 4. ASTRO STATIC SITE GENERATOR (SSG) FRONTEND                   │
  │    • Author Bio, Editorial Milestones, Awards & Social Links    │
  │    • High-Fidelity Article Reader with Provenance Bar           │
  │    • Topic & Chronological Archive (Year/Month Explorer)        │
  │    • Client-Side Full-Text Search Index & Filter Engine         │
  │    • Social Share Cards, Author Social Links & Schema.org JSON  │
  └────────────────────────────────┬────────────────────────────────┘
                                   │ Pre-Build Validation
                                   ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ 5. GOVERNANCE & VALIDATION GATES (Pre-Commit / Pre-Build)       │
  │    • `validate:integrity` (Body hash & Unicode QA)              │
  │    • `validate:provenance` (URL & Wayback live check)           │
  │    • `validate:slugs` & `validate:metadata`                     │
  │    • Local Git Staging Gates at each Phase Milestone            │
  └─────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Architectural Pillars

| Pillar | Reference Source | Architectural Role |
|---|---|---|
| **1. Stealth & Resilient Harvester** | `esic_crawler` | Crawls `hindustantimes.com` author archives, handles dynamic DOM hydration, bypasses rate limits/WAF via stealth Chromium pool, manages job states in SQLite WAL. |
| **2. Author Disambiguation Engine** | New Architecture | Distinguishes Arun Kumar (Senior Assistant Editor, Patna Bureau) from other journalists with the same name across HT networks using dateline, byline, and topic heuristics. |
| **3. Non-Negotiable Editorial Fidelity** | `website_assembler` | Strict immutable article body policy: no paraphrasing, no AI rewrite, preserving authentic journalistic voice and paragraph structures. |
| **4. Dual-Tier Provenance System** | `website_assembler` | Every article maintains primary source links (live HT canonical link), secondary immutable archival links (Wayback Machine snapshot), and optional tertiary print evidence (PDF newspaper clippings). |
| **5. Social Footprint & Author Identity Integration** | `website_assembler` + New | Integrated profile linking with his verified X/Twitter handle (**@ArunkrHt**), Muck Rack portfolio, author feeds, social follow bars, and automated OpenGraph share card generation. |
| **6. Astro SSG Presentation** | `website_assembler` | Ultra-fast, zero-JS baseline static site generation, responsive journalistic typography, dark/light reading modes, instant search, and automated sitemaps/RSS. |

---

## 3. Social Media & Author Profile Architecture

To reflect Arun Kumar's extensive media footprint and enable rich social discovery on the web:

### 3.1 Verified Profiles & Handles
* **X (formerly Twitter)**: `https://x.com/ArunkrHt` (`@ArunkrHt`) — Active since 2014+, primary digital handle used for breaking Bihar political commentary, election updates, and editorial reporting.
* **Hindustan Times Author Page**: `https://www.hindustantimes.com/authors/arun-kumar` — Live canonical bylines feed.
* **Muck Rack Portfolio**: `https://muckrack.com/arun-kumar-1` — Verified journalist profile listing awards (K.C. Kulish Award, Keshav Bhatt Award, LDM Fellowship).
* **LinkedIn & Facebook Integrations**: Flexible social link configuration schema supporting verified profile addition and fallback syndication handles.

### 3.2 Social Integration Components in Astro
1. **Global Social Connect Bar (Header & Footer)**:
   - Direct icon links to X (@ArunkrHt), Muck Rack, HT Author Archive, RSS, and Email.
2. **Author Bio & Milestones Page (`/about`)**:
   - Comprehensive bio including his 25+ years tenure at Patna Bureau, awards, fellowships, and verified social contact channels.
3. **Article-Level Social Share System**:
   - One-click share buttons for X (with `@ArunkrHt` mention and custom hashtags), WhatsApp, Facebook, LinkedIn, and native Web Share API.
   - Dynamic OpenGraph & Twitter Card image generation for rich link previews.
4. **Social & Schema.org `Person` Graph**:
   - Structured JSON-LD linking author metadata:
     ```json
     {
       "@context": "https://schema.org",
       "@type": "Person",
       "name": "Arun Kumar",
       "jobTitle": "Senior Assistant Editor",
       "worksFor": {
         "@type": "NewsMediaOrganization",
         "name": "Hindustan Times",
         "location": "Patna, Bihar, India"
       },
       "sameAs": [
         "https://x.com/ArunkrHt",
         "https://muckrack.com/arun-kumar-1",
         "https://www.hindustantimes.com/authors/arun-kumar"
       ],
       "award": [
         "K.C. Kulish Journalism Award",
         "Keshav Bhatt Journalism Award"
       ]
     }
     ```

---

## 4. Detailed Component Architecture

### Component 1: Crawler & Discovery Engine (`ht_crawler`)

Adapted from `esic_crawler`, configured specifically for the Hindustan Times web architecture and archival APIs:

```
                  ┌─────────────────────────────────────┐
                  │          DISCOVERY WORKERS          │
                  └──────────────────┬──────────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
  [ HT Author Profile ]     [ HT Section Archives ]   [ Wayback CDX Index ]
  hindustantimes.com/author /cities/patna-news,        web.archive.org/cdx
  /arun-kumar               /education, /india-news   (Historical URLs 2000-2026)
           │                         │                         │
           └─────────────────────────┼─────────────────────────┘
                                     ▼
                    ┌─────────────────────────────────┐
                    │    SQLITE WAL REQUEST QUEUE     │
                    │   (Atomic lock, Retries, Dedup) │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │  STEALTH BROWSER / HTTP POOL    │
                    │   • Resource blocker (skip img) │
                    │   • Exponential backoff         │
                    │   • User-agent rotation         │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │  RAW EXTRACTION & DISAMBIGUATOR │
                    │   • Match Byline: "Arun Kumar"  │
                    │   • Match Dateline: "Patna"     │
                    │   • Extract JSON-LD / DOM body  │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                      data/crawled_articles.jsonl
```

#### Key Harvester Specifications:
1. **Multi-Vector URL Discovery**:
   - **Author Feed Traversal**: Dynamic pagination through HT author pages (`/author/arun-kumar`).
   - **Historical Wayback CDX Mining**: Querying the Internet Archive CDX API for historical `hindustantimes.com` URLs authored by Arun Kumar dating back to the 2000s.
   - **Sectional Deep Crawl**: Targeted crawling of Patna bureau categories (`/cities/patna-news`, `/education`, `/elections/bihar-assembly-elections`).
2. **Author Disambiguation Filter**:
   - *Byline Rule*: Matches `author.name === "Arun Kumar"` or `author: "Arun Kumar"` in embedded JSON-LD.
   - *Dateline / Bureau Rule*: Verifies dateline prefix (`Patna`, `PATNA:`, `Patna News`) or Patna Bureau context to prevent false positives from namesakes in Delhi/Mumbai.
3. **Resilience & Politeness**:
   - Request concurrency locked to 1-2 per host with 1500ms politeness delays.
   - Dynamic browser pooling with memory recycling (restarting Chromium instances every 50 requests).
   - Resource filtering (ignoring fonts, stylesheets, audio, heavy media) to maximize throughput and minimize bandwidth.

---

### Component 2: Normalization, Extraction & Packaging Pipeline

Converts raw scraped HTML/JSON payloads into standardized, immutable article packages adhering to the `website_assembler` specification.

```
                           Raw Crawl Stream (.jsonl)
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │    NORMALIZATION PIPELINE     │
                      └───────────────┬───────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
  [ Body Cleaner ]             [ Metadata Normalizer ]       [ Taxonomy Classifier ]
  • Strip scripts/ads/HTML     • Canonical ISO Datetime      • Major Heading Mapping
  • Preserve paragraph splits  • Headline & Sub-headline     • Subtopic Extraction
  • Retain dateline prefix     • Bureau & Byline tags        • Key Entities & Tags
        │                             │                             │
        └─────────────────────────────┼─────────────────────────────┘
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │      QA & INTEGRITY SCAN      │
                      │  • Character-level Unicode QA │
                      │  • SHA-256 Content Hashing    │
                      │  • Zero Paraphrase Audit      │
                      └───────────────┬───────────────┘
                                      │
                                      ▼
                    feed_run_YYYYMMDD_HHMM/ (Package Contract)
```

#### Package Structure Contract:
Each ingested article is packaged into an isolated, self-describing directory:
```text
input/Periodic_Article_update/feed_run_YYYYMMDD_HHMM/
├── manifest.json                # Status flags, counts, checksums, package metadata
├── qa_report.md                 # Unicode replacements, verification logs, warnings
├── records/
│   └── article.json             # Core metadata (id, title, slug, date, topic, source_url)
├── content/
│   └── article.md               # Pure, unmodified article body text
├── seo/
│   └── article_seo.json         # Meta title, meta description, keywords, OpenGraph
├── jsonld/
│   └── article.json             # Schema.org NewsArticle structured data
└── assets/
    ├── share/                   # OpenGraph social share card & generator prompt
    └── provenance/              # Optional archival scan/clipping PDF
```

---

### Component 3: Provenance & Archival Verification Subsystem

Preserving journalistic integrity requires uninterrupted chain-of-custody. Articles from mainstream news websites can be altered, paywalled, or deleted over time. The provenance subsystem ensures permanent preservation.

```
                                  Article Ingestion
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │          PROVENANCE ENGINE            │
                      └───────────────────┬───────────────────┘
                                          │
                  ┌───────────────────────┼───────────────────────┐
                  ▼                       ▼                       ▼
      [ Tier 1: Canonical Source ]  [ Tier 2: Wayback Archive ]  [ Tier 3: Print / PDF ]
      • Live Hindustan Times URL    • Instant Save-Page-Now      • High-res scan upload
      • Original Article GUID       • CDX Snapshot timestamp     • Local storage under
      • HTTP 200 Verification       • Permanent archive link     • `/documents/provenance/`
                  │                       │                       │
                  └───────────────────────┼───────────────────────┘
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │       PROVENANCE METADATA RECORD      │
                      │   • Full chain-of-custody object      │
                      │   • Cryptographic Hash (SHA-256)      │
                      │   • Verified badge in UI              │
                      └───────────────────────────────────────┘
```

#### Provenance Data Schema:
```json
{
  "provenance": {
    "primary_source": {
      "publication": "Hindustan Times",
      "edition": "Patna / National",
      "canonical_url": "https://www.hindustantimes.com/cities/patna-news/article-slug-101614674390.html",
      "original_article_id": "101614674390",
      "published_at": "2026-06-30T14:30:00+05:30",
      "dateline": "Patna"
    },
    "archival_source": {
      "wayback_url": "https://web.archive.org/web/20260630150000/https://www.hindustantimes.com/cities/patna-news/article-slug-101614674390.html",
      "wayback_timestamp": "20260630150000",
      "archive_status": "verified_live"
    },
    "document_provenance": {
      "has_pdf_scan": false,
      "pdf_asset_path": null,
      "pdf_public_url": null
    },
    "verification": {
      "content_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "last_verified_at": "2026-08-29T15:00:00Z",
      "integrity_status": "tamper_proof"
    }
  }
}
```

---

### Component 4: Topic & Editorial Beat Taxonomy

To organize Arun Kumar's extensive journalism into a clear, navigable structure, we establish a specialized **Bihar Journalism Taxonomy** tailored to his coverage:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                CANONICAL TAXONOMY HIERARCHY                            │
└────────────────────────────────────────────────────────────────────────────────────────┘

1. Politics, Elections & Coalition Governance
   ├── Assembly Elections & Bypolls (BPSC, Bankipur, Regional seats)
   ├── Coalition Dynamics (JD(U), RJD, BJP, Congress, Mahagathbandhan)
   ├── Assembly Proceedings & Cabinet Decisions
   └── Political Leadership Profiles & Interviews

2. Higher Education & University Reforms
   ├── Bihar State University Reforms & Legislative Acts
   ├── Assistant Professor Appointments & BPSC Recruitment Controversies
   ├── Patna University Centenary & Academic Development
   └── Teacher Recruitment Exams (TRE) & Candidate Protests

3. Judiciary, Law & Patna High Court
   ├── Patna High Court Landmark Directives & Suo Motu PILs
   ├── Administrative Accountability & Civil Rights Rulings
   ├── Legal Controversies, Advocate General Decisions & Bar Affairs
   └── Transparency in Law Enforcement & Vehicle/Property Seizures

4. State Administration, Vigilance & Governance
   ├── Special Vigilance Unit (SVU) & Anti-Corruption Inquiries
   ├── Bureaucratic Appointments, Transfers & IAS/IPS Administrative Policy
   ├── Mid-Day Meal Scheme Monitoring & School Infrastructure
   └── Infrastructure, Bridges & Public Works Governance

5. Social Issues, Health & Culture
   ├── Public Health Infrastructure (PMCH, NMCH, AIIMS Patna)
   ├── Rural Development & Panchayati Raj Governance
   ├── Floods, Disaster Management & Ganga Water Projects
   └── Heritage, History & Cultural Life of Patna/Bihar
```

---

### Component 5: Astro SSG Frontend Architecture

The public-facing website is built using **Astro**, delivering near-zero JavaScript overhead, instant page loads, and top SEO ranking.

```
                              src/ (Astro Web Architecture)
                                             │
      ┌──────────────────────────────────────┼──────────────────────────────────────┐
      ▼                                      ▼                                      ▼
  [ Layouts & Base ]                    [ Pages & Routes ]                   [ UI Components ]
  • BaseLayout.astro                    • index.astro (Featured / Latest)     • ArticleCard.astro
  • ArticleLayout.astro                 • about.astro (Biography & Beat)      • ProvenanceBar.astro
  • TopicLayout.astro                   • archive.astro (Timeline Browser)    • SocialConnect.astro
  • ArchiveLayout.astro                 • search.astro (Instant Search)       • TaxonomyBadge.astro
                                        • methodology.astro (Integrity)       • TimelineFilter.astro
                                        • articles/[slug].astro               • RelatedArticles.astro
                                        • topics/[topic]/[subtopic].astro     • SocialShareModal.astro
                                        • search-modal.astro
```

---

### Component 6: Governance, Build Pipeline & Quality Gates

The system includes pre-build and CI/CD validation gates to ensure that errors or incomplete metadata cannot enter production:

```
[ New Package / Update ] ──▶ [ Phase 0: Validation Gates ] ──▶ [ Phase 1: Build Data ] ──▶ [ Phase 2: Astro Build ] ──▶ [ Deploy ]
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      ▼                            ▼                            ▼
 `validate:integrity`      `validate:provenance`        `validate:slugs & data`
 (Body text hash check,    (Wayback & HT link check,    (Duplicate slug check,
  Zero unauthorized edit)   PDF path validation)         Schema consistency)
```

#### Automated Script Matrix:
- `npm run crawl:ht`: Runs the targeted Hindustan Times crawler for Arun Kumar's byline.
- `npm run package:normalize`: Processes crawled raw articles into `feed_run_*` packages.
- `npm run provenance:archive`: Dispatches unarchived URLs to the Wayback Machine Save Page Now API.
- `npm run validate`: Runs the full verification suite (`validate:articles`, `validate:provenance`, `validate:slugs`, `validate:images`).
- `npm run build`: Executes data compilation (`build-site-data.js`, `generate-related-content.js`, `generate-sitemap.js`, `generate-rss.js`) followed by Astro static compilation.

---

## 5. Directory & Project Organization

The repository is organized into cleanly decoupled modules:

```text
Arun_Kumar/
├── ARCHITECTURE_PLAN.md               # This architectural specification document
├── crawler/                           # Subsystem 1: Stealth Crawler Engine
│   ├── package.json                   # Crawler dependencies (puppeteer-extra, better-sqlite3, etc.)
│   ├── config.js                      # HT crawler tunables (delays, headers, selectors)
│   ├── browser-manager.js             # Puppeteer pool with stealth plugin
│   ├── queue-manager.js               # SQLite WAL request queue
│   ├── discovery.js                   # Author feed, section & CDX discovery
│   ├── author-filter.js               # Arun Kumar Patna byline & dateline disambiguation
│   ├── extractor.js                   # DOM & JSON-LD parser
│   └── data/                          # Operational database & raw JSONL streams
├── pipeline/                          # Subsystem 2: Normalization & Packaging
│   ├── normalizer.js                  # Body extraction & formatting without rewriting
│   ├── taxonomy-classifier.js         # Beat & topic tagging
│   ├── package-builder.js             # Generates feed_run_* packages
│   └── wayback-archiver.mjs           # Wayback Machine API archiver
├── site/                              # Subsystem 3: Astro Website (website_assembler-based)
│   ├── astro.config.mjs
│   ├── package.json
│   ├── input/
│   │   └── Periodic_Article_update/   # Dropped feed_run_* article packages
│   ├── public/
│   │   ├── documents/provenance/      # Archival newspaper scans / PDFs
│   │   ├── images/articles/           # Share cards and article images
│   │   └── search-index.json          # Compiled search index
│   ├── scripts/
│   │   ├── build-site-data.js         # Ingestion adapter & data compiler
│   │   ├── generate-related-content.js# Topic graph & related articles generator
│   │   ├── generate-sitemap.js        # Dynamic XML sitemap generator
│   │   ├── generate-rss.js            # RSS feed generator
│   │   └── validate-*.js              # Multi-tier QA test suites
│   └── src/
│       ├── components/                # Modular UI components (incl. SocialConnect, ProvenanceBar)
│       ├── config/                    # Taxonomy, author profile & social links config
│       ├── layouts/                   # Article, Topic, and Base layouts
│       ├── pages/                     # Astro route endpoints
│       └── styles/                    # Journalistic CSS & typography
└── reports/                           # Subsystem 4: QA, Crawl & Provenance Reports
    ├── crawl_summary.json
    ├── disambiguation_log.md
    ├── provenance_audit.json
    └── qa_validation_report.md
```

---

## 6. Git Staging & Phase-Wise Governance Strategy

Every phase of execution follows atomic Git commits and staging validation:
1. **Milestone Baseline Commits**: Clean commit after infrastructure setup, crawler pilot, normalization engine, and website integration.
2. **Pre-Commit Checks**: Verification scripts must pass with 0 errors before each milestone tag.
3. **Rollout Gates**: Incremental pilot validation (5-10 articles) before running deep backfill crawls (hundreds of historical articles).
