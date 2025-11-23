---
name: about-last-night-notion
description: |
  Notion database management for "About Last Night" immersive crime thriller game. 
  Use for: (1) Thread wiring - assigning narrative threads to unwired elements, (2) Content 
  gap analysis, (3) Token design with SF_ fields, (4) Character analysis - relationships 
  and coverage, (5) Evidence validation, (6) SF_ field validation, (7) Thread consolidation.
  
  Provides 3-tier tool hierarchy (19 scripts) and references for goal clusters, SF_ mechanics, 
  5 narrative threads, database schemas. Handles messy state (84% tokens unwired). 
  Includes wire_element.py and batch_wire_elements.py for thread assignments, 
  thread_detail_analysis.py for examining thread content, troubleshooting guide for API issues.
---

# About Last Night - Notion Database Skill

## Quick Start

**The Game:** "About Last Night" is a 2-hour immersive crime thriller where players solve Marcus's murder using memory tokens, evidence, and relationships. Players scan tokens and choose: Hold / Sell to Blake (black market) / Turn In to Detective.

**Current State:** 37 memory tokens exist, but 94.6% lack thread assignments. Content exists - it needs proper wiring and organization across 20 characters, 5 narrative threads, and 4 goal clusters.

**Your Role:** Work with game's complex Notion database structure to wire content, identify gaps, design tokens, and validate game mechanics.

**Full Game Context:** See GAME_OVERVIEW.md for complete details on goal clusters, narrative threads, tier system, scanner mechanics, and win conditions.

### Three Entry Points by Task

**System Overview → Start here when beginning analysis**
- Tool: `bird_eye_analysis_v2.py`
- Outputs: Thread coverage, element distribution, character summary
- Next steps: Identify gaps, then drill into specific areas

**Character Work → Start here when working with specific character**
- Tool: `character_element_coverage.py "[Character Name]"`
- Outputs: ALL elements owned by character (tokens, props, documents, set dressing)
- Next steps: Wire unwired content, assess true gaps, design new tokens

**Token Design → Start here when designing new tokens**
- Tool: `token_design_context_generator.py "[Character Name]"`
- Outputs: Character context, existing tokens, timeline events, thread candidates
- Next steps: Read core references (goal-clusters, sf-mechanics, narrative-threads)

---

## Tool Selection Guide

### Decision Tree

```
What do you need to do?

├─ Get system overview
│  └─→ bird_eye_analysis_v2.py (Tier 1)
│
├─ Work with specific character
│  ├─→ character_element_coverage.py (Tier 1) ⭐ START HERE
│  ├─ Need timeline details?
│  │  └─→ character_analysis_enhanced.py (Tier 2)
│  └─ Designing new token?
│     └─→ token_design_context_generator.py (Tier 1)
│
├─ Examine specific thread(s)
│  └─→ thread_detail_analysis.py (Tier 2) - view all elements in thread(s)
│
├─ Wire existing content
│  ├─→ thread_orphan_detection.py (Tier 2) - find rich unwired content
│  ├─→ examine_token_content.py (Tier 2) - read specific element
│  ├─→ wire_element.py (Write Tool) - assign thread to single element
│  └─→ batch_wire_elements.py (Write Tool) - assign threads to multiple elements
│
├─ Identify content gaps
│  ├─→ timeline_evidence_gaps.py (Tier 2) - timeline events without elements
│  └─→ character_element_coverage.py (Tier 1) - check BEFORE assuming gaps
│
├─ Validate relationships
│  └─→ trust_pair_verification.py (Tier 2) - shared timeline events
│
└─ Specialized analysis
   └─→ See TOOL_GUIDE.md for Tier 3 tools
```

### Tool Tiers

**Tier 1: Entry Points (START HERE) ⭐**

`bird_eye_analysis_v2.py` - System overview across all databases
- When: Starting analysis, identifying high-level gaps
- Outputs: Thread coverage, element distribution by type, character overview

`character_element_coverage.py "[Character Name]"` - Complete character view
- When: Before assuming content gaps, assessing character coverage
- Outputs: ALL element types owned by character (reveals unwired content)
- Critical: Prevents false "0 content" conclusions

`token_design_context_generator.py "[Character Name]"` - Design entry point
- When: Ready to design or validate token content
- Outputs: Character fields, tier/cluster, existing tokens, timeline events, thread candidates
- Points to: Core references for design (goal-clusters, sf-mechanics, narrative-threads)

**Tier 2: Common Workflows**

See TOOL_GUIDE.md section "Tier 2: Common Workflows" for:
- thread_detail_analysis.py - View all elements assigned to specific thread(s)
- thread_orphan_detection.py - Find rich unwired content (7-layer confidence scoring)
- timeline_evidence_gaps.py - Timeline events without physical elements
- trust_pair_verification.py - Shared timeline events for character pairs
- character_analysis_enhanced.py - Timeline events with dates and connections
- examine_token_content.py - Read Description/Text for specific element

