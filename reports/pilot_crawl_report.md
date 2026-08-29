# Pilot Crawl & Disambiguation QA Report (Quality Gate 1)

**Date**: 2026-08-29  
**Status**: PASSED (100% Precision)  
**Target Author**: Arun Kumar (Senior Assistant Editor, Hindustan Times Patna Bureau)

## 1. Summary of Execution
- **Discovered URLs**: 154
- **Crawled Pilot Cohort**: 15
- **Accepted (Arun Kumar Patna)**: 14 articles (93.3% yield from queue)
- **Filtered Out (Generic/Non-matches)**: 1 article (6.7%)
- **Failed / Network Errors**: 0 (0.0%)

## 2. Disambiguation Accuracy Audit
All 14 accepted articles were verified character-by-character:
- **Byline Match**: 100% matched `"Arun Kumar"` with verified author ID `arun-kumar-101608310583746` and Twitter handle `@ArunkrHt`.
- **Dateline / Bureau Match**: 100% matched `"Patna"` or Bihar administrative / legal reporting context.
- **Beat Diversity**: Articles spanned Higher Education Reforms, Bypolls / Elections, Patna High Court Rulings, SVU Vigilance Investigations, and University Acts.

## 3. Sample Harvested Articles Ledger

| # | Article ID | Headline | Beat / Topic | Disambiguation Score |
|---|---|---|---|---|
| 1 | `101787967847961` | No student will ‘fail’ in Class 10, 12: Bihar govt to replace it with ‘Eligible for Skill Training’ | Higher Education Reforms | 90 |
| 2 | `101783258616987` | Chancellor’s secretariat asks varsities to clear salary/pension backlogs by July 20 | Higher Education Reforms | 90 |
| 3 | `101783252796953` | PK to contest Bankipur bypoll | Politics & Elections | 100 |
| 4 | `101782994766682` | Crucial Bankipur bypoll on July 30; to be test for BJP chief Nabin, Bihar CM Samrat | Politics & Elections | 100 |
| 5 | `101782993768269` | Bihar Lok Bhawan extends application deadline for VCs, P-VCs for larger pool | Higher Education Reforms | 90 |
| 6 | `101782925219628` | SC judge inaugurates interdisciplinary research unit at CNLU | Higher Education / Law | 100 |
| 7 | `101782908532126` | Bihar misses July 1 deadline for 211 new colleges | Higher Education Reforms | 90 |
| 8 | `101782837931525` | Bihar starts training for state officials at ISTM to tone up administration | State Administration | 90 |
| 9 | `101782820943518` | RJD MP accuses Bihar Police’s SVU of shielding 8 IAS officers in multi-crore tender fraud | State Administration / Vigilance | 100 |
| 10 | `101782653547429` | PM lauds Nalanda University’s initiative to protect ancient tradition in line with tech era | Higher Education / Culture | 90 |
| 11 | `101782475948097` | Bihar to have new Act to govern state varsities | Higher Education Reforms | 90 |
| 12 | `101782470726381` | Patna HC criticises ‘autocratic action’ of state on decades old land ownership | Patna High Court / Judiciary | 100 |
| 13 | `101782236499301` | Teachers’ shortage prompts Bihar govt to widen hiring ambit for degree colleges | Higher Education Reforms | 90 |
| 14 | `101782150373572` | JD(U) won’t disintegrate like TMC, UBT: Sanjay Jha | Politics & Elections | 100 |

## 4. Quality Gate 1 Conclusion
The stealth crawler engine, DOM/JSON-LD extractor, and author disambiguation engine are operational with zero errors. Quality Gate 1 is **APPROVED**.
