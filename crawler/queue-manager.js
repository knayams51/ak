const fs = require('fs');
const path = require('path');

class QueueManager {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.fallbackState = null;
    this.useFallback = false;
    this.init();
  }

  init() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    try {
      const Database = require('better-sqlite3');
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.createTables();
    } catch (err) {
      console.warn(`[QueueManager] better-sqlite3 not available or error: ${err.message}. Using JSON-backed queue.`);
      this.useFallback = true;
      this.fallbackPath = this.dbPath.replace('.db', '.json');
      this.loadFallback();
    }
  }

  createTables() {
    if (this.useFallback) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS request_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT UNIQUE NOT NULL,
        url_hash TEXT NOT NULL,
        source_type TEXT NOT NULL,
        priority INTEGER DEFAULT 10,
        status TEXT DEFAULT 'pending', -- pending, processing, completed, failed, filtered_out
        retry_count INTEGER DEFAULT 0,
        error_message TEXT,
        discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_queue_status_priority ON request_queue (status, priority DESC, id ASC);
      CREATE INDEX IF NOT EXISTS idx_queue_url ON request_queue (url);

      CREATE TABLE IF NOT EXISTS crawled_articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        article_id TEXT UNIQUE NOT NULL,
        url TEXT NOT NULL,
        headline TEXT NOT NULL,
        sub_headline TEXT,
        byline TEXT NOT NULL,
        dateline TEXT,
        published_at TEXT,
        modified_at TEXT,
        body_text TEXT NOT NULL,
        body_sha256 TEXT NOT NULL,
        jsonld_data TEXT,
        is_disambiguated INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  loadFallback() {
    if (fs.existsSync(this.fallbackPath)) {
      try {
        this.fallbackState = JSON.parse(fs.readFileSync(this.fallbackPath, 'utf8'));
      } catch (e) {
        this.fallbackState = { queue: [], articles: [] };
      }
    } else {
      this.fallbackState = { queue: [], articles: [] };
      this.saveFallback();
    }
  }

  saveFallback(immediate = false) {
    if (immediate) {
      if (this._saveTimeout) clearTimeout(this._saveTimeout);
      this._saveTimeout = null;
      try {
        fs.writeFileSync(this.fallbackPath, JSON.stringify(this.fallbackState, null, 2), 'utf8');
      } catch (e) {}
      return;
    }
    if (this._saveTimeout) return;
    this._saveTimeout = setTimeout(() => {
      this._saveTimeout = null;
      try {
        fs.writeFileSync(this.fallbackPath, JSON.stringify(this.fallbackState, null, 2), 'utf8');
      } catch (e) {}
    }, 400);
  }

  enqueue(url, sourceType = 'seed', priority = 10) {
    if (!url || typeof url !== 'string') return false;
    const cleanUrl = url.split('#')[0].trim();

    if (!this.useFallback) {
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(cleanUrl).digest('hex');
      try {
        const stmt = this.db.prepare(`
          INSERT INTO request_queue (url, url_hash, source_type, priority, status)
          VALUES (?, ?, ?, ?, 'pending')
          ON CONFLICT(url) DO UPDATE SET
            priority = MAX(request_queue.priority, excluded.priority)
        `);
        stmt.run(cleanUrl, hash, sourceType, priority);
        return true;
      } catch (err) {
        return false;
      }
    } else {
      const existing = this.fallbackState.queue.find(item => item.url === cleanUrl);
      if (!existing) {
        this.fallbackState.queue.push({
          id: this.fallbackState.queue.length + 1,
          url: cleanUrl,
          source_type: sourceType,
          priority: priority,
          status: 'pending',
          retry_count: 0,
          error_message: null,
          discovered_at: new Date().toISOString()
        });
        this.saveFallback();
        return true;
      }
      return false;
    }
  }

  enqueueBatch(urls, sourceType = 'seed', priority = 10) {
    let count = 0;
    for (const url of urls) {
      if (this.enqueue(url, sourceType, priority)) count++;
    }
    return count;
  }

  getNext(batchSize = 1) {
    if (!this.useFallback) {
      const stmt = this.db.prepare(`
        SELECT * FROM request_queue
        WHERE status = 'pending'
        ORDER BY priority DESC, id ASC
        LIMIT ?
      `);
      return stmt.all(batchSize);
    } else {
      return this.fallbackState.queue
        .filter(item => item.status === 'pending')
        .sort((a, b) => b.priority - a.priority || a.id - b.id)
        .slice(0, batchSize);
    }
  }

  markProcessing(id) {
    if (!this.useFallback) {
      const stmt = this.db.prepare(`
        UPDATE request_queue
        SET status = 'processing', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(id);
    } else {
      const item = this.fallbackState.queue.find(q => q.id === id);
      if (item) {
        item.status = 'processing';
        item.updated_at = new Date().toISOString();
        this.saveFallback();
      }
    }
  }

  markCompleted(id) {
    if (!this.useFallback) {
      const stmt = this.db.prepare(`
        UPDATE request_queue
        SET status = 'completed', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(id);
    } else {
      const item = this.fallbackState.queue.find(q => q.id === id);
      if (item) {
        item.status = 'completed';
        item.updated_at = new Date().toISOString();
        this.saveFallback();
      }
    }
  }

  markFilteredOut(id, reason) {
    if (!this.useFallback) {
      const stmt = this.db.prepare(`
        UPDATE request_queue
        SET status = 'filtered_out', error_message = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(reason, id);
    } else {
      const item = this.fallbackState.queue.find(q => q.id === id);
      if (item) {
        item.status = 'filtered_out';
        item.error_message = reason;
        item.updated_at = new Date().toISOString();
        this.saveFallback();
      }
    }
  }

  markFailed(id, errorMessage, maxRetries = 3) {
    if (!this.useFallback) {
      const stmt = this.db.prepare(`
        UPDATE request_queue
        SET status = CASE WHEN retry_count + 1 >= ? THEN 'failed' ELSE 'pending' END,
            retry_count = retry_count + 1,
            error_message = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(maxRetries, errorMessage, id);
    } else {
      const item = this.fallbackState.queue.find(q => q.id === id);
      if (item) {
        item.retry_count = (item.retry_count || 0) + 1;
        item.error_message = errorMessage;
        item.status = item.retry_count >= maxRetries ? 'failed' : 'pending';
        item.updated_at = new Date().toISOString();
        this.saveFallback();
      }
    }
  }

  saveArticle(article) {
    if (!this.useFallback) {
      const stmt = this.db.prepare(`
        INSERT INTO crawled_articles (
          article_id, url, headline, sub_headline, byline, dateline,
          published_at, modified_at, body_text, body_sha256, jsonld_data, is_disambiguated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(article_id) DO UPDATE SET
          headline = excluded.headline,
          body_text = excluded.body_text,
          body_sha256 = excluded.body_sha256
      `);
      stmt.run(
        article.article_id,
        article.url,
        article.headline,
        article.sub_headline || null,
        article.byline,
        article.dateline || null,
        article.published_at || null,
        article.modified_at || null,
        article.body_text,
        article.body_sha256,
        JSON.stringify(article.jsonld_data || {}),
        article.is_disambiguated ? 1 : 0
      );
    } else {
      const idx = this.fallbackState.articles.findIndex(a => a.article_id === article.article_id);
      if (idx >= 0) {
        this.fallbackState.articles[idx] = article;
      } else {
        this.fallbackState.articles.push(article);
      }
      this.saveFallback();
    }
  }

  getStats() {
    if (!this.useFallback) {
      const total = this.db.prepare(`SELECT count(*) as count FROM request_queue`).get().count;
      const pending = this.db.prepare(`SELECT count(*) as count FROM request_queue WHERE status = 'pending'`).get().count;
      const completed = this.db.prepare(`SELECT count(*) as count FROM request_queue WHERE status = 'completed'`).get().count;
      const failed = this.db.prepare(`SELECT count(*) as count FROM request_queue WHERE status = 'failed'`).get().count;
      const filtered = this.db.prepare(`SELECT count(*) as count FROM request_queue WHERE status = 'filtered_out'`).get().count;
      const articles = this.db.prepare(`SELECT count(*) as count FROM crawled_articles`).get().count;
      return { total, pending, completed, failed, filtered, articles };
    } else {
      const total = this.fallbackState.queue.length;
      const pending = this.fallbackState.queue.filter(q => q.status === 'pending').length;
      const completed = this.fallbackState.queue.filter(q => q.status === 'completed').length;
      const failed = this.fallbackState.queue.filter(q => q.status === 'failed').length;
      const filtered = this.fallbackState.queue.filter(q => q.status === 'filtered_out').length;
      const articles = this.fallbackState.articles.length;
      return { total, pending, completed, failed, filtered, articles };
    }
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = QueueManager;
