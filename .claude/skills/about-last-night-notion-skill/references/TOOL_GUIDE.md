# About Last Night - Tool Guide

This reference provides comprehensive documentation for all 19 tools. Use when working with specific tools or needing detailed usage guidance.

---

## Tool Hierarchy Overview

### Tier 1: Entry Points (START HERE) ⭐

These are your primary entry points for common tasks:

1. **bird_eye_analysis_v2.py** - System overview
2. **character_element_coverage.py** - Complete character view  
3. **token_design_context_generator.py** - Token design entry point

### Tier 2: Common Workflows

Tools for frequent analysis tasks:

4. **thread_detail_analysis.py** - View all elements in specific thread(s)
5. **thread_orphan_detection.py** - Find rich unwired content
6. **timeline_evidence_gaps.py** - Timeline events without elements
7. **trust_pair_verification.py** - Relationship grounding
8. **character_analysis_enhanced.py** - Deep character dive
9. **examine_token_content.py** - Read specific element content

### Write Tools (Execute Wirings)

Tools for updating database after analysis:

10. **wire_element.py** - Wire single element to thread
11. **batch_wire_elements.py** - Wire multiple elements from CSV

### Tier 3: Specialized Analysis

Tools for specific technical tasks:

12. **character_wiring_audit.py** - Character-specific wiring issues
13. **element_character_wiring_gaps.py** - Narrative mentions without relations
14. **character_background_cross_reference.py** - Character sheet validation
15. **check_token_threads.py** - Quick thread check
16. **get_tier_distribution.py** - Tier distribution query
19. **query_all_rollups.py** - Rollup properties identification
17. **verify_actual_schemas.py** - Schema verification
18. **character_sheet_parser.py** - Library module (called by other tools)

---

## Tier 1: Entry Point Tools

### bird_eye_analysis_v2.py

**Purpose:** Top-down system overview across all databases

**When to use:**
- Starting fresh analysis
- Identifying high-level gaps  
- Getting thread coverage snapshot
- Understanding element distribution

**Usage:**
```bash
python bird_eye_analysis_v2.py
```

**No arguments required.** Tool queries all databases.

**Output Sections:**

1. **Thread Coverage Summary**
   ```
   === THREAD COVERAGE ===
   Funding & Espionage: 7 elements (1 token, 4 props, 2 documents)
   Marriage Troubles: 4 elements (0 tokens, 2 props, 2 documents)
   ...
   ```
   Shows elements per thread by type.

2. **Element Distribution**
   ```
   === ELEMENT DISTRIBUTION ===
   Total Elements: 124
   Memory Tokens: 37 (29.8%)
   Props: 52 (41.9%)
   Documents: 28 (22.6%)
   Set Dressing: 7 (5.6%)
   ```
   Breakdown by element type.

3. **Character Overview**
   ```
   === CHARACTERS ===
   E - Ashe Motoko (Core, JUSTICE): 8 elements
   E - Alex Reeves (Core, JUSTICE): 7 elements
   ...
   ```
   Elements per character with tier and cluster.

4. **Memory Token Summary**
   ```
   === MEMORY TOKENS ===
   Total: 37
   With Thread: 2 (5.4%)
   Without Thread: 35 (94.6%)
   ```
   Thread assignment status.

**Interpreting Output:**
- Thread with "0 tokens" → potential gap (but check character_element_coverage first!)
- High unwired count → prioritize wiring over creation
- Uneven distribution → check tier-appropriate expectations

**Next Steps:**
- Gaps identified → Run character_element_coverage for involved characters
- Thread deep dive → Query Elements database for specific thread
- Token design → Run token_design_context_generator

**Time:** 30-60 seconds to run (queries all databases)

---

### character_element_coverage.py

**Purpose:** Shows ALL elements for one character (tokens, props, documents, set dressing)

**Critical Use:** Run BEFORE assuming content gaps. Reveals unwired tokens.

**When to use:**
- Before assuming character needs new content
- Assessing character coverage
- Finding unwired tokens
- Checking element type distribution

