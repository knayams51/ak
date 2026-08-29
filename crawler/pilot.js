const CrawlerEngine = require('./main');

async function runPilot() {
  console.log('>>> Launching Arun Kumar Archive Pilot Crawl (Limit: 15 Articles) <<<');
  const engine = new CrawlerEngine({
    limit: 15,
    discoverPages: 2,
    skipDiscoveryIfQueued: false
  });

  const stats = await engine.run();
  console.log('\n>>> Pilot Crawl Finished <<<');
  console.log(`Accepted: ${stats.accepted}, Filtered: ${stats.filteredOut}, Failed: ${stats.failed}`);
}

runPilot().catch(err => {
  console.error('Pilot error:', err);
  process.exit(1);
});
