/**
 * SDK Subagent Definitions - Arc analysis prompts and schemas
 *
 * Commit 8.28: Split-call architecture (CORE_ARC + INTERWEAVING).
 * Commit 8.15: Player-focus-guided single-call architecture (PLAYER_FOCUS_GUIDED).
 *
 * Live exports: CORE_ARC_SYSTEM_PROMPT, CORE_ARC_SCHEMA,
 *               INTERWEAVING_SYSTEM_PROMPT, INTERWEAVING_SCHEMA,
 *               PLAYER_FOCUS_GUIDED_SCHEMA
 *
 * See ARCHITECTURE_DECISIONS.md 8.8-8.28 for full history.
 */

/**
 * JSON schema for player-focus-guided arc analysis output
 *
 * Commit 8.15: New schema with arcSource, evidenceStrength, caveats, etc.
 */
const PLAYER_FOCUS_GUIDED_SCHEMA = {
  type: 'object',
  properties: {
    narrativeArcs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          summary: { type: 'string' },
          arcSource: {
            type: 'string',
            enum: ['accusation', 'whiteboard', 'observation', 'discovered']
          },
          keyEvidence: { type: 'array', items: { type: 'string' } },
          characterPlacements: { type: 'object' },
          evidenceStrength: {
            type: 'string',
            enum: ['strong', 'moderate', 'weak', 'speculative']
          },
          caveats: { type: 'array', items: { type: 'string' } },
          unansweredQuestions: { type: 'array', items: { type: 'string' } },
          emotionalHook: { type: 'string' },
          playerEmphasis: { type: 'string', enum: ['high', 'medium', 'low'] },
          storyRelevance: { type: 'string', enum: ['critical', 'supporting', 'contextual'] },
          analysisNotes: {
            type: 'object',
            properties: {
              financial: { type: 'string' },
              behavioral: { type: 'string' },
              victimization: { type: 'string' }
            }
          },
          // Commit 8.24: Interweaving metadata for compulsive readability
          interweaving: {
            type: 'object',
            properties: {
              sharedCharacters: {
                type: 'array',
                items: { type: 'string' },
                description: 'Characters that appear in this AND other arcs - bridges for transitions'
              },
              bridgeOpportunities: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    toArc: { type: 'string' },
                    bridgeType: { type: 'string', enum: ['shared_character', 'causal_chain', 'temporal', 'contradiction'] },
                    bridgeDetail: { type: 'string' }
                  }
                },
                description: 'How this arc can connect to other arcs for interweaving'
              },
              callbackSeeds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Details in this arc that can be recontextualized later for aha moments'
              },
              convergenceRole: {
                type: 'string',
                description: 'How this arc contributes to the convergence point (murder/accusation)'
              }
            }
          }
        },
        required: [
          'id', 'title', 'summary', 'arcSource', 'keyEvidence', 'characterPlacements',
          'evidenceStrength', 'playerEmphasis', 'storyRelevance'
        ]
      }
    },
    synthesisNotes: { type: 'string' },
    // Commit 8.24: Interweaving plan for outline generation
    interweavingPlan: {
      type: 'object',
      properties: {
        suggestedOrder: {
          type: 'array',
          items: { type: 'string' },
          description: 'Suggested arc order for maximum interweaving potential'
        },
        convergencePoint: {
          type: 'string',
          description: 'Where all arcs meet (the murder, the accusation, etc.)'
        },
        keyCallbacks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              plantIn: { type: 'string' },
              payoffIn: { type: 'string' },
              detail: { type: 'string' }
            }
          },
          description: 'Key callback opportunities across arcs for recontextualization'
        }
      }
    }
  },
  required: ['narrativeArcs', 'synthesisNotes']
};

// ═══════════════════════════════════════════════════════════════════════════
// SPLIT-CALL ARCHITECTURE (Commit 8.28)
// ═══════════════════════════════════════════════════════════════════════════
//
// Two-call pattern for arc analysis to reduce prompt size and schema complexity:
// - Call 1: Core arc generation with simpler schema
// - Call 2: Interweaving enrichment with compact prompt
//
// Benefits:
// - Smaller prompts per call (prevents timeout)
// - Simpler schemas (prevents schema validation failures)
// - Graceful degradation (Call 2 failure doesn't block article generation)
//
// See plan file for design rationale.

