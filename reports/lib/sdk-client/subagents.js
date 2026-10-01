/**
 * SDK Subagent Definitions - Arc analysis prompts and schemas
 *
 * Commit 8.28: Split-call architecture (CORE_ARC + INTERWEAVING).
 * Commit 8.15: Player-focus-guided single-call architecture (PLAYER_FOCUS_GUIDED).
 *
 * Live exports: CORE_ARC_SYSTEM_PROMPT, CORE_ARC_SCHEMA,
 *               INTERWEAVING_SYSTEM_PROMPT, INTERWEAVING_SCHEMA,
 *               PLAYER_FOCUS_GUIDED_SCHEMA, and the detective's parked copies
 *               (DETECTIVE_*)
 *
 * Phase 3 (brief 3.3): the journalist's two system prompts hold only what the rule
 * set does not say. The arc composers in arc-specialist-nodes.js put the world, the
 * truth rules and the mode block after the identity line (loadRuleSet), and the craft
 * files go in the user prompts. The prompts and schema descriptions used to describe
 * burial as a drug, converge every arc on "the murder", and order the arcs "for maximum
 * payoff"; the detective keeps that text, parked with its theme (spec D13).
 *
 * See ARCHITECTURE_DECISIONS.md 8.8-8.28 for full history.
 */

/**
 * The journalist's wording for the three schema fields that place the arcs in the
 * article (phase 3, brief 3.3; spec C16 and TH2). The same three descriptions are in
 * both schemas that carry the fields, the interweaving call's and the arc reworker's,
 * and the reworker's prompt prints them (buildArcReworkOutputAddendum).
 */
const CONVERGENCE_ROLE_DESCRIPTION = 'What this arc brings to the convergence point';
const SUGGESTED_ORDER_DESCRIPTION = "Arc ids in order of how each arc bears on the room's verdict";
const CONVERGENCE_POINT_DESCRIPTION = 'The culmination near the end of the article, where the threads converge and the thesis lands';

/**
 * The detective's wording for the same three fields, parked with its theme (spec D13).
 */
const DETECTIVE_SCHEMA_WORDING = {
  convergenceRole: 'How this arc contributes to the convergence point (murder/accusation)',
  suggestedOrder: 'Suggested arc order for maximum interweaving potential',
  convergencePoint: 'Where all arcs meet (the murder, the accusation, etc.)'
};

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
                description: CONVERGENCE_ROLE_DESCRIPTION
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
          description: SUGGESTED_ORDER_DESCRIPTION
        },
        convergencePoint: {
          type: 'string',
          description: CONVERGENCE_POINT_DESCRIPTION
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
 * System prompt for core arc generation (Call 1), the journalist's.
 *
 * Commit 8.28: Split from the former player-focus-guided single-call prompt
 * Focus on fundamental arc generation without interweaving complexity
 *
 * Phase 3 (brief 3.3): what the rule set does not say. coreArcSystemPrompt puts the
 * mode block, the world and the truth rules after the identity line, so the game, the
 * evidence boundaries, the stages and the anti-patterns this prompt used to restate
 * (and partly contradict) are gone from it; the three lenses are C16's (craft-arcs.md,
 * in the user prompt). The roster line under OUTPUT is task 3.7's to change.
 */
const CORE_ARC_SYSTEM_PROMPT = `You are the arc writer for a NovaNews investigative article about one session of "About Last Night": you find the arcs, the threads of this session's story that the outline and the article are built from.

YOUR ROLE:
Read the record and the director's account of the room, and find the threads of the session's story. The players' conclusions come first: the room's verdict always gets an arc, and the threads the room explored come before a pattern it did not take up, because the article shows the players how their choices shaped the official story.

HONEST UNCERTAINTY:
The director reads every arc at the arc stop and chooses which ones the article is built on, so each arc says how far the record carries it:
- evidenceStrength says how strongly the record backs the arc; a "speculative" arc is allowed when its caveats say why.
- caveats name what complicates the arc, and unansweredQuestions name what the record leaves open.

OUTPUT:
Generate 3-5 narrative arcs. Ensure:
- One arc with arcSource="accusation" (required)
- Every roster member has at least one placement
- All keyEvidence IDs are from the valid ID list
- Each arc has caveats and unansweredQuestions (even if minimal)`;

/**
 * The detective's system prompt for core arc generation, today's text, parked with
 * its theme (spec D13). Phase 3 rewrote the journalist's (CORE_ARC_SYSTEM_PROMPT).
 */
