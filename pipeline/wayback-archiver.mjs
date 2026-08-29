import axios from 'axios';

/**
 * Wayback Machine Archival & Provenance Engine
 */
export class WaybackArchiver {
  constructor() {
    this.cdxApi = 'https://web.archive.org/cdx/search/cdx';
    this.saveApi = 'https://web.archive.org/save/';
  }

  /**
   * Check if URL is already preserved on Wayback Machine
   */
  async checkExistingSnapshot(url) {
    try {
      const response = await axios.get(this.cdxApi, {
        params: {
          url: url,
          output: 'json',
          fl: 'timestamp,original,statuscode,digest',
          filter: 'statuscode:200',
          limit: 1
        },
        timeout: 10000
      });

      if (response.data && response.data.length > 1) {
        const row = response.data[1];
        const timestamp = row[0];
        return {
          exists: true,
          timestamp: timestamp,
          wayback_url: `https://web.archive.org/web/${timestamp}/${url}`,
          status: 'verified_live'
        };
      }
    } catch (err) {
      console.warn(`[WaybackArchiver] CDX lookup error for ${url}: ${err.message}`);
    }

    return {
      exists: false,
      timestamp: null,
      wayback_url: `https://web.archive.org/web/*/${url}`,
      status: 'pending_snapshot'
    };
  }

  /**
   * Request Save Page Now on Wayback Machine
   */
  async savePageNow(url) {
    try {
      const saveUrl = `${this.saveApi}${url}`;
      console.log(`[WaybackArchiver] Dispatching Save Page Now request: ${saveUrl}`);
      const response = await axios.get(saveUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
        },
        timeout: 15000,
        validateStatus: () => true
      });

      return {
        submitted: true,
        httpStatus: response.status,
        timestamp: new Date().toISOString().replace(/\D/g, '').substring(0, 14),
        wayback_url: `https://web.archive.org/web/${url}`
      };
    } catch (err) {
      console.warn(`[WaybackArchiver] Save error for ${url}: ${err.message}`);
      return {
        submitted: false,
        error: err.message,
        wayback_url: `https://web.archive.org/web/*/${url}`
      };
    }
  }
}

export default WaybackArchiver;
