const fs = require('fs');
const path = require('path');

class TaxonomyClassifier {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(__dirname, '..', 'site', 'src', 'config', 'taxonomy.config.json');
    this.taxonomy = this.loadTaxonomy();
  }

  loadTaxonomy() {
    try {
      const data = fs.readFileSync(this.configPath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.warn(`[TaxonomyClassifier] Failed to load ${this.configPath}, using default structure`);
      return { topics: [] };
    }
  }

  classify(article) {
    const text = `${article.title || ''} ${article.summary || ''} ${article.body_text || ''}`.toLowerCase();
    
    let bestTopic = this.taxonomy.topics[0] || { id: 'politics-elections-governance', slug: 'politics-elections-governance', title: 'Politics, Elections & Governance' };
    let bestSubtopic = (bestTopic.subtopics && bestTopic.subtopics[0]) || { id: 'coalition-dynamics', slug: 'coalition-dynamics', title: 'Coalition Politics & Party Dynamics' };
    let highestScore = -1;

    for (const topic of this.taxonomy.topics) {
      let topicScore = 0;
      let topicBestSubtopic = null;
      let topicBestSubtopicScore = -1;

      if (topic.subtopics) {
        for (const subtopic of topic.subtopics) {
          let subScore = 0;
          if (subtopic.keywords) {
            for (const kw of subtopic.keywords) {
              const kwLower = kw.toLowerCase();
              // Exact occurrences count
              const matches = (text.match(new RegExp(`\\b${kwLower}\\b`, 'g')) || []).length;
              subScore += matches;
            }
          }
          if (subScore > topicBestSubtopicScore) {
            topicBestSubtopicScore = subScore;
            topicBestSubtopic = subtopic;
          }
          topicScore += subScore;
        }
      }

      if (topicScore > highestScore) {
        highestScore = topicScore;
        bestTopic = topic;
        bestSubtopic = topicBestSubtopic || (topic.subtopics && topic.subtopics[0]);
      }
    }

    // Extract tags / entities
    const extractedTags = this.extractTags(text);

    return {
      topic: {
        id: bestTopic.id,
        slug: bestTopic.slug,
        title: bestTopic.title
      },
      subtopic: bestSubtopic ? {
        id: bestSubtopic.id,
        slug: bestSubtopic.slug,
        title: bestSubtopic.title
      } : null,
      tags: extractedTags,
      confidence_score: highestScore
    };
  }

  extractTags(text) {
    const commonEntities = [
      'Nitish Kumar', 'Tejashwi Yadav', 'Lalu Prasad', 'Patna High Court',
      'BPSC', 'BSUSC', 'Patna University', 'Special Vigilance Unit',
      'PMCH', 'NMCH', 'AIIMS Patna', 'JD(U)', 'RJD', 'BJP', 'Congress',
      'Chanakya National Law University', 'Mines Department', 'Mid-Day Meal'
    ];

    const tags = [];
    for (const ent of commonEntities) {
      if (text.includes(ent.toLowerCase())) {
        tags.push(ent);
      }
    }
    return tags.length > 0 ? tags : ['Bihar', 'Patna News', 'Hindustan Times'];
  }
}

module.exports = TaxonomyClassifier;
