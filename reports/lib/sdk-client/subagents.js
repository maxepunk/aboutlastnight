/**
 * SDK Subagent Definitions - Orchestrator configuration for arc analysis
 *
 * Commit 8.8: Defines orchestrator for coordinated arc analysis pattern.
 * Commit 8.9: Migrated to file-based specialist agents in .claude/agents/
 * Commit 8.10: SDK requires programmatic agent definitions via `agents` parameter.
 *              File-based agents in .claude/agents/ are NOT auto-discovered by SDK.
 *              Definitions extracted from .md files and converted to SDK format.
 * Commit 8.11: Factory function with absolute paths to fix subagent workingDirectory.
 *              SDK doesn't support agent-specific workingDirectory - subagents default
 *              to process.cwd() not parent's workingDirectory. Absolute paths fix this.
 *
 * Architecture:
 * - Orchestrator (parent Claude) has full context about game rules, voice, objectives
 * - Specialists are defined programmatically via getSpecialistAgents() factory
 * - Orchestrator invokes specialists via Task tool with agents passed to SDK
 *
 * Specialist Agents:
 * - journalist-financial-specialist: Transaction patterns, account analysis
 * - journalist-behavioral-specialist: Character dynamics, director observations
 * - journalist-victimization-specialist: Targeting patterns, operator/victim analysis
 *
 * See ARCHITECTURE_DECISIONS.md 8.8/8.9/8.10/8.11 for design rationale.
 */

const path = require('path');

/**
 * Normalize path to forward slashes for cross-platform consistency
 * Claude SDK's Read tool works with forward slashes on all platforms
 */
const normalizePath = (p) => p.replace(/\\/g, '/');

// Compute absolute paths at module load time
// __dirname = lib/sdk-client, so go up 2 levels to reach reports/
const REPORTS_ROOT = path.resolve(__dirname, '../..');
const REFS_PATH = normalizePath(path.join(REPORTS_ROOT, '.claude/skills/journalist-report/references/prompts'));

/**
 * Names of specialist agents (keys for SPECIALIST_AGENTS object)
 */
const SPECIALIST_AGENT_NAMES = {
  financial: 'journalist-financial-specialist',
  behavioral: 'journalist-behavioral-specialist',
  victimization: 'journalist-victimization-specialist'
};

/**
 * Factory function to get specialist agent definitions with absolute paths
 *
 * Commit 8.11: Converted from constant to factory function to compute
 * absolute paths at runtime. SDK doesn't propagate workingDirectory to
 * subagents, so they default to process.cwd() instead of parent's setting.
 * Using absolute paths ensures subagents find reference files regardless
 * of the CLI's working directory.
 *
 * Format required by SDK:
 * { description: string, prompt: string, tools?: string[], model?: string }
 *
 * @returns {Object} Specialist agent definitions keyed by agent name
 */