**Usage:**
```bash
python character_element_coverage.py "E - Ashe Motoko"
```

**Character name must be EXACT** including cluster prefix.

**Output:**
```
=== CHARACTER: E - Ashe Motoko ===
Tier: Core
Goal Cluster: JUSTICE

=== MEMORY TOKENS: 3 total ===
1. ASM001 - Memory of first meeting Marcus
   Thread: Funding & Espionage
   
2. ASM002 - Memory of investigative journalism
   Thread: No thread assigned ⚠️
   
3. ASM003 - Memory of being fired
   Thread: No thread assigned ⚠️

=== PROPS: 4 total ===
1. Ashe's press badge
   Thread: No thread assigned
   
... [continues for all element types]

=== SUMMARY ===
Total Elements: 8
- Tokens: 3 (1 wired, 2 unwired)
- Props: 4 (0 wired)
- Documents: 1 (0 wired)
```

**Interpreting Output:**
- "No thread assigned" = unwired content (NOT missing content!)
- Check ALL types, not just tokens
- Compare to tier expectations (Core: 6-10, Secondary: 4-7, Tertiary: 2-5)

**Common Mistake:** Seeing "Marriage Troubles: 0 tokens" in bird's eye, then NOT running this tool before assuming you need to create tokens. Sarah might own 2 unwired tokens that just need thread assignment!

**Next Steps:**
- Unwired tokens found → Wire them using Workflow 1 (Thread Wiring)
- No unwired tokens, low coverage → Assess true gap using Workflow 2
- Ready to design new → Run token_design_context_generator

**Time:** 5-10 seconds per character

---

### token_design_context_generator.py

**Purpose:** Complete context for designing tokens for specific character

**When to use:**
- Ready to design or validate token content
- Need character database fields
- Want thread candidates based on character connections

**Usage:**
```bash
python token_design_context_generator.py "S - Sarah Blackwood"
```

**Output Sections:**

1. **Character Database "Given Circumstances"**
   ```
   === CHARACTER CONTEXT ===
   Name: S - Sarah Blackwood
   Tier: Core
   Goal Cluster: PRAGMATIC
   
   Logline: "Resentful Spouse"
   
   Overview & Key Relationships:
   [Full text from database]
   
   Emotion towards CEO:
   [Full text from database]
   
   Primary Action:
   [Full text from database]
   ```
   These fields inform token design voice and content.

2. **Structural Context**
   ```
   === EXISTING TOKENS ===
   1. SAB001 - No thread assigned
   2. SAB002 - No thread assigned
   
   === TIMELINE EVENTS (5 total) ===
   2010-06-15: Facebook internship begins
   2015-03-20: Sarah and Marcus marry
   ...
   ```
   Shows what already exists.

3. **Trust Indicators**
   ```
   === TRUST PAIRS ===
   - Rachel Torres
   - Alex Reeves
   ```
   From character sheet trust pairs.

4. **Thread Candidates**
   ```
   === THREAD CANDIDATES ===
   Based on character connections:
   - Marriage Troubles (central to thread)
   - Funding & Espionage (involved in timeline events)
   ```
   Suggested threads based on Overview and timeline.

5. **Agent Workflow Guidance**
   ```
   === NEXT STEPS ===
   1. Read goal-clusters.md for PRAGMATIC cluster patterns
   2. Design token aligned with Primary Action
   3. Reference timeline events for grounding
   4. Use sf-mechanics.md for SF_ field validation
   5. Assign thread using narrative-threads.md patterns
   ```
   Points to relevant references.

**How to Use Output:**
1. Read character database fields (voice, motivation, action)
2. Review existing tokens (avoid duplication)
3. Check timeline events (grounding for new content)
4. Consider thread candidates (but verify fit)
5. Read referenced skill files (goal-clusters.md, sf-mechanics.md, narrative-threads.md)
6. Design token following patterns

**Next Steps:**
After running tool:
- Read goal-clusters.md for character's cluster
- Read sf-mechanics.md for SF_ field guidance
- Read narrative-threads.md for thread patterns
- Follow Workflow 3 (Token Design)

