# Data Schemas

JSON structure definitions for all intermediate pipeline outputs.

> **Note:** These schemas show example data structures. For JSON Schema validation definitions, see `lib/schemas/*.schema.json`.

## Phase 1: Data Gathering Outputs

### 1.2 Orchestrator Parsed Data

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
  session_timestamps: {
    first_exposure: "...",
    first_burial: "...",
    final_call: "..."
  }
}
```

**Shell Account Calculation:**
- Base amount = sum of individual token sale prices
- First-token bonus = +$50,000 for FIRST token to each account
- Total = base + bonus

### 1.6 Image Analysis Output (Per Image)

```javascript
{
  filename: "20251221_194306.jpg",
  source: "session_photo",  // or "notion_document"
  visual_content: "Group of 4-5 people huddled on couch examining documents...",
  narrative_moment: "early_investigation",  // early_investigation|mid_session|transaction|deliberation|accusation
  suggested_caption: "The investigation begins: partygoers piece together the first clues",
  relevant_arcs: ["collaborative_investigation"],
  placement_notes: "Would work well in THE STORY opening or LEDE"
}
```

### 1.7 Preprocessed Evidence Bundle

Universal schema for batch-summarized evidence items before curation. See `lib/schemas/preprocessed-evidence.schema.json` for validation schema.

```javascript
{
  items: [{
    id: "notion-page-id",
    sourceType: "memory-token",  // or "paper-evidence"
    originalType: "Memory Token Video",  // or "Prop", "Document"
    summary: "Alex's algorithm presentation to NeurAI board",  // max 150 chars
    significance: "critical",  // critical|supporting|contextual|background
    characterRefs: ["Alex", "James"],
    ownerLogline: "Tech genius whose algorithm was stolen",
    timelineRef: "2009-2010",
    timelineContext: {
      name: "Stanford Years",
      year: "2009",
      period: "Algorithm Development"
    },
    narrativeRelevance: true,
    tags: ["financial", "relationship", "ip-theft"],
    groupCluster: "Marcus-Victoria dealings",
    sfFields: { /* structured data from SF_ fields */ }
  }],
  preprocessedAt: "2025-12-21T20:30:00Z",
  sessionId: "1221",
  playerFocus: {
    primaryInvestigation: "Who killed Marcus?",
    emotionalHook: "Betrayal among friends",
    openQuestions: ["What did Victoria know?", "Why did Morgan bury those memories?"]
  },
  stats: {
    totalItems: 47,
    memoryTokenCount: 31,
    paperEvidenceCount: 16,
    batchesProcessed: 5,
    processingTimeMs: 12500,
    significanceCounts: {
      critical: 5,
      supporting: 20,
      contextual: 15,
      background: 7
    }
  }
}
```

### 1.8 Evidence Bundle (THREE-LAYER MODEL)

The master data structure enforcing privacy boundaries through structure.

**CRITICAL:** The bundle structure ENFORCES privacy. Buried token CONTENTS are never included.

```javascript
{
  // ═══════════════════════════════════════════════════════════════
  // LAYER 1: EXPOSED EVIDENCE (Full content reportable)
  // Memories submitted to Detective = PUBLIC RECORD
  // Journalist CAN: quote, describe, draw conclusions from content
  // ═══════════════════════════════════════════════════════════════
  "exposedEvidence": {
    "memoryTokens": [
      {
        "tokenId": "alr001",
        "fullDescription": "The memory shows Alex presenting his algorithm...",
        "summary": "Alex's algorithm presentation",
        "owners": ["Alex"],
        "valueRating": "4",
        "memoryType": "Incriminating",
        "exposedBy": "James",           // WHO brought this to Detective
        "narrativeRelevance": "IP theft origin story"
      }
    ],
    "paperEvidence": [
      {
        "name": "Cease & Desist Letter",
        "description": "Legal letter from Patchwork Law Firm...",
        "owners": ["Alex"],
        "documentImage": {
          "localPath": "images/notion/patchworklawfirm.png",
          "analysis": { ... }
        },
        "narrativeRelevance": "Legal documentation of IP dispute"
      }
    ],
    "totalExposed": 31,
    "exposedTokenIds": ["alr001", "asm031", "jav042", ...]
  },

  // ═══════════════════════════════════════════════════════════════
  // LAYER 2: BURIED PATTERNS (Observable transactions only)
  // Memories sold to Black Market = PRIVATE
  // Journalist CAN: report amounts, timing, accounts, WHO buried
  // Journalist CANNOT: report what those memories contained
  // ═══════════════════════════════════════════════════════════════
  "buriedPatterns": {
    "transactions": [
      {
        "tokenId": "mor021",           // For tracking only, NOT content lookup
        "owner": "Morgan",             // WHO chose to bury (observable)
        "amount": 150000,              // $$ paid (observable)
        "shellAccount": "Offbeat",     // Account name (observable)
        "timestamp": "10:30 PM",       // When (observable)
        "sequenceNote": "First burial of the night"
      }
      // NOTE: No fullDescription, no summary, no content fields
    ],
    "shellAccounts": [
      {
        "name": "Gorlan",
        "total": 1125000,
        "tokenCount": 5,
        "includesBonus": true,
        "suspiciousPattern": null
      },
      {
        "name": "ChaseT",
        "total": 750000,
        "tokenCount": 3,
        "includesBonus": true,
        "suspiciousPattern": "Taylor's last name is Chase"
      }
    ],
    "totalBuried": 16,
    "totalBuriedValue": 4060000,
    "firstBurial": { "timestamp": "10:30 PM", "account": "Offbeat" },
    "lastBurial": { "timestamp": "11:45 PM", "account": "ChaseT" }
  },

  // ═══════════════════════════════════════════════════════════════
  // LAYER 3: DIRECTOR NOTES (Session canon - shapes article focus)
  // What the group discovered, concluded, and accused
  // ═══════════════════════════════════════════════════════════════
  "directorNotes": {
    "whiteboard": {
      "knownAttendees": ["James", "Taylor", "Sarah", ...],
      "evidenceConnections": [
        "Victoria + Morgan → 'permanent solution to Marcus's criminal liability'",
        "NeurAI founded by Stanford Four on stolen IP"
      ],
      "factsEstablished": [
        "Memory tokens return to owners if not purchased",
        "Stanford Four: Marcus, Oliver, Victoria, Morgan"
      ],
      "suspects": ["Derek (emphasized)", "Victoria", "Morgan"]
    },
    "observations": {
      "behaviorPatterns": [
        "Taylor and Diana REFUSED to purchase buried memories back",
        "Kai waited until final minutes, then buried multiple memories"
      ],
      "suspiciousCorrelations": ["ChaseT = Taylor Chase?"],
      "notableMoments": ["James NEVER spoke with Blake"]
    },
    "accusation": {
      "accused": "Victoria and Morgan",
      "reasoning": "Group concluded they colluded on 'permanent solution'"
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // SESSION CONTEXT
  // ═══════════════════════════════════════════════════════════════
  "sessionContext": {
    "sessionDate": "2025-12-21",
    "roster": ["James", "Taylor", "Sarah", ...],
    "journalistName": "Cassandra",
    "guestCount": 15
  },

  // ═══════════════════════════════════════════════════════════════
  // VISUAL ASSETS
  // ═══════════════════════════════════════════════════════════════
  "sessionPhotos": [
    {
      "filename": "20251221_194306.jpg",
      "localPath": "images/photos/...",
      "timestamp": "7:43 PM",
      "identifiedCharacters": ["Morgan", "Oliver", "Victoria", "James"],
      "location": "Room 1 Party Space",
      "narrativeMoment": "early_investigation",
      "finalCaption": "Morgan, Oliver, Victoria, and James piece together the first clues"
    }
  ],

  "bundledAt": "ISO timestamp"
}
```

### 1.8.1 Evidence Summary (Checkpoint Review Format)

Written alongside evidence-bundle.json for parent agent checkpoint presentation.

```javascript
{
  "stats": {
    "exposedTokens": 31,
    "buriedTokens": 16,
    "totalBuriedValue": 4060000,
    "paperEvidenceUnlocked": 12,
    "sessionPhotos": 6
  },
  "narrativeThreads": [
    { "name": "IP Theft", "tokenCount": 8, "keyToken": "alr001" },
    { "name": "Funding Conspiracy", "tokenCount": 5, "keyToken": "vik002" }
  ],
  "shellAccountPatterns": [
    { "account": "ChaseT", "amount": 750000, "suspicion": "Taylor's last name is Chase" }
  ],
  "photosWithCharacterIds": [
    { "filename": "194306.jpg", "characters": ["Morgan", "Oliver", "Victoria", "James"] }
  ],
  "accusation": "Victoria and Morgan",
  "suspects": ["Derek", "Victoria", "Morgan"]
}
```

---

## Phase 2: Arc Analysis Output

```javascript
{
  narrative_arcs: [
    {
      name: "IP Theft Trail",
      description: "Alex's stolen algorithm forms the foundation of NeurAI",
      evidence: ["alr001", "Cease & Desist Letter", "James <> Alex emails"],
      strength: 5,                                    // 1-5 scale
      systemic_angle: "Tech companies built on stolen labor",
      key_quote: "I'm the one who got screwed over in that deal",
      supporting_images: [
        { filename: "patchworklawfirm.png", relevance: "Legal documentation of IP dispute" }
      ]
    },
    {
      name: "Victoria's Double Game",
      description: "VC playing both sides of competing companies",
      evidence: ["jav042", "Silicon Valley Business Journal", "vik002"],
      strength: 4,
      systemic_angle: "Investor interests over innovation",
      key_quote: null,
      supporting_images: []
    }
    // ... 5-7 total arcs
  ],

  image_analysis: {
    hero_image: {
      filename: "20251221_205807.jpg",
      reason: "Captures climactic deliberation at 'BLACKWOOD IS DEAD' whiteboard"
    },
    session_photo_placements: [
      {
        filename: "20251221_194306.jpg",
        suggested_section: "the_story",
        suggested_placement: "opening",
        caption: "The investigation begins"
      },
      {
        filename: "20251221_202238.jpg",
        suggested_section: "follow_the_money",
        suggested_placement: "near financial tracker",
        caption: "The Valet's Black Market station"
      }
    ],
    document_image_placements: [
      {
        filename: "neuraionepager.png",
        suggested_section: "the_story",
        use_as: "evidence_card_image"
      }
    ]
  },

  financial_summary: {
    total_buried: 4060000,
    largest_account: { name: "Gorlan", amount: 1125000 },
    suspicious_patterns: ["ChaseT matches Taylor's last name"],
    first_burial_context: "Offbeat received $150K early in session"
  },

  buried_analysis: {
    by_thread: {
      "Funding": { count: 3, total_value: 900000 },
      "Lab Experiments": { count: 2, total_value: 575000 }
    },
    inference_opportunities: [
      "Victoria's buried memories cost $900K combined - she knew something",
      "Derek buried 2 memories worth $575K - lab connections?"
    ]
  },

  roster_coverage: {
    featured: ["Alex", "James", "Victoria", "Morgan"],
    mentioned: ["Jamie", "Rachel", "Sarah"],
    needs_placement: ["Kai", "Tori", "Oliver", "Diana"]
  },

  // User selections (saved after checkpoint)
  user_selections: {
    selected_arcs: ["IP Theft Trail", "Victoria's Double Game", "Morgan's Secret"],
    excluded_arcs: ["Minor Arc Name"],
    hero_image_confirmed: "20251221_205807.jpg",
    photo_preferences: { exclude: [], feature: ["20251221_205807.jpg"] },
    selected_at: "ISO timestamp"
  }
}
```

### 2.1 Arc Summary (Checkpoint Review Format)

Written alongside arc-analysis.json for parent agent checkpoint presentation.

**CRITICAL:** Arc recommendations must be ordered by PLAYER EMPHASIS (Layer 3), not evidence volume.

```javascript
{
  "arcsIdentified": 5,
  "playerFocusedArcs": [
    {
      "name": "Victoria + Morgan Collusion",
      "playerEmphasis": "HIGH",           // HIGH = on whiteboard, tied to accusation
      "whiteboardMention": true,
      "evidenceCount": 3
    },
    {
      "name": "IP Theft Trail",
      "playerEmphasis": "MEDIUM",         // MEDIUM = discussed but not central
      "whiteboardMention": false,
      "evidenceCount": 4
    }
  ],
  "recommendedArcs": [
    "Victoria + Morgan Collusion",        // Order by player emphasis, NOT evidence volume
    "IP Theft Trail",
    "Burial Conspiracy"
  ],
  "heroImageRecommendation": {
    "filename": "205807.jpg",
    "reason": "Deliberation at whiteboard"
  },
  "rosterGaps": ["Kai", "Tori", "Diana"]
}
```

---

## Phase 3: Article Outline

The approved structure that Phase 4 generates from.

```javascript
{
  lede: {
    hook: "Marcus is dead. Victoria and Morgan accused. 15 people's memories extracted.",
    key_tension: "Murder mystery + systemic critique",
    evidence_to_reference: []  // Lede is pure prose, no evidence cards
  },

  the_story: {
    arc_sequence: [
      {
        name: "IP Theft Trail",
        paragraphs: 3,
        evidence_cards: [
          { token: "alr001", placement: "after paragraph 1" },
          { paper: "Cease & Desist Letter", placement: "after paragraph 2" }
        ],
        inline_photo: {
          filename: "20251221_194306.jpg",
          after_paragraph: 2,
          caption: "Morgan, Oliver, Victoria, and James piece together clues"
        },
        timeline_marker: { text: "As the investigation deepened", placement: "after paragraph 3" }
      },
      {
        name: "Victoria's Double Game",
        paragraphs: 2,
        evidence_cards: [
          { token: "jav042", placement: "after paragraph 1" }
        ],
        inline_photo: null,
        timeline_marker: null
      }
    ],
    transitions: ["The money tells the rest of the story."]
  },

  follow_the_money: {
    intro_paragraphs: 1,
    financial_tracker: {
      accounts: [
        { name: "Gorlan", amount: 1125000, tokens: 5, annotation: "The largest recipient" },
        { name: "Dominic", amount: 960000, tokens: 4, annotation: null },
        { name: "ChaseT", amount: 750000, tokens: 3, annotation: "Taylor's last name is Chase" }
      ],
      total: 4060000
    },
    inline_photo: {
      filename: "20251221_202238.jpg",
      placement: "near financial tracker",
      caption: "The Valet's table: where memories became currency"
    },
    commentary_paragraphs: 1,
    suspicious_note: "ChaseT - Taylor's last name is Chase"
  },

  the_players: {
    who_exposed: {
      heroes: ["Alex", "James", "Jamie"],
      evaluation_angle: "Why they chose transparency"
    },
    who_buried: {
      names: ["Taylor", "Diana", "Derek"],
      evaluation_angle: "Understand, don't judge"
    },
    pull_quote: {
      text: "I don't know what was in those gaps. But I know how much someone was willing to pay.",
      attribution: "Nova"
    }
  },

  whats_missing: {
    buried_categories: [
      { thread: "Victoria's knowledge", count: 2, value: 900000 },
      { thread: "Lab experiments", count: 2, value: 575000 }
    ],
    buried_markers: [
      { description: "Victoria's memories", shell_account: "Gorlan", amount: 900000 },
      { description: "Derek's lab access", shell_account: "Dominic", amount: 575000 }
    ],
    inference_text: "I can tell you the shape of the silence. I can't tell you what's inside it."
  },

  closing: {
    systemic_angle: "Memory as commodity - from clicks to conversations to memories",
    accusation_handling: "Victoria and Morgan - the group decided",
    final_tone: "Urgent, consequential, participatory",
    optional_pull_quote: "First they wanted your clicks. Then your conversations. Now they want what it felt like to be you."
  },

  image_placements: {
    hero_image: {
      filename: "20251221_205807.jpg",
      location: "above headline or in lede",
      caption: "Partygoers gather at the investigation board as the final accusation looms",
      full_width: true
    },
    inline_photos: [
      {
        filename: "20251221_194306.jpg",
        section: "the_story",
        after_paragraph: 2,
        caption: "The investigation begins: guests piece together the first clues",
        size: "medium"  // small, medium, large
      }
    ],
    evidence_card_images: [
      {
        filename: "patchworklawfirm.png",
        evidence_card: "Cease & Desist Letter",
        treatment: "thumbnail with expand"
      }
    ],
    photo_gallery: null  // or { photos: [...], location: "end of article" }
  },

  visual_component_count: {
    evidence_cards: 4,
    timeline_markers: 2,
    pull_quotes: 2,
    buried_markers: 2,
    financial_tracker: 1,
    session_photos: 3,
    document_images: 1
  },

  // User approval (saved after checkpoint)
  user_approval: {
    approved: true,
    revision_notes: [],
    approved_at: "ISO timestamp"
  }
}
```

### 3.1 Outline Summary (Checkpoint Review Format)

Written alongside article-outline.json for parent agent checkpoint presentation.

```javascript
{
  "sectionSummary": {
    "lede": "Hook: Marcus dead, Victoria+Morgan accused",
    "theStory": "2 arcs, 5 paragraphs, 3 evidence cards",
    "followTheMoney": "$4.06M across 6 accounts",
    "thePlayers": "3 exposed, 3 buried",
    "whatsMissing": "2 buried markers",
    "closing": "Systemic critique on memory as commodity"
  },
  "visualPlacements": {
    "heroImage": "205807.jpg (deliberation)",
    "inlinePhotos": ["194306.jpg (THE STORY)", "202238.jpg (FOLLOW THE MONEY)"],
    "evidenceCards": 4,
    "pullQuotes": 2
  },
  "arcOrder": ["Victoria + Morgan Collusion", "IP Theft Trail"],
  "rosterCoverage": {
    "featured": ["Alex", "James", "Victoria", "Morgan"],
    "mentioned": ["Taylor", "Diana", "Derek", "Jamie"],
    "unmentioned": ["Kai", "Tori"]
  }
}
```

---

## Phase 5: Validation Results

```javascript
{
  passed: true,  // or false if issues exist
  issues: [
    {
      type: "em_dash",           // Issue type
      line: 47,                  // Line number in HTML
      text: "Marcus—the founder", // Offending text
      fix: "Use period: 'Marcus. The founder.'"
    },
    {
      type: "missing_character",
      character: "Kai",
      fix: "Add mention in THE PLAYERS section"
    }
  ],
  voice_score: 4,               // 1-5 scale
  voice_notes: "Strong participatory voice throughout. One passive construction at line 89.",
  roster_coverage: {
    featured: ["Alex", "James", "Victoria"],
    mentioned: ["Jamie", "Rachel"],
    missing: ["Kai"]
  },
  systemic_critique_present: true,
  blake_handled_correctly: true,
  validated_at: "ISO timestamp"
}
```

**Issue Types:**

| Type | Description |
|------|-------------|
| `em_dash` | Em-dash (`—` or `--`) found |
| `token_language` | "token/tokens" instead of "extracted memory" |
| `game_mechanics` | Game terms: "Act 3 unlock", "final call", etc. |
| `vague_attribution` | "from my notes", "sources say" |
| `missing_character` | Roster member not mentioned anywhere |
| `passive_voice` | Neutral/detached narration breaking voice |
| `blake_condemned` | Blake treated as villain (should be suspicious but not condemned) |

**Voice Score Scale:**

| Score | Meaning |
|-------|---------|
| 5 | Perfect Nova voice throughout |
| 4 | Strong with minor lapses |
| 3 | Acceptable but inconsistent |
| 2 | Frequent voice breaks |
| 1 | Wrong voice entirely |

**Passing Criteria:** `passed: true` only if zero critical issues AND voice_score >= 4