**Write Tools** (execute thread assignments):
- wire_element.py - Assign thread to single element
- batch_wire_elements.py - Batch assign threads from CSV file

**Tier 3: Specialized Analysis**

See TOOL_GUIDE.md section "Tier 3: Specialized Tools" for all specialized scripts including character_wiring_audit.py, element_character_wiring_gaps.py, check_token_threads.py, and others.

**Complete Documentation:** TOOL_GUIDE.md contains comprehensive usage, examples, output interpretation, and API configuration for all 19 tools (including write tools).

---

## Core Workflows

### Workflow 1: Thread Wiring (Existing Content)

**Goal:** Assign narrative threads to unwired elements.

**Steps:**
1. Run `character_element_coverage.py "[Character Name]"` - identify unwired tokens
2. Read token content with `examine_token_content.py` or query Element database directly
3. Match content to thread patterns - read narrative-threads.md
4. Verify goal cluster alignment - read goal-clusters.md for character's cluster
5. Validate character-thread connection using narrative-threads.md character database hooks
6. Execute wiring: `wire_element.py "Element Name" "Thread Name"` for single elements, or `batch_wire_elements.py wirings.csv` for multiple elements

**Key Principle:** Wire existing content BEFORE creating new content. 35 tokens need wiring.

**Detailed Workflow:** See WORKFLOWS.md section "Thread Wiring"

### Workflow 2: Content Gap Analysis

**Goal:** Identify genuinely missing content (not just unwired content).

**Steps:**
1. Run `bird_eye_analysis_v2.py` - identify threads with low coverage
2. For gap threads, run `character_element_coverage.py` for connected characters
3. Assess TOTAL narrative presence (all element types: tokens + props + documents + set dressing)
4. Verify character-thread connections using narrative-threads.md
5. Document true gaps with justification (thread + total coverage + character connections)

**Critical:** Check ALL element types. "0 tokens" might mean 5 props tell complete story.

**Detailed Workflow:** See WORKFLOWS.md section "Content Gap Identification"

### Workflow 3: Token Design (New Content)

**Goal:** Design new token following established patterns.

**Steps:**
1. Run `token_design_context_generator.py "[Character Name]"` - get character context
2. Read goal-clusters.md for character's cluster - understand motivational framing
3. Design narrative content aligned with character's Primary Action and Emotion
4. Assign thread using narrative-threads.md patterns and character connections
5. Set SF_ fields using sf-mechanics.md validation decision trees
6. Validate cross-field coherence (cluster + thread + SF_ fields align)

**Critical:** Ground in timeline events. Use dual-context approach for SF_Summary.

**Detailed Workflow:** See WORKFLOWS.md section "Token Design"

### Workflow 4: SF_ Field Validation

**Goal:** Validate existing token's SF_ fields for coherence.

**Steps:**
1. Read token content and SF_ fields
2. Validate SF_MemoryType using sf-mechanics.md decision trees
3. Validate SF_ValueRating with narrative justification (see rating scale)
4. Validate SF_Summary works in dual contexts (private scanner + public detective log)
5. Check SF_Group (only 4 tokens should have "Black Market Ransom")
6. Verify cluster alignment using goal-clusters.md patterns

**Detailed Validation:** See WORKFLOWS.md section "SF_ Field Validation" and sf-mechanics.md

### Workflow 5: Relationship Validation

**Goal:** Verify character sheet claims have database grounding.

**Steps:**
1. Run `character_background_cross_reference.py "[Character Name]"`
2. Compare claims to timeline events from tool output
3. Identify ungrounded claims needing timeline events + elements
4. For trust pairs: Use `trust_pair_verification.py` to check shared events

**Complete Process:** See WORKFLOWS.md section "Relationship and Evidence Validation"

---

## Database Schema Quick Reference

**Key Field Names (Use in queries and scripts):**
- `"Basic Type"` (select) - Element type (Prop, Memory Token Image, etc.) - NOT "Type"
- `"Narrative Threads"` (multi_select) - Thread assignments
- `"Owner"` (relation) - Character who owns/possesses element
- `"Associated Characters"` (rollup) - Characters mentioned in timeline events
- `"Description/Text"` (rich_text) - Element content
- `"Timeline Event"` (relation) - Connected backstory events
- `"Name"` (title) - Element name

**Common Confusion:**
- Use `"Basic Type"` not `"Type"` for element categorization
- `Owner` ≠ `Associated Characters` - different relationships, both important
- Multi-select fields return arrays of objects with "name" property

**Complete Schema:** See DATABASE_SCHEMAS.md for full field definitions and rollup formulas

---

## Troubleshooting