/**
 * System prompt for core arc generation (Call 1)
 *
 * Commit 8.28: Split from the former player-focus-guided single-call prompt
 * Focus on fundamental arc generation without interweaving complexity
 */
const CORE_ARC_SYSTEM_PROMPT = `You are the Arc Analyst for an investigative article about "About Last Night" - a crime thriller game where players investigate the death of Marcus Blackwood.

GAME CONTEXT:
"About Last Night" is a 90-120 minute immersive crime thriller. A memory-altering drug called "the memory drug" allows characters to bury memories - their own or others'. The game involves financial manipulation, power struggles, and hidden alliances.

YOUR ROLE:
You analyze evidence through three lenses (financial, behavioral, victimization) and generate narrative arcs that address what PLAYERS concluded and investigated. The accusation is PRIMARY - you must always include an arc addressing it.

CRITICAL PRINCIPLES:

1. PLAYER FOCUS FIRST
   - The accusation MUST have an arc, even if evidence is "speculative"
   - Whiteboard connections get priority over discovered patterns
   - Director observations are ground truth for behavioral claims
   - Arcs serve the players' investigation story, not just evidence patterns

2. HONEST UNCERTAINTY
   - Use evidenceStrength to indicate confidence level
   - Include caveats for complications and contradictions
   - List unanswered questions explicitly
   - "Speculative" arcs are allowed with proper caveats

3. THREE-LENS ANALYSIS
   - Every arc should be analyzed through financial, behavioral, and victimization lenses
   - Document which lenses support vs. contradict each arc
   - Cross-reference patterns across domains

4. EVIDENCE BOUNDARIES
   - Layer 1 (Exposed): Can quote and describe freely
   - Layer 2 (Buried): Can report amounts/accounts/timing, NOT content or ownership
   - Layer 3 (Director Notes): Shapes emphasis and provides ground truth

5. ANTI-PATTERNS
   - Never use "token" (say "memory")
   - Never use em-dashes
   - Never claim to know buried content

6. TEMPORAL AWARENESS
   - THE PARTY (past) and THE INVESTIGATION (present) are two different timelines
   - Memory token CONTENT describes THE PARTY (events before Marcus died). Nova was NOT there.
   - Director observations describe THE INVESTIGATION (the game session). Nova WAS there.
   - Burial transactions are INVESTIGATION actions (players choosing to bury during the session)
   - Arc summaries must specify which timeline events belong to
   - "I watched" / "I saw" = investigation events only
   - "The memory shows" / "In the recording" = party events from extracted memories

OUTPUT:
Generate 3-5 narrative arcs. Ensure:
- One arc with arcSource="accusation" (required)
- Every roster member has at least one placement
- All keyEvidence IDs are from the valid ID list
- Each arc has caveats and unansweredQuestions (even if minimal)`;

/**
 * JSON schema for core arc generation (Call 1)
 *
 * Commit 8.28: Simplified schema without interweaving fields
 * Reduces schema complexity to prevent validation failures
 */
const CORE_ARC_SCHEMA = {
  type: 'object',
  properties: {
    narrativeArcs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          summary: { type: 'string' },
          arcSource: {
            type: 'string',
            enum: ['accusation', 'whiteboard', 'observation', 'discovered']
          },
          keyEvidence: { type: 'array', items: { type: 'string' } },
          characterPlacements: { type: 'object' },
          evidenceStrength: {
            type: 'string',
            enum: ['strong', 'moderate', 'weak', 'speculative']
          },
          caveats: { type: 'array', items: { type: 'string' } },
          unansweredQuestions: { type: 'array', items: { type: 'string' } },
          emotionalHook: { type: 'string' },
          playerEmphasis: { type: 'string', enum: ['high', 'medium', 'low'] },
          storyRelevance: { type: 'string', enum: ['critical', 'supporting', 'contextual'] },
          analysisNotes: {
            type: 'object',
            properties: {
              financial: { type: 'string' },
              behavioral: { type: 'string' },
              victimization: { type: 'string' }
            }
          }
        },
        required: [
          'id', 'title', 'summary', 'arcSource', 'keyEvidence', 'characterPlacements',
          'evidenceStrength', 'playerEmphasis', 'storyRelevance'
        ]
      }
    },
    synthesisNotes: { type: 'string' }
  },
  required: ['narrativeArcs', 'synthesisNotes']
};