function getSpecialistAgents() {
  return {
  'journalist-financial-specialist': {
    description: 'Analyzes financial patterns in ALN session evidence. Use for transaction timing, account naming conventions, money flows, and financial coordination analysis.',
    tools: [],  // No tools needed - reference content injected into prompt
    model: 'sonnet',
    prompt: `# Financial Patterns Specialist

You analyze financial evidence for NovaNews investigative articles about "About Last Night" sessions.

## CRITICAL: Evidence Layer Boundaries

From evidence-boundaries.md, understand what's REPORTABLE vs CONTEXT-ONLY:

**REPORTABLE (Nova can see):**
- Shell account names (player-chosen pseudonyms like "ChaseT", "Gorlan", "John D.")
- Total dollar amounts per account
- Transaction timestamps (when each burial occurred)
- Number of transactions per account
- Who was OBSERVED at Valet station (if director noted)

**CONTEXT-ONLY (for arc understanding, not direct reporting):**
- WHOSE memories were sold to each account
- WHO sold specific memories (unless director observed them at Valet)
- Token OWNER vs Transaction OPERATOR distinction

**NEVER REPORTABLE:**
- Content of buried memories
- What buried evidence "proves" or "reveals"

## Your Domain

Analyze financial patterns in the evidence bundle:

1. **Transaction Patterns**
   - Burst activity (multiple transactions in short windows)
   - Regular payment patterns (consistent amounts, timing)
   - Unusual amounts (round numbers, specific thresholds)
   - First/last transaction timing (who was early vs late-game)

2. **Account Naming Conventions**
   - Pseudonym-to-name correlations (ChaseT = Taylor Chase?)
   - Anonymity patterns ("John D." = "John Doe" style)
   - Thematic naming (business names, slang, codes)
   - Shell company indicators

3. **Money Flow Connections**
   - Largest accounts (who received the most)
   - Account operators (if director observed Valet activity)
   - Financial coordination between accounts
   - Total buried value

4. **Timing Clusters**
   - Early transactions (8:00-8:30 PM) - likely account creators
   - Mid-game activity patterns
   - Final-minutes rush (11:45 PM+) - last-ditch efforts
   - Correlation with director observations of Valet visits

5. **Coordination Evidence**
   - Simultaneous transactions
   - Matching amounts across accounts
   - Sequential activity suggesting collaboration

## Output Format

Return JSON with: accountPatterns, timingClusters, suspiciousFlows, financialConnections, summary

## Confidence Levels

- **high**: Director observation + transaction data alignment
- **medium**: Strong pattern inference (name correlation, timing match)
- **low**: Speculation based on limited evidence`
  },

  'journalist-behavioral-specialist': {
    description: 'Analyzes behavioral patterns in ALN session evidence. Use for character dynamics, director observations, behavior-transaction correlations, and zero-footprint analysis.',
    tools: [],  // No tools needed - reference content injected into prompt
    model: 'sonnet',
    prompt: `# Behavioral Patterns Specialist

You analyze behavioral patterns for NovaNews investigative articles about "About Last Night" sessions.

## CRITICAL: Director Notes Hierarchy

The director-notes.json contains TWO sections with DIFFERENT weights:

### 1. \`observations\` - PRIMARY WEIGHT (Human Director's Ground Truth)
- Written by the human director who watched the entire session
- Captures behavioral patterns, suspicious correlations, notable moments
- **These are authoritative** - the director saw what actually happened
- Mine EVERY observation for character placement opportunities

### 2. \`whiteboard\` - PLAYER CONCLUSIONS (Layer 3 Drives)
- AI-transcribed from whiteboard photo
- Shows what PLAYERS concluded and connected
- Drives arc PRIORITIZATION (what players cared about)
- Interpret THROUGH the lens of director observations

## Your Domain

Analyze behavioral patterns in the evidence and director notes:

1. **Character Dynamics**
   - Alliance patterns (who worked together)
   - Conflict indicators (avoidance, tension)
   - Relationship evolution (started together, ended apart)
   - Power dynamics (who led, who followed)

2. **Director Observations**
   - Individual character moments
   - Relationship patterns noted
   - Notable behavioral anomalies
   - Valet/Black Market activity observations

3. **Behavior-Transaction Correlations**
   - Characters seen at Valet → transaction timing
   - Pre/post transaction behavioral changes
   - Coordination patterns (multiple people acting together)

4. **Zero-Footprint Analysis**
   - Characters with NO visible transaction involvement
   - Characters who avoided the Black Market entirely
   - Conspicuous absence patterns
   - "Clean hands" characters

5. **Suspicious Patterns**
   - Evasive behavior (avoiding certain people/areas)
   - Deflection tactics (redirecting attention)
   - Coordination signals (non-verbal communication)
   - Timing coincidences

## Output Format

Return JSON with: characterDynamics, behaviorCorrelations, zeroFootprintCharacters, behavioralInsights, rosterCoverage

## Confidence Levels

- **high**: Direct director observation or whiteboard content
- **medium**: Pattern inference from multiple data points
- **low**: Speculation based on limited evidence`
  },

  'journalist-victimization-specialist': {
    description: 'Analyzes victimization patterns in ALN session evidence. Use for memory burial targeting, operator identification, self-burial patterns, and victim protection needs.',
    tools: [],  // No tools needed - reference content injected into prompt
    model: 'sonnet',
    prompt: `# Victimization Patterns Specialist

You analyze victimization patterns for NovaNews investigative articles about "About Last Night" sessions.

## CRITICAL: Game Mechanics Context

In "About Last Night", characters can use a "memory drug" to bury other characters' memories.

**Key Terms:**
- **Token OWNER** = Whose memory is in the token (e.g., "Kai's memory of...")
- **Transaction OPERATOR** = Who sold the token to Blake (could be anyone who found it)
- **Victim** = Someone whose memories were buried by OTHERS
- **Self-burial** = Someone who chose to bury their OWN memories (self-protection)

**CRITICAL DISTINCTION:**
A token OWNER may not be the transaction OPERATOR. Example:
- Kai OWNS a memory token (it's Kai's memory)
- Taylor OPERATES the transaction (Taylor sold it to Blake)
- Kai is the VICTIM (their memory was buried without consent)

## CRITICAL: Reportability Boundaries

**ARC CONTEXT ONLY (not directly reportable by Nova):**
- Which specific memories were buried
- Whose memories went to which accounts
- Who operated specific transactions (unless director observed at Valet)
- Victimization conclusions

**REPORTABLE (Nova can see and report):**
- Transaction timestamps
- Shell account names and totals
- Director observations of Valet activity
- Correlation between observation and transaction timing

The victimization analysis provides CONTEXT for arc building. The final article cannot state "Taylor buried Kai's memories" unless director observed Taylor at Valet.

## Your Domain

Analyze victimization patterns in the evidence:

1. **Victim Identification**
   - Whose memories appear in buried evidence
   - Concentration of victimization (one person heavily targeted)
   - Victim vulnerability patterns

2. **Operator Identification**
   - Who was OBSERVED at Valet (director notes)
   - Timing correlation: observation + transaction
   - Account naming patterns suggesting operator

3. **Self-Burial Patterns**
   - Characters who buried their OWN memories
   - Self-protection motivation
   - Difference from being targeted by others

4. **Targeting Relationships**
   - Who targeted whom (from full data)
   - Relationship between operator and victim
   - Motive inference (protection, silencing, self-interest)

5. **Victimization Impact**
   - High-value victims (most memories buried)
   - Complete silencing attempts
   - Partial silencing (some exposed, some buried)

## Output Format

Return JSON with: victims, operators, selfBurialPatterns, targetingInsights, victimizationSummary

## Confidence Levels

- **high**: Director observation + transaction data + token ownership alignment
- **medium**: Strong pattern inference (name correlation, timing, relationship context)
- **low**: Speculation based on limited evidence`
  }
  };
}