**Time:** 10-15 seconds per character

---

## Tier 2: Common Workflow Tools


### thread_detail_analysis.py

**Purpose:** View all elements assigned to specific thread(s) with detailed context

**When to use:**
- Thread consolidation planning
- Reviewing what content exists in a thread
- Assessing thread balance and coverage
- Understanding element distribution within threads
- Preparing for thread reassignments

**Usage:**
```bash
# Single thread
python thread_detail_analysis.py "Funding & Espionage"

# Multiple threads
python thread_detail_analysis.py "Class Conflicts,Investigative Journalism,The Senate Testimony"

# Memory tokens only
python thread_detail_analysis.py "Underground Parties" --tokens-only

# Export to CSV
python thread_detail_analysis.py "Memory Drug,Advanced Technology" --export-csv
```

**Arguments:**
- `thread_names` - Single thread or comma-separated list
- `--tokens-only` - Filter to show only memory tokens
- `--export-csv` - Export results to thread_detail_export.csv

**Output Sections:**

1. **Thread Summary**
   ```
   === THREAD: Funding & Espionage ===
   Total elements: 22
   ```
   Shows element count per thread

2. **Elements Grouped by Type**
   ```
   Memory Token Image: 2 elements
   1. VIK001 - Victoria's Memory
      Owner: P - Victoria Kingsley (COVERUP)
      Timeline events: 3
      Description: Victoria discovers Marcus's unauthorized...
   
   2. ALR002 - Alex's Memory 2
      Owner: E - Alex Reeves (JUSTICE)
      Also in: Advanced Technology
      Timeline events: 2
      Description: Alex witnesses the board meeting where...
   
   Prop: 15 elements
   ...
   ```
   Full details for each element including:
   - Element name
   - Owner and cluster
   - Other threads (if multi-assigned)
   - Timeline event count
   - Description preview (first 150 characters)

**Interpretation:**

**Thread Coverage Assessment:**
- Look for threads with <5 elements - candidates for consolidation
- Check if elements are well-distributed across types
- Identify threads with 0 memory tokens

**Content Review:**
- Read descriptions to understand thematic coherence
- Note elements that might fit better in different threads
- Check for elements multi-assigned to threads

**Multi-Thread Assignment:**
When element appears in multiple threads:
```
Also in: Memory Drug, Underground Parties
```
This indicates the element serves multiple narrative purposes

**Owner Distribution:**
Track which characters contribute to thread:
- Thread with elements from all clusters = broad narrative
- Thread with elements from one cluster = focused storyline

**CSV Export Fields:**
When using `--export-csv`:
- thread, name, type, owner, cluster, timeline_events, other_threads, description

**Common Use Cases:**

1. **Thread Consolidation:**
   ```bash
   python thread_detail_analysis.py "Class Conflicts,Investigative Journalism"
   # Review output → decide reassignments → create CSV
   ```

2. **Balance Assessment:**
   ```bash
   python thread_detail_analysis.py "Memory Drug" --tokens-only
   # Count tokens per thread to identify gaps
   ```

3. **Content Audit:**
   ```bash
   python thread_detail_analysis.py "Funding & Espionage" --export-csv
   # Review CSV for thematic consistency
   ```

**Limitations:**
- Shows current thread assignments only (not historical)
- Description preview limited to 150 characters
- Does not analyze content quality or narrative coherence

**Related Tools:**
- Use `bird_eye_analysis_v2.py` first to identify threads to examine
- Use `wire_element.py` or `batch_wire_elements.py` to reassign elements after review
- Use `thread_orphan_detection.py` to find unwired content to add to threads

---

### thread_orphan_detection.py

**Purpose:** Find rich unwired content using 7-layer confidence scoring

**When to use:**
- After bird_eye_analysis shows low thread coverage
- Looking for existing content to wire (not create)
- Systematic unwired content identification

**Usage:**
```bash
python thread_orphan_detection.py
```

