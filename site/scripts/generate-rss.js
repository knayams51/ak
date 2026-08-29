import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataPath = path.join(__dirname, '..', 'src', 'data', 'articles.json');
const publicDir = path.join(__dirname, '..', 'public');
const baseUrl = 'https://arunkumar-journalism.org';

if (!fs.existsSync(dataPath)) {
  console.log('[GenerateRSS] articles.json not found. Skipping.');
  process.exit(0);
}

const articles = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

let rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Arun Kumar — Journalistic Archive</title>
    <link>${baseUrl}</link>
    <description>Official archive of Arun Kumar (Senior Assistant Editor, Hindustan Times Patna Bureau) covering Bihar politics, higher education, Patna High Court jurisprudence, and governance.</description>
    <language>en-in</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/rss.xml" rel="self" type="application/rss+xml" />
`;

for (const art of articles.slice(0, 30)) {
  const pubDate = new Date(art.published_at).toUTCString();
  const cleanSummary = (art.summary || '').replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
    }
  });

  const cleanTitle = (art.title || '').replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
    }
  });

  rssXml += `    <item>
      <title>${cleanTitle}</title>
      <link>${baseUrl}/articles/${art.slug}</link>
      <guid isPermaLink="true">${baseUrl}/articles/${art.slug}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${cleanSummary}</description>
      <author>arunkumar.htpatna@gmail.com (Arun Kumar)</author>
      <category>${(art.topic && art.topic.title) || 'Bihar News'}</category>
    </item>
`;
}

rssXml += `  </channel>
</rss>`;

fs.writeFileSync(path.join(publicDir, 'rss.xml'), rssXml, 'utf8');
console.log(`[GenerateRSS] Generated rss.xml with ${Math.min(30, articles.length)} entries.`);