const DETECTIVE_CORE_ARC_SYSTEM_PROMPT = `You are the Arc Analyst for an investigative article about "About Last Night" - a crime thriller game where players investigate the death of Marcus Blackwood.

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
   - Director observations describe THE INVESTIGATION (the game session); how Nova learned of them is set by the reporting mode above.
   - Burial transactions are INVESTIGATION actions (players choosing to bury during the session)
   - Arc summaries must specify which timeline events belong to
   - Investigation events are told in the third person ("during the investigation", "was seen"), never as a first-person presence claim
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
 * System prompt for interweaving enrichment (Call 2), the journalist's.
 *
 * Commit 8.28: Focused prompt for adding narrative bridge metadata
 *
 * Phase 3 (brief 3.3): the interweaving principles stay; the convergence is C16's
 * culmination near the end, where the thesis lands, not "the central event
 * (murder/accusation)"; the order is TH2's (how each arc bears on the verdict, not
 * "maximum payoff"); the callback example that gave Vic a pronoun and a hidden truth
 * is gone. interweavingSystemPrompt puts the mode block, the world and the truth
 * rules after the identity line.
 */
const INTERWEAVING_SYSTEM_PROMPT = `You plan how the arcs of one "About Last Night" session intercut in a NovaNews investigative article, and where they converge.

YOUR TASK:
For each arc provided, identify how it connects to other arcs to create compulsive readability through callbacks and bridges.

INTERWEAVING PRINCIPLES:

1. SHARED CHARACTERS ARE BRIDGES
   - Characters appearing in multiple arcs create natural transition points
   - The same person in different contexts creates curiosity
   - Track who appears where for bridge opportunities

2. CALLBACK SEEDS
   - A detail from the record, planted early, comes back changed later: the reader's moment of recognition
   - A seed is a detail the record holds, so the payoff stays true to it

3. BRIDGE TYPES
   - shared_character: Same person, different context
   - causal_chain: This arc explains WHY another happened
   - temporal: Events close together within one stage: two memories from the same moment of the party, or two events on the morning timeline. A memory's time is the party's clock and the timeline's is the morning's, so the two never line up
   - contradiction: This arc recontextualizes another

4. CONVERGENCE
   - The threads converge at the culmination the article builds toward, near its end, where the thesis lands
   - Each arc brings its piece to that culmination

5. ORDER
   - Suggest the arcs in order of how they bear on the room's verdict, the official story the article examines

OUTPUT:
For each arc, provide interweaving metadata plus an overall interweaving plan.`;

/**
 * The detective's system prompt for interweaving enrichment, today's text, parked with
 * its theme (spec D13).
 */
const DETECTIVE_INTERWEAVING_SYSTEM_PROMPT = `You are enriching narrative arcs with interweaving metadata for an investigative article about "About Last Night".

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
                description: CONVERGENCE_ROLE_DESCRIPTION
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
          description: SUGGESTED_ORDER_DESCRIPTION
        },
        convergencePoint: {
          type: 'string',
          description: CONVERGENCE_POINT_DESCRIPTION
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

/**
 * A schema's detective copy: the same schema with the detective's wording for the
 * three fields that place the arcs (DETECTIVE_SCHEMA_WORDING). A deep copy, so a
 * change to the journalist's schema object never reaches it at run time.
 *
 * @param {Object} schema - INTERWEAVING_SCHEMA or PLAYER_FOCUS_GUIDED_SCHEMA
 * @returns {Object}
 */
function withDetectiveWording(schema) {
  const copy = JSON.parse(JSON.stringify(schema));
  const arcItems = (copy.properties.narrativeArcs || copy.properties.arcInterweaving).items;
  arcItems.properties.interweaving.properties.convergenceRole.description = DETECTIVE_SCHEMA_WORDING.convergenceRole;
  copy.properties.interweavingPlan.properties.suggestedOrder.description = DETECTIVE_SCHEMA_WORDING.suggestedOrder;
  copy.properties.interweavingPlan.properties.convergencePoint.description = DETECTIVE_SCHEMA_WORDING.convergencePoint;
  return copy;
}

/** The detective's interweaving and arc-rework schemas, parked with its theme (spec D13). */
const DETECTIVE_INTERWEAVING_SCHEMA = withDetectiveWording(INTERWEAVING_SCHEMA);
const DETECTIVE_PLAYER_FOCUS_GUIDED_SCHEMA = withDetectiveWording(PLAYER_FOCUS_GUIDED_SCHEMA);

module.exports = {
  // Commit 8.28: Split-call architecture (preferred)
  CORE_ARC_SYSTEM_PROMPT,
  CORE_ARC_SCHEMA,
  INTERWEAVING_SYSTEM_PROMPT,
  INTERWEAVING_SCHEMA,

  // Commit 8.15: Player-focus-guided schema (used by reviseArcs)
  PLAYER_FOCUS_GUIDED_SCHEMA,

  // Phase 3 (3.3): the detective's prompts and schemas, parked with its theme (D13)
  DETECTIVE_CORE_ARC_SYSTEM_PROMPT,
  DETECTIVE_INTERWEAVING_SYSTEM_PROMPT,
  DETECTIVE_INTERWEAVING_SCHEMA,
  DETECTIVE_PLAYER_FOCUS_GUIDED_SCHEMA,

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