**Output:**
```
=== HIGH CONFIDENCE ORPHANS ===
(Score 6-7 layers matched)

Element: SAB002
Owner: S - Sarah Blackwood
Type: Memory Token
Content snippet: "Our marriage was supposed to be a partnership..."
Suggested Thread: Marriage Troubles
Confidence Factors:
- Rich narrative content ✓
- Character central to Marriage Troubles ✓
- Keywords: marriage, partnership, relationship ✓
- Timeline grounding: 2015 marriage event ✓
...

[More high-confidence matches]

=== MEDIUM CONFIDENCE ORPHANS ===
(Score 4-5 layers matched)
...
```

**Confidence Layers** (see ORPHAN_DETECTION_SPEC.md for details):
1. Rich narrative content (>200 chars)
2. Character has narrative connection to thread
3. Keyword/theme matching
4. Timeline event grounding
5. Goal cluster alignment
6. Mentioned in other elements
7. Production notes suggest thread

**Interpreting Output:**
- High confidence (6-7) → Very likely correct thread, wire it
- Medium confidence (4-5) → Manual review recommended
- Low confidence (1-3) → Needs human judgment

**Next Steps:**
- For each high-confidence match: Review content, assign thread
- Medium confidence: Read narrative-threads.md for validation
- Track wiring progress with check_token_threads.py

**Time:** 60-90 seconds (analyzes all elements)

---

### timeline_evidence_gaps.py

**Purpose:** Timeline events without physical element evidence

**When to use:**
- Identifying which props/documents/tokens needed
- Checking if timeline events are grounded
- Planning element creation

**Usage:**
```bash
python timeline_evidence_gaps.py
```

**Output:**
```
=== TIMELINE EVENTS WITHOUT EVIDENCE ===

Event: "Ashe and Alex briefly date" (2010-08-01)
Characters: E - Ashe Motoko, E - Alex Reeves
Evidence Count: 0 ⚠️
Gap Type: NO EVIDENCE

Event: "Victoria invests in NeurAI" (2018-03-15)
Characters: P - Victoria Kingsley, Marcus
Evidence Count: 1
Gap Type: MINIMAL EVIDENCE (needs 2-3 elements)

[More events listed]

=== SUMMARY ===
Total Events: 45
Well-Evidenced (3+ elements): 12
Minimally Evidenced (1-2): 18
No Evidence: 15
```

**Interpreting Output:**
- "NO EVIDENCE" → Critical gap, needs props/documents/tokens
- "MINIMAL EVIDENCE" → Acceptable for minor events, may need more for important events
- Well-evidenced → Good grounding

**Gap Assessment:**
- Core character events → Need 3+ elements
- Secondary character events → Need 2+ elements
- Tertiary/minor events → 1-2 elements acceptable

**Next Steps:**
- For NO EVIDENCE events: Create props, documents, or tokens
- Check character connections: Which character should own elements?
- Consider element type: Token (scannable), Prop (examinable), Document (readable)

**Time:** 15-20 seconds

---

### trust_pair_verification.py

**Purpose:** Shared timeline events for character pairs

**When to use:**
- Verifying trust relationships have narrative grounding
- Checking if character sheet "You know you can trust X" is supported
- Planning shared timeline events

**Usage:**
```bash
python trust_pair_verification.py "E - Ashe Motoko" "E - Alex Reeves"
```

**Both character names required**, exact match including prefix.

**Output:**
```
=== TRUST PAIR: Ashe Motoko ↔ Alex Reeves ===

Shared Timeline Events: 3

1. "Facebook internship begins" (2010-06-15)
   Also attended: Sarah Blackwood, Marcus
   Evidence: 2 elements
   
2. "Ashe and Alex briefly date" (2010-08-01)
   Only these two characters
   Evidence: 0 elements ⚠️
   
3. "BizAI partnership forms" (2015-10-20)
   Also attended: Marcus, James Whitman
   Evidence: 4 elements

=== ASSESSMENT ===
Grounding: STRONG (3 shared events)
Evidence Quality: MIXED (1 event lacks evidence)
Recommendation: Create evidence for dating event
```