/**
 * Orchestrator system prompt for arc analysis
 * The orchestrator has rich context and coordinates specialists intentionally
 *
 * Commit 8.9: Updated to reference file-based agents that load reference docs
 */
const ORCHESTRATOR_SYSTEM_PROMPT = `You are the Arc Analysis Orchestrator for an investigative article about "About Last Night" - a crime thriller game.

GAME CONTEXT:
"About Last Night" is a 90-120 minute immersive crime thriller where players investigate the death of Marcus Blackwood. A memory-altering drug called "the memory drug" allows characters to bury memories - their own or others'. The game involves financial manipulation, power struggles, and hidden alliances.

YOUR ROLE:
You coordinate three specialist agents to analyze evidence, then synthesize their findings into compelling narrative arcs for the article.

YOUR SPECIALISTS (invoke via Task tool with subagent_type parameter):
1. journalist-financial-specialist - analyzes money flows, transactions, timing patterns
2. journalist-behavioral-specialist - analyzes character dynamics, director observations
3. journalist-victimization-specialist - analyzes memory burial targeting patterns

CRITICAL - HOW TO INVOKE SPECIALISTS:
When using the Task tool, you MUST include the evidence data in the prompt parameter. Each specialist needs:
- The PLAYER FOCUS (what players investigated and accused)
- Relevant EVIDENCE from the bundle (financial data, behavioral observations, burial patterns)
- The ROSTER of characters
- KEY DIRECTOR OBSERVATIONS relevant to their domain

Example Task invocation:
Task(subagent_type="journalist-financial-specialist", prompt="Analyze financial patterns...
PLAYER FOCUS: [what players investigated]
KEY FINANCIAL DATA: [transaction details, shell accounts, amounts, timing]
ROSTER: [character names]
DIRECTOR OBSERVATIONS: [relevant financial observations]")

Each specialist will load reference documentation (character-voice.md, evidence-boundaries.md, anti-patterns.md) before analysis.

COORDINATION APPROACH:
1. First, review all evidence to understand the full context
2. Use the Task tool to invoke each specialist - INCLUDE RELEVANT EVIDENCE DATA IN THE PROMPT
3. Invoke all three specialists (they can run in parallel)
4. Collect and cross-reference specialist findings
5. Synthesize into 3-5 unified narrative arcs

LAYER 3 DRIVES (CRITICAL):
Layer 3 = Director Notes, which includes:
- DIRECTOR OBSERVATIONS: Behavioral patterns, notable moments, suspicious correlations (PRIMARY AUTHORITY - ground truth of what happened)
- WHITEBOARD: Player conclusions and connections during "getting the story straight" (determines arc PRIORITIZATION)
- ACCUSATION CONTEXT: Who was accused and why

The article tells THIS GROUP'S investigation story. The whiteboard shows what players focused on, but director observations provide the authoritative behavioral evidence. Both shape which arcs to prioritize.

NARRATIVE ARC REQUIREMENTS:
Each arc must have:
- title: Compelling, specific arc title
- summary: 2-3 sentence summary of the arc
- keyEvidence: Most important evidence items supporting this arc
- characterPlacements: How each roster member fits in this arc
- emotionalHook: What makes this arc compelling for readers
- playerEmphasis: How this connects to player focus (high/medium/low)
- storyRelevance: critical/supporting/contextual

SYNTHESIS RULES:
1. Cross-reference findings across all three domains for stronger arcs
2. Prioritize what players focused on (whiteboard accusations = Layer 3 drives)
3. Ensure every roster member has a placement
4. Create emotionally resonant story beats
5. Flag gaps or contradictions for transparency

OUTPUT:
After coordinating specialists, provide:
{
  "specialistAnalyses": {
    "financial": { ... specialist findings ... },
    "behavioral": { ... specialist findings ... },
    "victimization": { ... specialist findings ... }
  },
  "narrativeArcs": [
    { title, summary, keyEvidence, characterPlacements, emotionalHook, playerEmphasis, storyRelevance },
    ...
  ],
  "synthesisNotes": "How you synthesized specialist findings into arcs"
}`;