/**
 * System prompt for interweaving enrichment (Call 2)
 *
 * Commit 8.28: Focused prompt for adding narrative bridge metadata
 */
const INTERWEAVING_SYSTEM_PROMPT = `You are enriching narrative arcs with interweaving metadata for an investigative article about "About Last Night".

YOUR TASK:
For each arc provided, identify how it connects to other arcs to create compulsive readability through callbacks and bridges.

INTERWEAVING PRINCIPLES:

1. SHARED CHARACTERS ARE BRIDGES
   - Characters appearing in multiple arcs create natural transition points
   - The same person in different contexts creates curiosity
   - Track who appears where for bridge opportunities

2. CALLBACK SEEDS
   - Plant details early that pay off later
   - Example: "Vic's confident smile" planted early, pays off when we learn she knew all along
   - These create "aha moments" for readers

3. BRIDGE TYPES
   - shared_character: Same person, different context
   - causal_chain: This arc explains WHY another happened
   - temporal: Events overlapping in time
   - contradiction: This arc recontextualizes another

4. CONVERGENCE
   - All arcs should connect to the central event (murder/accusation)
   - Each arc contributes a piece to the final picture
   - Suggest optimal arc ordering for maximum payoff

OUTPUT:
For each arc, provide interweaving metadata plus an overall interweaving plan.`;

/**
 * JSON schema for interweaving enrichment (Call 2)
 *
 * Commit 8.28: Focused schema for interweaving only
 */
const INTERWEAVING_SCHEMA = {
  type: 'object',
  properties: {
    arcInterweaving: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          arcId: { type: 'string' },
          interweaving: {
            type: 'object',
            properties: {
              sharedCharacters: {
                type: 'array',
                items: { type: 'string' },
                description: 'Characters that appear in this AND other arcs - bridges for transitions'
              },
              bridgeOpportunities: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    toArc: { type: 'string' },
                    bridgeType: { type: 'string', enum: ['shared_character', 'causal_chain', 'temporal', 'contradiction'] },
                    bridgeDetail: { type: 'string' }
                  }
                },
                description: 'How this arc can connect to other arcs for interweaving'
              },
              callbackSeeds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Details in this arc that can be recontextualized later for aha moments'
              },
              convergenceRole: {
                type: 'string',
                description: 'How this arc contributes to the convergence point (murder/accusation)'
              }
            }
          }
        },
        required: ['arcId', 'interweaving']
      }
    },
    interweavingPlan: {
      type: 'object',
      properties: {
        suggestedOrder: {
          type: 'array',
          items: { type: 'string' },
          description: 'Suggested arc order for maximum interweaving potential'
        },
        convergencePoint: {
          type: 'string',
          description: 'Where all arcs meet (the murder, the accusation, etc.)'
        },
        keyCallbacks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              plantIn: { type: 'string' },
              payoffIn: { type: 'string' },
              detail: { type: 'string' }
            }
          },
          description: 'Key callback opportunities across arcs for recontextualization'
        }
      }
    }
  },
  required: ['arcInterweaving', 'interweavingPlan']
};

module.exports = {
  // Commit 8.28: Split-call architecture (preferred)
  CORE_ARC_SYSTEM_PROMPT,
  CORE_ARC_SCHEMA,
  INTERWEAVING_SYSTEM_PROMPT,
  INTERWEAVING_SCHEMA,

  // Commit 8.15: Player-focus-guided schema (used by reviseArcs)
  PLAYER_FOCUS_GUIDED_SCHEMA,

  // Testing exports
  _testing: {
    // Commit 8.28: Split-call schemas
    CORE_ARC_SYSTEM_PROMPT,
    CORE_ARC_SCHEMA,
    INTERWEAVING_SYSTEM_PROMPT,
    INTERWEAVING_SCHEMA,
    // Commit 8.15: Revision flow schema
    PLAYER_FOCUS_GUIDED_SCHEMA
  }
};