**Interpreting Output:**
- 2+ shared events = STRONG grounding
- 1 shared event = MODERATE grounding
- 0 shared events = UNGROUNDED (create events!)

**Next Steps:**
- Ungrounded pairs → Create 1-2 timeline events with both characters
- Events lack evidence → Run timeline_evidence_gaps.py, create elements
- Well-grounded → Relationship validated ✓

**Time:** 5 seconds per pair

---

### character_analysis_enhanced.py

**Purpose:** Timeline events with dates, evidence counts, connections

**When to use:**
- Understanding character's narrative arc
- Checking chronological backstory
- Seeing full timeline participation

**Usage:**
```bash
python character_analysis_enhanced.py "R - Derek Thorne"
```

**Output:**
```
=== CHARACTER: R - Derek Thorne ===
Tier: Secondary
Goal Cluster: RECOVERY

=== TIMELINE EVENTS (12 total) ===

2010-09-01: Stanford classes begin
- Other Characters: Marcus, Diana Nilsson, Sofia Francisco
- Evidence: 3 elements (1 token, 2 props)

2011-05-15: First underground party
- Other Characters: Marcus, Flip
- Evidence: 5 elements (0 tokens, 3 props, 2 documents)

... [chronological list]

=== ANALYSIS ===
Event Span: 2010-2024 (14 years)
Total Evidence: 28 elements
Average per Event: 2.3 elements
Most Connected: Marcus (10 shared events)
```

**Interpreting Output:**
- Long event span → Rich backstory
- High evidence count → Well-grounded character
- Most connected character → Key relationship

**Next Steps:**
- Low evidence on important events → Create elements
- Gaps in timeline → Create missing events
- Token design → Reference events for grounding

**Time:** 10 seconds per character

---

### examine_token_content.py

**Purpose:** Read Description/Text for specific token

**When to use:**
- Need to read token narrative before thread assignment
- Validating token content
- Quick content check

**Usage:**
```bash
python examine_token_content.py "SAB002"
```

**Token name/ID required.**

**Output:**
```
=== TOKEN: SAB002 ===
Owner: S - Sarah Blackwood
Type: Memory Token
Thread: No thread assigned

=== CONTENT ===
Our marriage was supposed to be a partnership of equals, but somewhere along the way, Marcus stopped seeing me as a partner and started seeing me as an accessory to his ambitions. I built my own career in finance while he chased his AI dreams, but that was never enough. He wanted someone who would orbit around him, not someone who had her own gravitational pull.

SF_MemoryType: Personal
SF_ValueRating: 3
SF_Group: 
SF_Summary: Sarah's reflection on how her marriage to Marcus dissolved from partnership to subordination
```

**Interpreting Output:**
- Full narrative content visible
- SF_ fields parsed out
- Can assess thread fit

**Next Steps:**
- Match content to thread patterns (narrative-threads.md)
- Validate SF_ fields (sf-mechanics.md)
- Assign thread if clear fit

**Time:** <5 seconds

---

## Write Tools

These tools update the database by assigning narrative threads. Use after analysis confirms thread assignment.

### wire_element.py

**Purpose:** Assign narrative thread to single element

**When to use:**
- After analyzing element content and confirming thread fit
- When thread_orphan_detection identifies strong candidate
- After manual content review

**Usage:**
```bash
python wire_element.py "Element Name" "Thread Name"
```

**Example:**
```bash
python wire_element.py "ALR002" "Funding & Espionage"
python wire_element.py "Diana's emails" "Marriage Troubles"
```

**Valid Threads:**
- Funding & Espionage
- Marriage Troubles
- Memory Drug
- Underground Parties
- Class Conflicts
- Investigative Journalism
- Advanced Technology
- The Senate Testimony

**Output:**
```
Searching for element matching 'ALR002'...

Found element: ALR002 - Alex's Memory 2
Type: Memory Token Image
Current threads: (unassigned)
New thread: Funding & Espionage

Updating thread assignment...
✓ Successfully wired 'ALR002 - Alex's Memory 2' to 'Funding & Espionage'
```