### API Returns 0 Results
**Symptom:** Tools return "Retrieved 0 elements" despite database having content
**Solutions:**
1. Re-run the same command - often works on second attempt
2. Check network connectivity
3. Verify API token is still valid
**Note:** This is a transient issue, not a code bug

### Element Not Found Errors
**Symptom:** `wire_element.py` or `batch_wire_elements.py` report "Element not found"
**Common Causes:**
1. Special characters in names (apostrophes, em-dashes, quotes)
2. Element name too generic or too specific

**Solutions:**
1. Use token codes only: `"ASM031"` instead of `"ASM031 - Ashe's uncomfortable memory..."`
2. Use partial names: `"Taylor attempts"` instead of full name
3. Try shorter search terms if full names fail
4. For batch wiring: Create CSV with simpler search terms

**Example:**
```bash
# ✗ May fail with special characters
python3 wire_element.py "ASM031 - Ashe's uncomfortable memory of Marcus and Kai" "Underground Parties"

# ✓ Use token code instead  
python3 wire_element.py "ASM031" "Underground Parties"
```

### CSV Header Row Processed as Wiring
**Symptom:** Batch wiring shows error "Invalid thread name" for first row
**Solution:** Tool now auto-detects and skips headers - ensure you're using updated version
**Workaround:** Remove header row from CSV if using old version

### Multiple Elements Found
**Symptom:** "Multiple elements found matching '[search]'"
**Solution:** Use more specific search term (add more characters from name)

---

## Reference Map

### When to Read Each Reference

**Core Triad (Use Together for Token Work):**
- `narrative-threads.md` - Thread assignment, content patterns, character-thread connections
- `goal-clusters.md` - Cluster framing, SF_ field patterns, character motivation, design anti-patterns
- `sf-mechanics.md` - SF_ field validation, scanner contexts, dual-context writing, rating scales

**Background Context (Load as Needed):**
- `GAME_OVERVIEW.md` - Full game system (clusters, threads, tiers, scanner mechanics, win conditions)
- `DATABASE_SCHEMAS.md` - Database structure, rollups, Owner vs Associated, field definitions
- `CHOICE_ARCHITECTURE_ANALYSIS.md` - Detailed gameplay mechanics, beat-by-beat script
- `EARLY_GAME_SCAFFOLDING.md` - Non-token element importance (props, documents, set dressing)

**Procedural Guides:**
- `WORKFLOWS.md` - Complete workflow documentation, decision trees, common pitfalls
- `TOOL_GUIDE.md` - Comprehensive tool documentation, usage examples, API configuration
- `ORPHAN_DETECTION_SPEC.md` - Technical spec for orphan detection confidence scoring

**Reading Pattern:** Start with GAME_OVERVIEW.md for foundation, then use core triad (narrative-threads + goal-clusters + sf-mechanics) together during token work.

---

## Critical Reminders

**Wire Before Create:** 35 existing tokens need thread wiring. Wiring is MUCH faster than content creation. Always run `character_element_coverage.py` before assuming gaps.

**Owner vs Associated:** Owner = whose POV/possession (Element → Character). Associated = who's in backstory (Element → Timeline → Characters). Different relationships, both matter for coverage.

**Complete Coverage Analysis:** Assess ALL element types (tokens + props + documents + set dressing) for total thread presence. "0 tokens" doesn't mean "no content."

**Dual-Context SF_Summary:** Must work as (1) private scanner view for player decisions AND (2) public detective log evidence. Test both contexts. See sf-mechanics.md for patterns.

**Three-Reference Pattern:** Always use together: narrative-threads (what story?), goal-clusters (cluster framing?), sf-mechanics (fields valid?).

**Database State Reality:** 94.6% tokens unwired, thread coverage uneven. Skill handles messy state with systematic workflows. Don't expect clean data.

---

## Common Pitfall Quick Reference

**Pitfall:** Assuming content gaps without checking wiring
**Fix:** ALWAYS run character_element_coverage.py first

**Pitfall:** Ignoring non-token elements  
**Fix:** Check ALL element types in coverage analysis

**Pitfall:** Wrong MemoryType for content
**Fix:** Read sf-mechanics.md decision trees (Technical = systems, Business = professional, Personal = emotional)

**Pitfall:** Single-context SF_Summary
**Fix:** Write for BOTH private scanner AND public detective log (sf-mechanics.md patterns)

**Pitfall:** Cluster framing mismatch
**Fix:** Read goal-clusters.md for character's cluster, match voice to patterns

**Complete Pitfall Guide:** See WORKFLOWS.md section "Common Pitfalls and Anti-Patterns"

---

This skill enables systematic work with About Last Night's Notion database. Start with Tier 1 entry point tools, use the core reference triad for token work, and always wire existing content before creating new content. Write tools (wire_element.py, batch_wire_elements.py) execute thread assignments after analysis.