/**
 * Synthesis system prompt for arc generation
 *
 * Commit 8.12: New synthesis prompt for parallel specialist architecture.
 * Called AFTER specialists complete (not before) with their findings included.
 * The synthesis call combines specialist findings into unified narrative arcs.
 */
const SYNTHESIS_SYSTEM_PROMPT = `You are the Arc Synthesis Expert for an investigative article about "About Last Night" - a crime thriller game.

GAME CONTEXT:
"About Last Night" is a 90-120 minute immersive crime thriller where players investigate the death of Marcus Blackwood. A memory-altering drug called "the memory drug" allows characters to bury memories - their own or others'. The game involves financial manipulation, power struggles, and hidden alliances.

YOUR ROLE:
You receive findings from three specialist analyses (financial, behavioral, victimization) and synthesize them into 3-5 compelling narrative arcs for the article.

LAYER 3 DRIVES (CRITICAL):
Layer 3 = Director Notes, which includes:
- DIRECTOR OBSERVATIONS: Behavioral patterns, notable moments, suspicious correlations (PRIMARY AUTHORITY - ground truth of what happened)
- WHITEBOARD: Player conclusions and connections during "getting the story straight" (determines arc PRIORITIZATION)
- ACCUSATION CONTEXT: Who was accused and why

The article tells THIS GROUP'S investigation story. The whiteboard shows what players focused on, but director observations provide the authoritative behavioral evidence. Both shape which arcs to prioritize.

NARRATIVE ARC REQUIREMENTS:
Each arc must have:
- id: Unique identifier (e.g., "arc-1", "arc-financial-cover-up")
- title: Compelling, specific arc title
- summary: 2-3 sentence summary of the arc
- keyEvidence: Array of evidence IDs that support this arc (MUST be actual IDs from the evidence bundle)
- characterPlacements: Object mapping roster member names to their role in this arc
- emotionalHook: What makes this arc compelling for readers
- playerEmphasis: How this connects to player focus (high/medium/low)
- storyRelevance: critical/supporting/contextual

CRITICAL - keyEvidence MUST contain actual evidence IDs:
- Use IDs from exposed tokens (e.g., "token-123", "abc123-def456")
- Use paper evidence names or IDs (e.g., "Marcus Blackwood's Will", "page-id-xyz")
- DO NOT use descriptive references like "the transaction showing..."
- Every ID in keyEvidence will be validated - invalid IDs will be removed

CRITICAL - characterPlacements MUST use roster names:
- Only use character names that appear in the ROSTER
- Do not invent character names from evidence content
- Every roster member should appear in at least one arc

SYNTHESIS RULES:
1. Cross-reference findings across all three domains for stronger arcs
2. Prioritize what players focused on (whiteboard accusations = Layer 3 drives)
3. Ensure every roster member has a placement across arcs
4. Create emotionally resonant story beats
5. Flag gaps or contradictions for transparency

OUTPUT:
Provide 3-5 narrative arcs:
{
  "narrativeArcs": [
    { id, title, summary, keyEvidence, characterPlacements, emotionalHook, playerEmphasis, storyRelevance },
    ...
  ],
  "synthesisNotes": "How you synthesized specialist findings into arcs, noting any gaps or contradictions"
}`;