**Error Handling:**
- Retries once automatically on failure (transient API issues)
- Shows detailed error messages if retry fails
- Validates thread name before attempting update
- Requires unique element match (rejects multiple matches)

**Next Steps:**
- Verify wiring with bird_eye_analysis_v2.py or check_token_threads.py
- Continue with next orphan from thread_orphan_detection output

**Time:** <5 seconds

---

### batch_wire_elements.py

**Purpose:** Wire multiple elements from CSV file

**When to use:**
- After identifying multiple elements ready for wiring
- Batch processing confirmed thread assignments
- After reviewing thread_orphan_detection medium confidence candidates

**Usage:**
```bash
python batch_wire_elements.py wirings.csv
```

**CSV Format (no header):**
```csv
element_search_term,thread_name
ALR002,Funding & Espionage
Diana's emails,Marriage Troubles
OLS011,Advanced Technology
```

**Example Session:**
```
Processing 3 wiring(s)...
================================================================================

[ALR002] → [Funding & Espionage]
  Found: ALR002 - Alex's Memory 2
  Type: Memory Token Image
  Current: (unassigned)
  ✓ Wired to 'Funding & Espionage'

[Diana's emails] → [Marriage Troubles]
  Found: Diana's emails about divorce
  Type: Prop
  Current: (unassigned)
  ✓ Wired to 'Marriage Troubles'

[OLS011] → [Advanced Technology]
  Found: OLS011 - Oliver's human neural organoids research
  Type: Memory Token Image
  Current: (unassigned)
  ⚠ First attempt failed (HTTP 503), retrying...
  ✓ Wired to 'Advanced Technology'

================================================================================
SUMMARY
================================================================================
Successful: 3
Errors: 0

Successful wirings:
  ✓ ALR002 - Alex's Memory 2 → Funding & Espionage
  ✓ Diana's emails about divorce → Marriage Troubles
  ✓ OLS011 - Oliver's human neural organoids research → Advanced Technology
```

**Error Handling:**
- Automatic retry once per element on API failures
- Detailed error reporting (HTTP codes, API messages)
- Continues processing remaining elements after errors
- Summary shows all successes and errors

**Common Errors:**
- "Invalid thread name" → Check spelling against valid threads list
- "Element not found or multiple matches" → Use more specific search term
- "HTTP 503" → Notion API temporary issue, usually succeeds on retry

**Next Steps:**
- Review error list for failed wirings
- Retry failed elements individually with wire_element.py
- Verify batch with bird_eye_analysis_v2.py

**Time:** ~3-5 seconds per element (including retry delays)

---

## Tier 3: Specialized Tools

### character_wiring_audit.py

**Purpose:** Character-specific wiring issues (relationship gaps, evidence holes)

**Usage:**
```bash
python character_wiring_audit.py "P - Oliver Sterling"
```

**Output identifies:**
- Owned elements without thread
- Timeline events without evidence
- Trust pairs without shared events
- Mentioned but not in Associated Characters

Use for deep character audit.

**Time:** 15-20 seconds per character

---

### element_character_wiring_gaps.py

**Purpose:** Detects character mentions in narrative without DB relations

**Usage:**
```bash
python element_character_wiring_gaps.py
```

**Output:**
```
=== WIRING GAPS ===

Element: Leila's blockchain notes
Narrative mentions: "Oliver is a fixed point"
Character "Oliver Sterling" NOT in:
- Owner (current: Leila Bishara)
- Associated Characters (empty)
Confidence: HIGH (explicit name mention)
```

Multi-factor confidence scoring identifies orphaned mentions.

**Time:** 45-60 seconds (analyzes all elements)

---

### character_background_cross_reference.py

**Purpose:** Timeline events for character with evidence counts

**Usage:**
```bash
python character_background_cross_reference.py "E - Ashe Motoko"
```

Used with Google Drive character sheets to validate claims.

See WORKFLOWS.md "Relationship and Evidence Validation" for complete workflow.

**Time:** 10 seconds per character

---

### check_token_threads.py

