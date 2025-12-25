---
name: journalist-report
description: |
  Generate NovaNews investigative articles from "About Last Night" game sessions.
  Use when: (1) User provides orchestrator report or asks to generate article,
  (2) Writing post-show reports in Nova's voice, (3) Processing session evidence
  into narrative journalism. Triggers on: "generate report", "write article",
  "NovaNews", "journalist report", or ALN session data with token IDs/shell accounts.
---

# NovaNews Article Generation

Multi-phase workflow generating investigative articles from ALN session data with user collaboration at key decision points.

## Architecture Overview

**Design Principles:**
- Deterministic data gathering (scripts, not agent inference)
- Structured intermediate outputs (JSON, not prose)
- Progressive prompt loading (only what's needed per phase)
- User checkpoints at high-leverage decisions
- Single generation pass from approved outline
- **Parallel subagents for independent work** (image analysis, validation)

**Phase Summary:**
```
Phase 1: DATA GATHERING → evidence_bundle
         └── 1.6: PARALLEL SUBAGENTS analyze images concurrently
Phase 2: ARC ANALYSIS → arc_analysis (JSON) → ★ USER SELECTS ARCS
         └── 2.1: PARALLEL SPECIALISTS (financial, behavioral, victimization)
Phase 3: OUTLINE → article_outline (JSON) → ★ USER APPROVES
Phase 4: GENERATION → article HTML
Phase 5: VALIDATION → final HTML
         └── VALIDATION SUBAGENT checks anti-patterns
```

**Subagent Strategy:**

| Phase | Subagent | Why |
|-------|----------|-----|
| 1.6 Image Analysis | `journalist-image-analyzer` | Parallel visual inspection, game world context pre-loaded |
| 1.8 Evidence Bundle | `journalist-evidence-curator` | Context isolation, writes summary for checkpoint |
| 2 Arc Analysis | `journalist-arc-analyzer` | Director observations + whiteboard drive selection |
| 2.1 Financial | `journalist-financial-specialist` | Transaction patterns, timing clusters, account analysis |
| 2.1 Behavioral | `journalist-behavioral-specialist` | Character dynamics, zero-footprint analysis |
| 2.1 Victimization | `journalist-victimization-specialist` | Targeting patterns, operator/victim analysis |
| 3 Outline | `journalist-outline-generator` | Placement decisions, writes summary for approval |
| 4 Generation | `journalist-article-generator` | Quality prose, full reference file loading |
| 5 Validation | `journalist-article-validator` | Isolated anti-pattern checking, returns structured issues |

**Custom Agents (defined in `.claude/agents/`):**

| Agent | Model | Tools | Purpose |
|-------|-------|-------|---------|
| `journalist-image-analyzer` | Sonnet | Read | Visual analysis of session photos & Notion documents |
| `journalist-evidence-curator` | Sonnet | Read, Write | Build three-layer evidence bundle from raw data |
| `journalist-arc-analyzer` | Opus | Read, Write | Maximum analysis with director observations driving arc selection |
| `journalist-financial-specialist` | Sonnet | Read | Transaction patterns, account analysis, timing clusters |
| `journalist-behavioral-specialist` | Sonnet | Read | Character dynamics, director observations, zero-footprint analysis |
| `journalist-victimization-specialist` | Sonnet | Read | Targeting patterns, operator/victim analysis, self-burial |
| `journalist-outline-generator` | Sonnet | Read, Write | Create outline with evidence/photo placements |
| `journalist-article-generator` | Opus | Read, Write | Generate final HTML with Nova's voice |
| `journalist-article-validator` | Sonnet | Read, Grep | Anti-pattern detection, voice scoring, roster coverage |

**Task Tool Usage Pattern:**
```javascript
// Phase 1.6: Parallel image analysis (one Task per image)
Task(subagent_type="journalist-image-analyzer", instruction=`
  Analyze image: {absolute-path-to-image}
  Source type: session_photo
  Session date: December 21, 2025
  Return structured JSON analysis.
`)

// Phase 2: Arc analysis via orchestrated specialists (Commit 8.9)
// Orchestrator invokes these file-based agents via Task tool
Task(subagent_type="journalist-financial-specialist", instruction=`
  Analyze financial patterns in the evidence bundle.
  Evidence data: {evidence-json-string}
  Return structured JSON with accountPatterns, timingClusters, suspiciousFlows.
`)
Task(subagent_type="journalist-behavioral-specialist", instruction=`
  Analyze behavioral patterns from director observations.
  Director notes: {director-notes-json}
  Return structured JSON with characterDynamics, behaviorCorrelations.
`)
Task(subagent_type="journalist-victimization-specialist", instruction=`
  Analyze victimization patterns in memory burial data.
  Evidence data: {evidence-json-string}
  Return structured JSON with victims, operators, selfBurialPatterns.
`)

// Phase 5: Validation
Task(subagent_type="journalist-article-validator", instruction=`
  Validate this NovaNews article against anti-patterns.
  Article HTML file: {path-to-article}
  Character roster: {comma-separated names}
  Return structured issues JSON with pass/fail status.
`)
```

---

## Error Handling

### Script Errors

**If `fetch-notion-tokens.js` fails:**
```
Error: NOTION_TOKEN not set
```
→ Check `.env` file exists with valid token
→ Verify token has access to Elements database

**If `fetch-paper-evidence.js --download` fails:**
```
Download complete:
  New: 3
  Replaced/Refreshed: 0
  Using cached: 2
  Errors: 1
```
→ Check `downloadErrors` array in JSON output for specific failures
→ Use manual curl fallback (Option B) for failed files
→ If file exists locally from previous run, workflow can continue

### Subagent Errors

**If image analyzer returns error or empty response:**
1. Check image path is absolute and file exists
2. Retry with fresh Task invocation
3. If persistent failure, skip image and note in evidence_bundle:
   ```javascript
   images: {
     session_photos: [...],
     failed_analyses: ["20251221_203400.jpg - subagent timeout"]
   }
   ```
4. Inform user which images couldn't be analyzed

**If validator subagent fails:**
1. Retry once with fresh Task invocation
2. If persistent, fall back to manual validation checklist:
   - Search for `—` (em-dash)
   - Search for "token" / "tokens"
   - Search for "Act 3", "final call"
   - Verify all roster names appear
   - Check CLOSING for systemic critique

### Partial Failures

**If some downloads succeed but others fail:**
- Continue with successfully downloaded images
- Document missing images in evidence_bundle
- Inform user: "X of Y images available for analysis"
- User can decide to proceed or retry

**If some photo analyses fail:**
- Continue with successful analyses
- Present partial results at character ID checkpoint
- Mark failed photos as "analysis pending" in table

---

## Phase 1: Data Gathering (Deterministic)

No prompt files needed. This phase uses scripts to collect all evidence.

### 1.1 Gather Session Inputs (HARD GATE)

**REQUIRED inputs - STOP AND ASK if not provided:**
- **Character roster** - Who was present (list of first names)
- **Murder accusation** - Who the group blamed
- **Session photos path** - Directory containing session photos
- **Director notes** - Observations from game director AND whiteboard content

**Optional inputs (ask if not provided, but can proceed without):**
- **Journalist first name** - Default: Cassandra

**CRITICAL:** If any REQUIRED input is missing, use AskUserQuestion immediately:

```javascript
AskUserQuestion({
  questions: [{
    header: "Required",
    question: "I need the following to proceed. Please provide:",
    multiSelect: false,
    options: [
      { label: "I have this info", description: "Ready to provide orchestrator report and session details" },
      { label: "Missing orchestrator report", description: "Need guidance on what to include" },
      { label: "Missing session photos", description: "Need the folder path for session photos" },
      { label: "Missing director notes", description: "Need whiteboard photo or director observations" }
    ]
  }]
})
```

**DO NOT proceed to Phase 1.2 without: roster, accusation, photos path, and director notes.**

### 1.2 Parse Orchestrator Report and Director Notes (HARD GATE)

**CRITICAL: The orchestrator report contains evidence lists. Director notes contain the INTERPRETIVE LENS.**

#### 1.2.1 Parse Orchestrator Data

Extract from orchestrator text:
```javascript
{
  exposed_tokens: ["jam001", "alr001", ...],  // Token IDs brought to Detective
  buried_tokens: [
    { token_id: "mor021", amount: 150000, shell_account: "Offbeat" },
    ...
  ],
  shell_accounts: [
    { name: "Gorlan", total: 1125000, token_count: 5, includes_bonus: true },
    ...
  ],
  session_timestamps: { first_exposure: "...", first_burial: "...", final_call: "..." }
}
```

**Shell Account Calculation:**
- Base amount = sum of individual token sale prices
- First-token bonus = +$50,000 for FIRST token to each account
- Total = base + bonus

#### 1.2.2 Analyze Director Notes (CRITICAL - TWO-LAYER HIERARCHY)

**Director notes contain TWO sections with DIFFERENT weights:**

### `observations` - PRIMARY WEIGHT (Human Director's Ground Truth)

The director watched the entire session and recorded what actually happened. These observations are **authoritative** and should be used to:
- Inform interpretation of the whiteboard
- Identify character placement opportunities
- Understand relationship dynamics that played out
- Capture moments that never made it to the whiteboard

**What to extract:**
- **Behavioral patterns** - Who interacted with whom, relationship evolutions
- **Suspicious correlations** - Pseudonym discoveries, account patterns
- **Notable moments** - Specific timestamps, dramatic moments worth featuring

### `whiteboard` - INTERPRETED THROUGH DIRECTOR CONTEXT (Player Conclusions)

The whiteboard is AI-transcribed from a photo and shows what PLAYERS concluded. It drives arc PRIORITIZATION but should be interpreted through the lens of director observations.

**What to extract:**
- **SUSPECTS identified** - Who did the group call out? Note emphasis (circled, starred)
- **Evidence connections** - What links did they draw between characters/events?
- **Facts established** - What did the group determine as proven?
- **Key quotes/phrases** - Exact wording the group used (e.g., "permanent solution")

**Transcribe key sections verbatim.** The group's language matters.

**STOP AND ASK** if director notes or whiteboard photo are not provided:

```javascript
AskUserQuestion({
  questions: [{
    header: "Director Notes",
    question: "Do you have the director observations and whiteboard content from this session?",
    multiSelect: false,
    options: [
      { label: "Yes - both observations and whiteboard", description: "I have director notes and whiteboard photo/transcription" },
      { label: "Yes - observations only", description: "Director notes but no whiteboard captured" },
      { label: "Yes - whiteboard only", description: "Whiteboard photo but no written observations" },
      { label: "Neither available", description: "Will need to infer focus from evidence alone (not recommended)" }
    ]
  }]
})
```

**Save to director_notes structure:**
```javascript
{
  // OBSERVATIONS - director's authoritative notes (PRIMARY WEIGHT)
  observations: {
    behaviorPatterns: [
      "Taylor and Diana interacted with Valet early together, then separately later (falling out?)",
      "James NEVER spoke to Blake despite Blake's efforts to establish rapport",
      "Kai spotted doing last-minute transactions while others monitored shell accounts"
    ],
    suspiciousCorrelations: [
      "ChaseT account = Taylor Chase's pseudonym (Taylor's last name is Chase)",
      "Victoria and Morgan appeared to be colluding throughout the investigation"
    ],
    notableMoments: [
      "Kai's last transaction at 11:49 PM while being watched"
    ]
  },
  // WHITEBOARD - player conclusions (interpreted through observations above)
  whiteboard: {
    suspects: ["Derek (heavily emphasized)", "Victoria", "Morgan"],
    evidenceConnections: [
      "Victoria + Morgan → 'permanent solution' to Marcus's criminal liability",
      "Alex: got offer from Black Market",
      "James: saw Marcus enter secret room"
    ],
    factsEstablished: [
      "Memory tokens return if not purchased",
      "Stanford glow rave 4: Sofia, Diana (2009), Derek, Marcus"
    ],
    keyPhrases: ["permanent solution", "criminal liability"]
  },
  accusationContext: {
    accused: "Victoria and Morgan",
    reasoning: "Group concluded they colluded on 'permanent solution'"
  }
}
```

**CRITICAL PRINCIPLE:**
- **Director observations = PRIMARY weight** (ground truth from human director who saw everything)
- **Whiteboard = interpreted THROUGH director observations** (player conclusions, may have transcription errors)
- Layer 3 DRIVES arc selection in Phase 2. Collect this data thoroughly now.

### 1.3 Fetch Memory Token Data

Run the fetch script with exposed token IDs, **saving to file** to avoid truncation:
```bash
node scripts/fetch-notion-tokens.js \
  --token-ids=jam001,alr001,... \
  --pretty \
  --output=data/{session-date}/fetched/tokens.json
```

This saves the complete token data to a JSON file. Read the file to access token details:
- `fullDescription` - The narrative memory content
- `summary` - Brief summary (SF_Summary)
- `valueRating` - 1-5 importance rating
- `owners` - Character name(s)

**CRITICAL:** Always use `--output` flag to avoid stdout truncation in CLI environments.

### 1.4 Fetch Paper Evidence

Run the fetch script, **saving to file** to avoid truncation:
```bash
node scripts/fetch-paper-evidence.js \
  --pretty \
  --with-files \
  --output=data/{session-date}/fetched/paper-evidence.json
```

This fetches ALL Props/Documents from Notion (typically 50+ items). Not all are unlocked every session.

### ★ USER CHECKPOINT: Paper Evidence Selection (HARD GATE)

**Why this checkpoint exists:** Unlike memory tokens (which have exposed/buried lists in the orchestrator report), paper evidence unlocks vary by session based on which puzzles players solved and documents they discovered. The director must indicate which items were actually unlocked.

**Step 1: Present the full list to the user**

Read `fetched/paper-evidence.json` and display ALL items in a reviewable format:

```
PAPER EVIDENCE AVAILABLE (53 items total)
==========================================

Props (physical items):
  [ ] Cease & Desist Letter - Legal letter from Patchwork Law Firm
  [ ] NeurAI One-Pager - Company positioning document
  [ ] James One-Pager - Character background document
  [ ] Victoria <> Alex Texts - Text message screenshots
  ...

Documents (digital evidence):
  [ ] James <> Alex Emails - Email thread about algorithm
  [ ] Board Meeting Minutes - NeurAI corporate records
  [ ] Lab Access Logs - Facility entry records
  ...

Which of these were UNLOCKED during this session?
```

**Step 2: Get user selection**

```javascript
AskUserQuestion({
  questions: [{
    header: "Props",
    question: "Which PROPS were unlocked? (physical items players found)",
    multiSelect: true,
    options: [
      // Generate from fetched items where basicType == "Prop"
      { label: "Cease & Desist Letter", description: "Patchwork Law Firm" },
      { label: "NeurAI One-Pager", description: "Company doc" },
      // ... all Props
    ]
  }, {
    header: "Documents",
    question: "Which DOCUMENTS were unlocked? (digital evidence discovered)",
    multiSelect: true,
    options: [
      // Generate from fetched items where basicType == "Document"
      { label: "James <> Alex Emails", description: "Algorithm ownership" },
      { label: "Board Meeting Minutes", description: "Corporate records" },
      // ... all Documents
    ]
  }]
})
```

**Step 3: Save selection to file**

Write `inputs/selected-paper-evidence.json`:
```javascript
{
  "unlockedItems": [
    "Cease & Desist Letter",
    "NeurAI One-Pager",
    "James <> Alex Emails"
  ],
  "totalAvailable": 53,
  "totalUnlocked": 3,
  "selectedBy": "director",
  "selectedAt": "ISO timestamp"
}
```

**Step 4: Confirm before proceeding**

```
Paper Evidence Selection Complete:
- 3 of 53 items unlocked this session
- Props: Cease & Desist Letter, NeurAI One-Pager
- Documents: James <> Alex Emails

Proceed to download images for these items? [Yes / Edit selection]
```

**DO NOT proceed to Phase 1.5 without paper evidence selection confirmed.**

### 1.5 Gather & Download Visual Assets

**CRITICAL:** All images MUST be downloaded to local paths before analysis. The image analyzer subagent can only read local files, not URLs.

**Two sources of images:**

#### 1.5.1 Session Photos (director uploads)

1. Get folder path from director: `sessionphotos/{MMDDYY}/`
2. **Enumerate ALL photos** in directory:
   ```bash
   ls sessionphotos/{MMDDYY}/
   ```
3. Record the complete list with timestamps:
   ```
   Session Photos Found:
   - 20251221_194306.jpg (7:43 PM)
   - 20251221_201826.jpg (8:18 PM)
   - 20251221_202238.jpg (8:22 PM)
   - 20251221_203400.jpg (8:34 PM)
   - 20251221_205807.jpg (8:58 PM)
   - 20251221_205858.jpg (8:58 PM)
   Total: 6 photos
   ```
4. Create target directory and copy:
   ```bash
   mkdir -p assets/images/{session-date}/photos/
   cp sessionphotos/{MMDDYY}/*.jpg assets/images/{session-date}/photos/
   ```

#### 1.5.2 Notion Document Images (from paper evidence)

**Option A: Automated Download (Recommended)**

Use the `--download` flag to fetch and download in one step, **saving JSON to file**:
```bash
node scripts/fetch-paper-evidence.js \
  --pretty \
  --download \
  --output-dir=assets/images/{session-date}/notion \
  --output=data/{session-date}/paper-evidence.json
```

This will:
- Fetch all Props/Documents from Notion
- Download all file attachments to the specified directory
- Add `localPath` to each file in the JSON output
- Save complete JSON to the specified output file
- Report download progress to stderr

**Option B: Manual Download (Fallback)**

If automated download fails, use manual curl:

1. Run fetch without download, **saving to file**:
   ```bash
   node scripts/fetch-paper-evidence.js \
     --pretty \
     --with-files \
     --output=data/{session-date}/paper-evidence.json
   ```

2. **Enumerate ALL document images** from output:
   ```
   Document Images Found:
   - patchworklawfirm.png (Cease & Desist Letter)
   - neuraionepager.png (NeurAI one-pager)
   - jamesonepager.png (James one-pager)
   - vic_alex_texts.png (Victoria <> Alex texts)
   - sarahtext.png (Sarah <> Rachel texts)
   Total: 5 document images
   ```

3. Create target directory:
   ```bash
   mkdir -p assets/images/{session-date}/notion/
   ```

4. **Download each image** (URLs expire in ~1 hour):
   ```bash
   curl -o "assets/images/{session-date}/notion/patchworklawfirm.png" "{notion-url}"
   curl -o "assets/images/{session-date}/notion/neuraionepager.png" "{notion-url}"
   # ... repeat for each document image
   ```

**Verify downloads (both options):**
```bash
ls -la assets/images/{session-date}/notion/
```

#### 1.5.3 Pre-Analysis Verification Checkpoint

Before proceeding to analysis, confirm:
```
Visual Assets Summary:
- Session photos: {N} files in assets/images/{date}/photos/
- Document images: {N} files in assets/images/{date}/notion/
- Total images to analyze: {N}

All files confirmed downloaded: YES/NO
```

**DO NOT proceed to Phase 1.6 until all images are downloaded locally.**

### 1.6 Visual Inspection & Analysis (PARALLEL SUBAGENTS)

**CRITICAL:** Analyze ALL images enumerated in Phase 1.5. Do not skip any.

**Prerequisites:**
- All images downloaded to local paths (Phase 1.5 complete)
- Image count verified: {N} session photos + {N} document images = {N} total

#### 1.6.1 Analyze ALL Session Photos

Launch one Task per session photo. **ALL photos in a single message block** for parallel execution:

```
Task(subagent_type="journalist-image-analyzer", instruction=`
  Analyze image: {absolute-path}/assets/images/20251221/photos/20251221_194306.jpg
  Source type: session_photo
  Session date: December 21, 2025
  Return structured JSON analysis.
`)

Task(subagent_type="journalist-image-analyzer", instruction=`
  Analyze image: {absolute-path}/assets/images/20251221/photos/20251221_201826.jpg
  Source type: session_photo
  Session date: December 21, 2025
  Return structured JSON analysis.
`)

// ... ONE TASK PER PHOTO - do not omit any
```

#### 1.6.2 Analyze ALL Document Images

Launch one Task per document image. **ALL documents in a single message block** for parallel execution:

```
Task(subagent_type="journalist-image-analyzer", instruction=`
  Analyze image: {absolute-path}/assets/images/20251221/notion/patchworklawfirm.png
  Source type: notion_document
  Document context: Cease & Desist letter from Patchwork Law Firm
  Session date: December 21, 2025
  Return structured JSON analysis.
`)

Task(subagent_type="journalist-image-analyzer", instruction=`
  Analyze image: {absolute-path}/assets/images/20251221/notion/neuraionepager.png
  Source type: notion_document
  Document context: NeurAI company one-pager
  Session date: December 21, 2025
  Return structured JSON analysis.
`)

// ... ONE TASK PER DOCUMENT - do not omit any
```

#### 1.6.3 Post-Analysis Verification

After all subagents return, verify complete coverage:

```
Analysis Complete:
- Session photos analyzed: {N} of {N} ✓
- Document images analyzed: {N} of {N} ✓
- Total analyses: {N}

Missing analyses: NONE / [list any missing]
```

**DO NOT proceed to Phase 1.7 until all images are analyzed.**

**Each subagent returns structured JSON:**
```javascript
{
  filename: "20251221_194306.jpg",
  source: "session_photo",
  visual_content: "Group of 4-5 people huddled on couch examining documents...",
  narrative_moment: "early_investigation",
  suggested_caption: "The investigation begins: partygoers piece together the first clues",
  relevant_arcs: ["collaborative_investigation"],
  placement_notes: "Would work well in THE STORY opening or LEDE"
}
```

**Why parallel subagents:**
- 6+ images per session = significant time savings
- Each image analysis is independent (no shared state)
- Consistent game world context pre-loaded in agent
- Structured JSON output for downstream phases

### 1.7 Character Identification Checkpoint (USER COLLABORATION)

**CRITICAL:** Present ALL session photos to director for character identification. Do not skip any.

The image analyzer describes WHAT it sees but cannot identify WHO specific individuals are.
The director knows the players and can name them, enabling personalized captions.

**Prerequisites:**
- All {N} session photos analyzed in Phase 1.6
- Analysis results collected for each photo

#### 1.7.1 Present Complete Photo Table

Display ALL photos with their analysis. Use a table format to ensure complete coverage:

```
| # | Filename | Time | Location | Analysis Summary | Characters? |
|---|----------|------|----------|------------------|-------------|
| 1 | 20251221_194306.jpg | 7:43 PM | ? | 5 people on couch examining folders | ? |
| 2 | 20251221_201826.jpg | 8:18 PM | ? | 2 people exchanging items | ? |
| 3 | 20251221_202238.jpg | 8:22 PM | ? | Person at table with boxes | ? |
| 4 | 20251221_203400.jpg | 8:34 PM | ? | [from analysis] | ? |
| 5 | 20251221_205807.jpg | 8:58 PM | ? | Group at whiteboard | ? |
| 6 | 20251221_205858.jpg | 8:58 PM | ? | [from analysis] | ? |

Total photos requiring identification: 6
```

**Then visually display each photo** using the Read tool so director can see and identify.

#### 1.7.2 Use AskUserQuestion for Each Photo

**For each photo, display it first, then use structured questions:**

```javascript
// Display photo first using Read tool, then:
AskUserQuestion({
  questions: [{
    header: "Characters",
    question: "Who can you identify in photo 20251221_194306.jpg (7:43 PM)?",
    multiSelect: true,
    options: [
      // All roster members as options
      { label: "Morgan", description: "" },
      { label: "Oliver", description: "" },
      { label: "Victoria", description: "" },
      { label: "James", description: "" },
      { label: "Taylor", description: "" },
      // ... full roster
      { label: "Cassandra Nova (NPC)", description: "Journalist character" }
    ]
  }, {
    header: "Location",
    question: "Where was this photo taken?",
    multiSelect: false,
    options: [
      { label: "Room 1 - Party Space", description: "Main gathering area" },
      { label: "Room 2 - Marcus's Workshop", description: "Investigation room" },
      { label: "Valet Station", description: "Black Market area" }
    ]
  }]
})
```

**For efficiency with multiple photos**, batch up to 4 questions per call:
```javascript
AskUserQuestion({
  questions: [
    { header: "Photo 1", question: "194306.jpg (7:43 PM) - Who's in it?", multiSelect: true, options: [...roster] },
    { header: "Photo 2", question: "201826.jpg (8:18 PM) - Who's in it?", multiSelect: true, options: [...roster] },
    { header: "Photo 3", question: "202238.jpg (8:22 PM) - Who's in it?", multiSelect: true, options: [...roster] },
    { header: "Photo 4", question: "203400.jpg (8:34 PM) - Who's in it?", multiSelect: true, options: [...roster] }
  ]
})
// Then follow up with location questions or second batch of photos
```

#### 1.7.3 Verification & Update

After director provides IDs, verify complete coverage:

```
Character ID Complete:
- Photos with IDs: 6 of 6 ✓
- Location corrections applied: [list any]
- NPCs noted: [e.g., Cassandra Nova]

All photos accounted for: YES/NO
```

Update each image analysis with:
- `identified_characters`: [...names...]
- `location_corrected`: "Room 2 - Marcus's Workshop" (if corrected)
- `final_caption`: Updated with character names

**Why this checkpoint matters:**
- Generic "investigators" language feels impersonal
- Named characters connect photos to narrative arcs
- Location corrections prevent factual errors
- Director context enriches captions ("Taylor was explaining her alibi here")

**Skip conditions:**
- Director unavailable: Use generic descriptions ("investigators", "partygoers")
- Time pressure: Prioritize key photos (deliberation, accusation) for identification
- NEVER skip the enumeration step - always list all photos even if some remain unidentified

### 1.8 Build Evidence Bundle (EVIDENCE-CURATOR SUBAGENT)

**DO NOT read raw token/evidence files directly.** Use the curator subagent for context isolation.

**CRITICAL ARCHITECTURE:** The evidence bundle uses a three-layer model that enforces privacy boundaries through structure.

| Layer | Contains | Journalist Can |
|-------|----------|----------------|
| **EXPOSED** | Full memory content, paper evidence | Quote, describe, draw conclusions |
| **BURIED** | Transaction data ONLY (amounts, accounts, timing, who) | Report patterns, NOT content |
| **DIRECTOR** | Observations (primary) + whiteboard (interpreted) | Shape emphasis and focus |

**Invoke the curator subagent:**

```
Task(subagent_type="journalist-evidence-curator", prompt=`
  Session: 20251221
  Session data directory: data/20251221/

  Build three-layer evidence bundle from these input files:

  FETCHED DATA:
  - fetched/tokens.json (all memory tokens from Notion)
  - fetched/paper-evidence.json (all props/documents from Notion)

  USER INPUTS:
  - inputs/orchestrator-parsed.json (exposed/buried token lists)
  - inputs/selected-paper-evidence.json (unlocked items from checkpoint 1.4)
  - inputs/director-notes.json (observations + whiteboard)
  - inputs/character-ids.json (photo identifications)
  - inputs/session-config.json (roster, accusation, journalist name)

  ANALYSIS:
  - analysis/image-analyses-combined.json (image analysis results)

  FILTERING RULES:
  - Memory tokens: Include only those in orchestrator-parsed.json exposedTokens list
  - Paper evidence: Include only those in selected-paper-evidence.json unlockedItems list

  Write to:
  - analysis/evidence-bundle.json (full curated data)
  - summaries/evidence-summary.json (checkpoint review format)

  Return concise summary for checkpoint presentation.
`)
```

**After subagent returns:**
1. Read `summaries/evidence-summary.json` (small, for checkpoint presentation)
2. Present summary to user (DO NOT read the full evidence-bundle.json)
3. Get user approval before proceeding

**Privacy enforcement:** Buried token CONTENTS are never included in the bundle. The structure itself makes privacy violation impossible.

**See `references/schemas.md`** for the complete evidence bundle and summary JSON structures.

**See `references/prompts/evidence-boundaries.md`** for detailed rules on what can/cannot be reported from each layer.

### ★ USER CHECKPOINT: Evidence Bundle Review

**CRITICAL:** Review all enrichments before proceeding. Errors here propagate into arcs, outline, and final article.

Present the evidence bundle to user, highlighting ENRICHMENTS that need verification:

> **EVIDENCE BUNDLE REVIEW**
>
> **Memory Tokens (exposed):**
> | Token | Owner | Summary | Value | Narrative Relevance |
> |-------|-------|---------|-------|---------------------|
> | alr001 | Alex | Algorithm theft proof | 4/5 | ⚠️ VERIFY: "IP theft origin story" |
> | jam001 | James | NeurAI founding docs | 3/5 | ⚠️ VERIFY: "Corporate founding" |
> | ... | ... | ... | ... | ... |
>
> **Paper Evidence (unlocked):**
> | Document | Owner | Narrative Relevance |
> |----------|-------|---------------------|
> | Cease & Desist Letter | Alex | ⚠️ VERIFY: "Legal documentation of IP dispute" |
> | NeurAI One-Pager | Company | ⚠️ VERIFY: "Corporate positioning" |
> | ... | ... | ... |
>
> **Session Photos (with character IDs):**
> | Photo | Characters | Narrative Moment | Caption |
> |-------|------------|------------------|---------|
> | 194306.jpg | Morgan, Oliver, Victoria, James | early_investigation | ⚠️ VERIFY caption |
> | ... | ... | ... | ... |
>
> **Buried Evidence (content unknown, amounts known):**
> | Shell Account | Amount | Token Count | Inferred Thread |
> |---------------|--------|-------------|-----------------|
> | Gorlan | $1,125,000 | 5 | ⚠️ VERIFY: "Funding & Espionage" |
> | ... | ... | ... | ... |
>
> **Please review:**
> 1. Are the narrative relevance assignments correct?
> 2. Any character misattributions in photos?
> 3. Any buried evidence thread inferences that seem wrong?
> 4. Anything that should be removed from the article?

**Use AskUserQuestion for structured approval:**

**Stage 1: High-level approval**
```javascript
AskUserQuestion({
  questions: [{
    header: "Bundle",
    question: "I've built the evidence bundle with narrative relevance assignments. Review the summary above. How should we proceed?",
    multiSelect: false,
    options: [
      { label: "Approve all (Recommended)", description: "Enrichments look correct, proceed to arc analysis" },
      { label: "I have corrections", description: "Some narrative relevance or character assignments need fixing" },
      { label: "Remove items", description: "Some evidence should be excluded from the article" }
    ]
  }]
})
```

**Stage 2 (if user selects "I have corrections"):**
```javascript
AskUserQuestion({
  questions: [{
    header: "Corrections",
    question: "Which items need correction?",
    multiSelect: true,
    options: [
      // Dynamically generated from evidence bundle
      { label: "alr001 - narrative relevance", description: "Currently: 'IP theft origin story'" },
      { label: "Photo 194306 - characters", description: "Currently: Morgan, Oliver, Victoria, James" },
      { label: "Gorlan account - thread inference", description: "Currently: 'Funding & Espionage'" },
      // ... one option per enriched item
    ]
  }]
})
// Then ask for the corrected values for each selected item
```

**After approval**, finalize evidence_bundle and proceed to Phase 2.

**Why this checkpoint matters:**
- Wrong narrative relevance → wrong arc assignments → wrong article structure
- Character misattribution → factually incorrect captions
- Bad thread inference → misleading buried evidence section
- Catching errors HERE prevents compounding through all subsequent phases

**After approval, finalize evidence_bundle and proceed to Phase 2.**

---

## Phase 2: Arc Analysis (ARC-ANALYZER SUBAGENT)

**DO NOT read evidence-bundle.json directly.** Use the analyzer subagent for context isolation.

**CRITICAL PRINCIPLE: Director Observations + Whiteboard DRIVE Arc Selection**

The arc analyzer uses a two-layer hierarchy within Layer 3:

```
WRONG (evidence-first):
  1. Analyze all exposed evidence
  2. Identify arcs by evidence volume
  3. Rate by "strength" (how much evidence)
  4. Present to user

CORRECT (director-informed, player-focused):
  1. Read director OBSERVATIONS first - ground truth from human who watched session
  2. Read WHITEBOARD through lens of observations - what did PLAYERS conclude?
  3. Mine ALL observations for character placement opportunities
  4. Identify arcs that match PLAYER focus (from whiteboard)
  5. Support arcs with Layer 1 evidence
  6. Present arcs in order of PLAYER EMPHASIS, not evidence volume
  7. Ensure EVERY roster member has placement opportunity
```

**The article tells the story of THIS GROUP'S investigation, not a generic evidence summary.**

### 2.1 Invoke Arc Analyzer Subagent

```
Task(subagent_type="journalist-arc-analyzer", prompt=`
  Session: 20251221

  Analyze narrative arcs with DIRECTOR OBSERVATIONS as PRIMARY weight.

  Read from session data directory:
  - inputs/session-config.json (roster - READ FIRST)
  - inputs/director-notes.json (observations PRIMARY, whiteboard SECONDARY)
  - analysis/evidence-bundle.json (curated three-layer evidence)

  CRITICAL HIERARCHY:
  1. Director observations = PRIMARY (human ground truth)
  2. Whiteboard = interpreted THROUGH observations (player conclusions)

  Process:
  1. Load roster - every player needs placement
  2. Mine ALL director observations for character moments
  3. Read whiteboard through observation context
  4. Build arcs from player conclusions
  5. Ensure roster coverage

  Write to:
  - analysis/arc-analysis.json (full arc details with evidence mapping)
  - summaries/arc-summary.json (checkpoint review format)

  Return concise summary for checkpoint presentation.
`)
```

**After subagent returns:**
1. Read `summaries/arc-summary.json` (small, for checkpoint presentation)
2. Present arc options to user with PLAYER EMPHASIS highlighted
3. Get user arc selections before proceeding

### 2.2 Arc Analysis Output

The subagent writes to `analysis/arc-analysis.json` with:
- `sessionRoster` - Who actually played (from session-config.json)
- `directorObservationsSummary` - Key observations used
- `narrativeArcs[]` - Each arc with name, evidence, **playerEmphasis** (HIGH/MEDIUM/LOW), **directorObservationSupport**
- `characterPlacementOpportunities` - How to feature each roster member
- `photoNarrativeMoments` - Photos connected to director observations
- `imageAnalysis` - Hero image selection, photo/document placements
- `financialSummary` - Buried totals, suspicious patterns
- `rosterCoverage` - Who's featured, mentioned, needs placement (distinguishes roster from evidence-only characters)

**See `references/schemas.md`** for the complete arc_analysis and arc_summary structures.

### ★ USER CHECKPOINT: Arc Selection

Present arcs to user, then use AskUserQuestion for structured selection:

> "I've identified these narrative arcs from the evidence:
>
> 1. **Victoria + Morgan Collusion** (Player Emphasis: HIGH) - Director observed collusion throughout...
> 2. **IP Theft Trail** (Player Emphasis: HIGH) - Whiteboard connections to Alex's algorithm...
> 3. **Derek's Emphasized Role** (Player Emphasis: HIGH) - Heavily emphasized on whiteboard...
> 4. **The Black Market Threat** (Player Emphasis: HIGH) - ChaseT = Taylor Chase...
> 5. **Shell Account Conspiracy** (Player Emphasis: MEDIUM) - $4M across 6 accounts...
> [etc.]
>
> **Character Placement Opportunities:**
> - Diana: Early Taylor collab that dissolved, Derek standoff in photo
> - Kai: Late-game Black Market activity at 11:49 PM
> - James: Avoided Blake throughout (director observed)
>
> **Visual assets available:**
> - 6 session photos (early investigation, Black Market station, final deliberation)
> - 3 document images (NeurAI one-pager, James one-pager, law firm letterhead)"

**Use AskUserQuestion for arc and photo selection:**

```javascript
AskUserQuestion({
  questions: [{
    header: "Arcs",
    question: "Which narrative arcs should the article emphasize? Select 3-5.",
    multiSelect: true,
    options: [
      // Dynamically generated from arc_analysis, player emphasis first
      { label: "Victoria + Morgan Collusion (Recommended)", description: "HIGH emphasis - director observed collusion" },
      { label: "IP Theft Trail", description: "HIGH emphasis - whiteboard connections" },
      { label: "Derek's Emphasized Role", description: "HIGH emphasis - heavily emphasized" },
      { label: "The Black Market Threat", description: "HIGH emphasis - ChaseT discovery" },
      // ... one option per identified arc
    ]
  }, {
    header: "Hero Photo",
    question: "Which photo should be the hero image?",
    multiSelect: false,
    options: [
      // Dynamically generated from image_analysis
      { label: "205807.jpg - Deliberation (Recommended)", description: "Final accusation at whiteboard" },
      { label: "194306.jpg - Investigation", description: "Early clue-gathering on couch" },
      { label: "202238.jpg - Transaction", description: "Valet station activity" }
    ]
  }]
})
```

**After selection**, update arc_analysis with user choices:
- `selected_arcs`: User's 3-5 arc selections
- `hero_image_confirmed`: User's hero photo choice
- `excluded_photos`: Any photos user wanted omitted

Record selection and proceed to Phase 3.

---

## Phase 3: Outline Creation (OUTLINE-GENERATOR SUBAGENT)

**DO NOT create the outline manually.** Use the outline-generator subagent.

### 3.1 Record User Arc Selections

After user selects arcs in checkpoint 2, update `arc-analysis.json` with:
```javascript
{
  userSelections: {
    selectedArcs: ["Victoria + Morgan Collusion", "IP Theft Trail"],
    heroImageConfirmed: "20251221_205807.jpg",
    photoPreferences: { exclude: [], feature: [] }
  }
}
```

### 3.2 Invoke Outline Generator Subagent

```
Task(subagent_type="journalist-outline-generator", prompt=`
  Session: 20251221

  Generate article outline from approved arcs.

  Read from session data directory:
  - analysis/arc-analysis.json (with userSelections)
  - analysis/evidence-bundle.json (for evidence details)

  The userSelections field contains the arcs the user approved.

  Write to:
  - analysis/article-outline.json (full outline with all placements)
  - summaries/outline-summary.json (checkpoint review format)

  Return concise summary for checkpoint presentation.
`)
```

**After subagent returns:**
1. Read `summaries/outline-summary.json` (small, for checkpoint presentation)
2. Present outline structure to user
3. Get user approval before proceeding to generation

### 3.3 Outline Output

The subagent produces `article_outline` with:
- `lede` - Hook and key tension (pure prose, no evidence cards)
- `theStory` - Arc sequence with evidence card and photo placements
- `followTheMoney` - Financial tracker data, suspicious patterns
- `thePlayers` - Who exposed vs who buried, pull quotes
- `whatsMissing` - Buried evidence markers, inference text
- `closing` - Systemic angle, accusation handling, final tone
- `imagePlacements` - Hero image, inline photos, evidence card images
- `visualComponentCount` - Totals for each component type

**See `references/schemas.md`** for the complete article_outline and outline_summary structures.

### ★ USER CHECKPOINT: Outline Approval

Present outline to user in readable format:

> **Proposed Article Structure:**
>
> **HERO IMAGE:** Deliberation at whiteboard (full-width above headline)
>
> **LEDE:** Marcus is dead. Victoria and Morgan accused...
>
> **THE STORY:**
> - Arc 1: IP Theft Trail (3 paragraphs, 2 evidence cards)
>   - 📷 Photo: Early investigation on couch (after para 2)
> - Arc 2: Victoria's Double Game (2 paragraphs, 1 evidence card)
> - Transition to money section
>
> **FOLLOW THE MONEY:** Financial tracker with 6 accounts, $4.06M total
> - 📷 Photo: Valet's Black Market station (near tracker)
>
> **THE PLAYERS:** Alex/James/Jamie (exposed) vs Taylor/Diana/Derek (buried)
>
> **WHAT'S MISSING:** 2 buried markers (Victoria's knowledge, Derek's lab access)
>
> **CLOSING:** Systemic critique on memory as commodity
>
> **Image Summary:** 1 hero + 2 inline photos + 1 document image in evidence card

**Use AskUserQuestion for structured approval:**

```javascript
AskUserQuestion({
  questions: [{
    header: "Outline",
    question: "Review the article outline above. How should we proceed?",
    multiSelect: false,
    options: [
      { label: "Approve and generate (Recommended)", description: "Structure looks good, proceed to article generation" },
      { label: "Adjust arc order", description: "Change the sequence of narrative arcs in THE STORY" },
      { label: "Adjust photo placement", description: "Move where photos appear in the article" },
      { label: "Adjust evidence cards", description: "Change which evidence gets highlighted" },
      { label: "Major revision needed", description: "Significant structural changes required" }
    ]
  }]
})
```

**If user selects a revision option**, ask follow-up questions:

```javascript
// Example: If "Adjust arc order" selected
AskUserQuestion({
  questions: [{
    header: "Arc Order",
    question: "What order should the arcs appear in THE STORY?",
    multiSelect: false,
    options: [
      { label: "Keep current order", description: "IP Theft Trail → Victoria's Double Game → ..." },
      { label: "Lead with Victoria", description: "Victoria's Double Game → IP Theft Trail → ..." },
      { label: "Lead with Morgan", description: "Morgan's Secret → IP Theft Trail → ..." }
      // Dynamically generated based on selected arcs
    ]
  }]
})
```

**After approval**, mark outline as approved and proceed to Phase 4.
- `user_approved`: true
- `revision_notes`: Any specific adjustments made
- `approved_at`: timestamp

User approves or requests revisions. Iterate if needed.

---

## Phase 4: Article Generation (ARTICLE-GENERATOR SUBAGENT)

**Use the article-generator subagent** for quality prose generation with fresh context.

### 4.1 Record Outline Approval

After user approves outline in checkpoint 3, update `article-outline.json` with:
```javascript
{
  userApproval: {
    approved: true,
    revisions: [],
    approvedAt: "ISO timestamp"
  }
}
```

### 4.2 Invoke Article Generator Subagent

```
Task(subagent_type="journalist-article-generator", prompt=`
  Session: 20251221

  Generate the final NovaNews article from approved outline.

  Read from session data directory:
  - analysis/article-outline.json (approved outline with all placements)
  - analysis/evidence-bundle.json (for quoting exposed evidence)

  Use template: .claude/skills/journalist-report/assets/article.html

  Write to:
  - output/article.html (complete article)
  - output/article-metadata.json (word count, components used, self-assessment)

  Return concise summary with word count and voice assessment.
`)
```

**The subagent loads these reference files internally:**
- `references/prompts/character-voice.md`
- `references/prompts/writing-principles.md`
- `references/prompts/formatting.md`
- `references/prompts/evidence-boundaries.md`
- `references/prompts/section-rules.md`

### 4.3 Output

The subagent produces:
- `output/article.html` - Complete HTML with embedded images
- `output/article-metadata.json` - Generation metadata and self-assessment

**Critical constraints enforced by subagent:**
- First-person participatory voice ("I was there when...")
- No em-dashes anywhere
- "Extracted memories" never "tokens"
- Blake suspicious but not condemned
- Systemic critique woven throughout

---

## Phase 5: Validation (VALIDATOR SUBAGENT)

**Use the `journalist-article-validator` subagent for automated checking.**

### 5.1 Invoke Validation Subagent

```
Task(subagent_type="journalist-article-validator", instruction=`
  Validate this NovaNews article against anti-patterns and voice requirements.

  Article HTML file: reports/report20251221ALL15.html

  Character roster: James, Taylor, Sarah, Kai, Rachel, Jamie, Derek, Victoria,
                    Tori, Oliver, Morgan, Jessicah, Diana, Ashe, Alex

  Check for: em-dashes, game mechanics language, vague attribution,
  voice consistency, roster coverage, systemic critique presence.

  Return structured issues JSON with pass/fail status.
`)
```

**Validator returns:**
```javascript
{
  passed: false,
  issues: [
    { type: "em_dash", line: 47, text: "Marcus—the founder", fix: "..." },
    { type: "missing_character", character: "Kai", fix: "..." }
  ],
  voice_score: 4,
  voice_notes: "Strong participatory voice...",
  roster_coverage: { featured: [...], mentioned: [...], missing: [...] },
  systemic_critique_present: true,
  blake_handled_correctly: true
}
```

### 5.2 Handle Validation Results

**If validator returns `passed: true`:** Proceed directly to 5.3 Output.

**If validator returns `passed: false`:** Present issues and use AskUserQuestion:

> **Validation Results:**
>
> **Issues Found:** 3
> | # | Type | Line | Text | Suggested Fix |
> |---|------|------|------|---------------|
> | 1 | em_dash | 47 | "Marcus—the founder" | Use period: "Marcus. The founder." |
> | 2 | token_language | 112 | "the token was exposed" | "the extracted memory was exposed" |
> | 3 | missing_character | - | Kai | Add mention in THE PLAYERS section |
>
> **Voice Score:** 4/5 - "Strong participatory voice throughout"
> **Roster Coverage:** Featured: Alex, James | Mentioned: Jamie, Rachel | Missing: Kai

**Use AskUserQuestion for handling strategy:**

```javascript
AskUserQuestion({
  questions: [{
    header: "Validation",
    question: "Validator found 3 issues (see above). How should we proceed?",
    multiSelect: false,
    options: [
      { label: "Fix all issues (Recommended)", description: "Auto-fix all detected problems and re-validate" },
      { label: "Fix critical only", description: "Fix em-dashes and game mechanics, skip minor voice issues" },
      { label: "Review individually", description: "Decide on each issue one by one" },
      { label: "Proceed anyway", description: "Accept article with known issues" }
    ]
  }]
})
```

**If user selects "Review individually":**

```javascript
AskUserQuestion({
  questions: [{
    header: "Issue 1",
    question: "Em-dash at line 47: 'Marcus—the founder'. Fix?",
    multiSelect: false,
    options: [
      { label: "Fix (Recommended)", description: "Replace with 'Marcus. The founder.'" },
      { label: "Skip", description: "Keep em-dash in this instance" }
    ]
  }, {
    header: "Issue 2",
    question: "'token' at line 112. Fix?",
    multiSelect: false,
    options: [
      { label: "Fix (Recommended)", description: "Replace with 'extracted memory'" },
      { label: "Skip", description: "Keep 'token' in this instance" }
    ]
  }]
  // Continue for remaining issues...
})
```

**After fixing**, re-run validator to confirm all selected issues resolved.

**Issue types checked:**
| Type | What It Catches |
|------|-----------------|
| `em_dash` | Em-dashes (`—` or `--`) |
| `token_language` | "token/tokens" instead of "extracted memory" |
| `game_mechanics` | "Act 3 unlock", "final call", etc. |
| `vague_attribution` | "from my notes", "sources say" |
| `missing_character` | Roster member not mentioned |
| `passive_voice` | Neutral/detached narration |
| `blake_condemned` | Blake treated as villain |

### 5.3 Output: Final HTML

Once validator returns `passed: true` (or user chooses "Proceed anyway"):

Write validated article to `reports/` directory:
```
report{YYYYMMDD}ALL{roster_count}.html
```

---

## Integration Notes

**Direct skill invocation:**
- User triggers skill with session data
- Claude follows phases 1-5
- User checkpoints via conversation
- Session photos provided as folder path

**Server integration (future):**
- Server handles Phase 1 data gathering via UI
- Server presents Phase 2/3 checkpoints via forms
- Claude handles Phase 4-5 generation
- Same reference files, different orchestration

**Image handling:**
- Notion file attachments: Download immediately (URLs expire in ~1 hour)
- Session photos: Director provides folder path (`sessionphotos/{MMDDYY}/`)
- All images cached to `assets/images/{session-date}/` before generation
- Agent visually inspects each image to generate accurate captions and placement
- Local paths used in final HTML (not Notion URLs)