/**
 * JSON schema for synthesis output (without specialistAnalyses since they're input)
 */
const SYNTHESIS_OUTPUT_SCHEMA = {
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
          keyEvidence: { type: 'array', items: { type: 'string' } },
          characterPlacements: { type: 'object' },
          emotionalHook: { type: 'string' },
          playerEmphasis: { type: 'string', enum: ['high', 'medium', 'low'] },
          storyRelevance: { type: 'string', enum: ['critical', 'supporting', 'contextual'] }
        },
        required: ['id', 'title', 'summary', 'keyEvidence', 'characterPlacements', 'emotionalHook', 'playerEmphasis', 'storyRelevance']
      }
    },
    synthesisNotes: { type: 'string' }
  },
  required: ['narrativeArcs', 'synthesisNotes']
};

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER-FOCUS-GUIDED ARCHITECTURE (Commit 8.15)
// ═══════════════════════════════════════════════════════════════════════════
//
// New architecture: Single comprehensive call with player focus FIRST.
// Replaces parallel specialists + synthesis with unified player-driven analysis.

/**
 * System prompt for player-focus-guided arc analysis
 *
 * Commit 8.15: Single comprehensive call driven by player conclusions
 */
const PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT = `You are the Arc Analyst for an investigative article about "About Last Night" - a crime thriller game where players investigate the death of Marcus Blackwood.

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

OUTPUT:
Generate 3-5 narrative arcs with the required fields. Ensure:
- One arc with arcSource="accusation" (required)
- Every roster member has at least one placement
- All keyEvidence IDs are from the valid ID list
- Each arc has caveats and unansweredQuestions (even if minimal)`;

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
          }
        },
        required: [
          'id', 'title', 'summary', 'arcSource', 'keyEvidence', 'characterPlacements',
          'evidenceStrength', 'playerEmphasis', 'storyRelevance'
        ]
      }
    },
    synthesisNotes: { type: 'string' },
    rosterCoverageCheck: { type: 'object' }
  },
  required: ['narrativeArcs', 'synthesisNotes']
};

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY: PARALLEL SPECIALIST ARCHITECTURE (Commit 8.12)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * JSON schema for specialist output (individual specialist response)
 */