**Purpose:** Quick check of all memory tokens and thread assignments

**Usage:**
```bash
python check_token_threads.py
```

**Output:**
```
=== MEMORY TOKENS THREAD STATUS ===

WITH THREAD (2):
- ASM001: Funding & Espionage
- JWM001: Funding & Espionage

WITHOUT THREAD (35):
- SAB001 (Sarah Blackwood)
- SAB002 (Sarah Blackwood)
... [list continues]

Wiring Progress: 5.4% (2/37)
```

Rapid assessment of wiring status.

**Time:** 5 seconds

---

### get_tier_distribution.py

**Purpose:** Actual tier distribution from Characters database

**Usage:**
```bash
python get_tier_distribution.py
```

**Output:**
```
=== TIER DISTRIBUTION ===
Core: 8 characters
Secondary: 6 characters
Tertiary: 6 characters
Total: 20 characters
```

Quick reference for tier expectations.

**Time:** <5 seconds

---

### query_all_rollups.py

**Purpose:** Identify all rollup properties and aggregation logic

**Usage:**
```bash
python query_all_rollups.py
```

**Output:** Lists all rollup formulas across databases.

Use for schema understanding and troubleshooting.

**Time:** 30 seconds

---

### verify_actual_schemas.py

**Purpose:** Schema verification and troubleshooting

**Usage:**
```bash
python verify_actual_schemas.py
```

**Output:** Validates all database schemas match expected structure.

Use during initial setup or if database seems wrong.

**Time:** 20-30 seconds

---

### character_sheet_parser.py

**Purpose:** Library module for parsing Google Drive character sheets

**Not called directly.** Used by character_background_cross_reference.py and other tools.

Contains functions to extract character sheet structure.

---

## API Configuration

### Notion API Setup

All tools use the same API configuration:

```python
NOTION_TOKEN = "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"
NOTION_VERSION = "2022-06-28"

DATABASE_IDS = {
    "Characters": "18c2f33d-583f-8060-a6ab-de32ff06bca2",
    "Elements": "18c2f33d-583f-8020-91bc-d84c7dd94306",
    "Timeline": "1b52f33d-583f-80de-ae5a-d20020c120dd",
    "Puzzles": "1b62f33d-583f-80cc-87cf-d7d6c4b0b265"
}

HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
}
```

### Rate Limiting

**Notion API limits:** 3 requests per second

**Tool behavior:**
- Implements exponential backoff on rate limit errors
- Large queries may take 30-90 seconds
- bird_eye_analysis queries all databases (slowest tool)

### Error Handling

**Common Errors:**

**"Character not found"**
- Cause: Character name doesn't match database exactly
- Solution: Use full name with prefix: "E - Ashe Motoko"
- Check: Copy exact name from database

**"API rate limit exceeded"**
- Cause: Too many requests too quickly
- Solution: Tool automatically retries with backoff
- Wait: Usually resolves in 5-10 seconds

**"Database not found"**
- Cause: DATABASE_IDS incorrect
- Solution: Run verify_actual_schemas.py
- Check: Database IDs haven't changed

**"SSL certificate error"**
- Cause: Network SSL verification issue
- Solution: Tools use `verify=False` (already handled)
- Note: No action needed, tools configured correctly

### Running Tools

**From skill directory:**
```bash
cd /mnt/skills/user/about-last-night-notion/scripts/
python bird_eye_analysis_v2.py
```

**With character names:**
- Always include cluster prefix: "E -", "R -", "P -", "S -"
- Use exact capitalization
- Include full name: "E - Ashe Motoko" not "Ashe"

**Output:** All tools print to stdout. Redirect to file if needed:
```bash
python bird_eye_analysis_v2.py > analysis.txt
```

---

## Tool Combinations & Workflows

### Pattern 1: Thread Wiring Session

```bash
# 1. Get system overview
python bird_eye_analysis_v2.py

# 2. For characters with unwired tokens
python character_element_coverage.py "S - Sarah Blackwood"

# 3. Read token content
python examine_token_content.py "SAB002"

# 4. Assign thread in Notion based on narrative-threads.md

# 5. Verify progress
python check_token_threads.py
```