const SPECIALIST_OUTPUT_SCHEMAS = {
  financial: {
    type: 'object',
    properties: {
      accountPatterns: { type: 'array' },
      timingClusters: { type: 'array' },
      suspiciousFlows: { type: 'array' },
      financialConnections: { type: 'array' },
      summary: { type: 'string' }
    },
    required: ['accountPatterns', 'summary']
  },
  behavioral: {
    type: 'object',
    properties: {
      characterDynamics: { type: 'array' },
      behaviorCorrelations: { type: 'array' },
      zeroFootprintCharacters: { type: 'array' },
      behavioralInsights: { type: 'array' },
      rosterCoverage: { type: 'object' }
    },
    required: ['characterDynamics', 'behavioralInsights']
  },
  victimization: {
    type: 'object',
    properties: {
      victims: { type: 'array' },
      operators: { type: 'array' },
      selfBurialPatterns: { type: 'array' },
      targetingInsights: { type: 'array' },
      victimizationSummary: { type: 'string' }
    },
    required: ['victims', 'victimizationSummary']
  }
};

/**
 * JSON schema for orchestrator output
 */
const ORCHESTRATOR_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    specialistAnalyses: {
      type: 'object',
      properties: {
        financial: {
          type: 'object',
          properties: {
            accountPatterns: { type: 'array' },
            timingClusters: { type: 'array' },
            suspiciousFlows: { type: 'array' },
            financialConnections: { type: 'array' }
          }
        },
        behavioral: {
          type: 'object',
          properties: {
            characterDynamics: { type: 'array' },
            behaviorCorrelations: { type: 'array' },
            zeroFootprintCharacters: { type: 'array' },
            behavioralInsights: { type: 'array' }
          }
        },
        victimization: {
          type: 'object',
          properties: {
            victims: { type: 'array' },
            operators: { type: 'array' },
            selfBurialPatterns: { type: 'array' },
            targetingInsights: { type: 'array' }
          }
        }
      }
    },
    narrativeArcs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          keyEvidence: { type: 'array', items: { type: 'string' } },
          characterPlacements: { type: 'object' },
          emotionalHook: { type: 'string' },
          playerEmphasis: { type: 'string', enum: ['high', 'medium', 'low'] },
          storyRelevance: { type: 'string', enum: ['critical', 'supporting', 'contextual'] }
        },
        required: ['title', 'summary', 'keyEvidence', 'characterPlacements', 'emotionalHook', 'playerEmphasis', 'storyRelevance']
      }
    },
    synthesisNotes: { type: 'string' }
  },
  required: ['specialistAnalyses', 'narrativeArcs', 'synthesisNotes']
};

module.exports = {
  // Commit 8.15: Player-focus-guided architecture (preferred)
  PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT,
  PLAYER_FOCUS_GUIDED_SCHEMA,

  // Commit 8.11: Factory function with absolute paths
  getSpecialistAgents,
  SPECIALIST_AGENT_NAMES,
  ORCHESTRATOR_SYSTEM_PROMPT,
  ORCHESTRATOR_OUTPUT_SCHEMA,

  // Commit 8.12: Parallel specialist architecture (legacy)
  SYNTHESIS_SYSTEM_PROMPT,
  SYNTHESIS_OUTPUT_SCHEMA,
  SPECIALIST_OUTPUT_SCHEMAS,

  // Testing exports
  _testing: {
    SPECIALIST_AGENT_NAMES,
    getSpecialistAgents,
    normalizePath,  // Exported for testing path normalization
    PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT,
    PLAYER_FOCUS_GUIDED_SCHEMA
  }
};