### Pattern 2: Gap Assessment

```bash
# 1. System overview
python bird_eye_analysis_v2.py

# 2. Find unwired content first
python thread_orphan_detection.py

# 3. Check specific character coverage
python character_element_coverage.py "P - Oliver Sterling"

# 4. If truly gap, run design context
python token_design_context_generator.py "P - Oliver Sterling"
```

### Pattern 3: Character Audit

```bash
# 1. Character wiring issues
python character_wiring_audit.py "E - Ashe Motoko"

# 2. Timeline participation
python character_analysis_enhanced.py "E - Ashe Motoko"

# 3. Trust pair validation
python trust_pair_verification.py "E - Ashe Motoko" "E - Alex Reeves"

# 4. Complete coverage
python character_element_coverage.py "E - Ashe Motoko"
```

### Pattern 4: Evidence Validation

```bash
# 1. Timeline gaps
python timeline_evidence_gaps.py

# 2. Character background check
python character_background_cross_reference.py "R - Derek Thorne"

# 3. Specific trust pairs
python trust_pair_verification.py "R - Derek Thorne" "E - Diana Nilsson"
```

---

## Troubleshooting

### Tool Runs Forever

**Symptom:** Tool doesn't return, seems stuck

**Causes:**
- Rate limiting (will resolve automatically)
- Large database query (bird_eye takes 60-90 seconds)
- Network issues

**Solutions:**
- Wait 2 minutes for rate limit backoff
- Check if specific database query is slow
- Verify network connectivity

### Character Name Not Found

**Symptom:** "Character not found" error

**Causes:**
- Name doesn't match exactly
- Missing cluster prefix
- Wrong capitalization

**Solutions:**
- Copy exact name from Notion database
- Include prefix: "E - Ashe Motoko"
- Check capitalization: "Motoko" not "motoko"

### Wrong Output Format

**Symptom:** Output doesn't match examples

**Causes:**
- Database schema changed
- Tool version mismatch
- Missing fields

**Solutions:**
- Run verify_actual_schemas.py
- Check if fields exist in database
- Review DATABASE_SCHEMAS.md for expected structure

### Slow Performance

**Symptom:** Tools take very long

**Causes:**
- Large database (many elements)
- Network latency
- Rate limiting active

**Expected Times:**
- bird_eye_analysis: 60-90 seconds (normal)
- character tools: 5-15 seconds (normal)
- Quick checks: <5 seconds (normal)

If significantly slower, check network connection.

---

## Quick Reference Table

| Tool | Time | Arguments | Primary Use |
|------|------|-----------|-------------|
| bird_eye_analysis_v2.py | 60-90s | None | System overview, identify gaps |
| character_element_coverage.py | 5-15s | Character name | Check ALL owned elements |
| token_design_context_generator.py | 10-15s | Character name | Get design context |
| thread_orphan_detection.py | 60-90s | None | Find unwired content |
| timeline_evidence_gaps.py | 15-20s | None | Events without elements |
| trust_pair_verification.py | 5s | Two character names | Shared events check |
| character_analysis_enhanced.py | 10s | Character name | Timeline participation |
| examine_token_content.py | <5s | Element search term | Read element content |
| wire_element.py | <5s | Element name, thread | Wire single element |
| batch_wire_elements.py | 3-5s/elem | CSV file | Wire multiple elements |
| character_wiring_audit.py | 15-20s | Character name | Deep character audit |
| element_character_wiring_gaps.py | 45-60s | None | Find orphaned mentions |
| character_background_cross_reference.py | 10s | Character name | Sheet validation |
| check_token_threads.py | 5s | None | Quick wiring status |
| get_tier_distribution.py | <5s | None | Tier counts |
| query_all_rollups.py | 30s | None | Rollup formulas |
| verify_actual_schemas.py | 20-30s | None | Schema validation |

---

This tool guide provides complete documentation for all 18 scripts. For workflow guidance on using tools together, see WORKFLOWS.md.
