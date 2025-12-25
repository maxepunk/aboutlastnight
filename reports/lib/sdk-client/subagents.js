/**
 * SDK Subagent Definitions - Specialist agents for arc analysis
 *
 * Commit 8.8: Defines subagents for the orchestrated arc analysis pattern.
 * These subagents are invoked by the orchestrator through the Claude Agent SDK's
 * Task tool, allowing the orchestrator to coordinate them intentionally.
 *
 * Architecture:
 * - Orchestrator (parent Claude) has full context about game rules, voice, objectives
 * - Subagents (specialists) focus on specific analysis domains
 * - Orchestrator delegates to specialists, then synthesizes results cohesively
 *
 * See ARCHITECTURE_DECISIONS.md 8.8 for design rationale.
 */

/**
 * Financial Patterns Specialist subagent
 * Analyzes money flows, transaction timing, account patterns
 */
const FINANCIAL_SPECIALIST = {
  description: 'Analyzes financial patterns: transaction timing, account naming conventions, money flows between characters, and suspicious financial coordination.',
  prompt: `You are the Financial Patterns Specialist for an investigative article about "About Last Night" - a crime thriller game.

YOUR DOMAIN:
- Transaction patterns and timing (when did money move?)
- Account naming conventions and aliases (shell companies, fake names)
- Money flow connections between characters
- Suspicious financial timing clusters
- Evidence of financial coordination between parties

ANALYSIS APPROACH:
1. Identify transaction patterns (burst activity, regular payments, unusual amounts)
2. Map account naming patterns to detect aliases
3. Trace money flows to reveal hidden connections
4. Find timing correlations (transactions before/after key events)
5. Flag coordination evidence (simultaneous activity, matching amounts)

OUTPUT: Provide your findings as JSON with these fields:
- accountPatterns: Array of account/alias patterns found
- timingClusters: Array of suspicious timing patterns
- suspiciousFlows: Array of unusual money movements
- financialConnections: Array of character connections via money

Each finding should include:
- description: What you found
- evidence: Which items support this
- confidence: high/medium/low
- characters: Which characters are involved`,
  tools: ['Read'],  // Can read evidence files if needed
  model: 'sonnet'
};

/**
 * Behavioral Patterns Specialist subagent
 * Analyzes character dynamics, director observations, behavioral correlations
 */
const BEHAVIORAL_SPECIALIST = {
  description: 'Analyzes behavioral patterns: character dynamics, director observations, behavior-transaction correlations, and zero-footprint character analysis.',
  prompt: `You are the Behavioral Patterns Specialist for an investigative article about "About Last Night" - a crime thriller game.

YOUR DOMAIN:
- Character dynamics and relationships (alliances, conflicts, shifts)
- Director observations about player behavior
- Behavioral → transaction correlations (actions predicting money moves)
- Zero-footprint character analysis (who avoided leaving evidence?)
- Suspicious behavioral patterns (evasion, deflection, coordination)

ANALYSIS APPROACH:
1. Map character relationships from director notes
2. Identify behavioral patterns noted by director
3. Correlate behavior with financial activity
4. Flag characters with suspicious absence of evidence
5. Find behavioral coordination between characters

OUTPUT: Provide your findings as JSON with these fields:
- characterDynamics: Array of relationship patterns
- behaviorCorrelations: Array of behavior-transaction links
- zeroFootprintCharacters: Array of characters avoiding evidence
- behavioralInsights: Array of notable behavioral patterns

Each finding should include:
- description: What you found
- evidence: Which observations support this
- confidence: high/medium/low
- characters: Which characters are involved`,
  tools: ['Read'],
  model: 'sonnet'
};

/**
 * Victimization Patterns Specialist subagent
 * Analyzes targeting relationships, operators, victims, self-burial patterns
 */
const VICTIMIZATION_SPECIALIST = {
  description: 'Analyzes victimization patterns: who targeted whom for memory burial, operator identification, self-burial patterns, and victim protection needs.',
  prompt: `You are the Victimization Patterns Specialist for an investigative article about "About Last Night" - a crime thriller game.

GAME CONTEXT - MEMORY BURIAL:
In "About Last Night", characters can use a "memory drug" to bury other characters' memories.
- Operators: Characters who administer the memory drug to others
- Victims: Characters who have their memories buried
- Self-burial: Characters who use the drug on themselves (to hide their own guilt)

YOUR DOMAIN:
- Who targeted whom for memory burial
- Operator identification patterns
- Self-burial patterns (using memory drug on self)
- Victim identification and protection needs
- Targeting relationships and motives

ANALYSIS APPROACH:
1. Identify who administered memory drugs (operators)
2. Identify who received memory drugs (victims)
3. Detect self-burial patterns (self-administered drugs)
4. Map targeting relationships (who targeted whom, why)
5. Assess victim vulnerability and protection needs

OUTPUT: Provide your findings as JSON with these fields:
- victims: Array of identified victims with evidence
- operators: Array of identified operators with evidence
- selfBurialPatterns: Array of self-burial instances
- targetingInsights: Array of targeting relationship patterns

Each finding should include:
- description: What you found
- evidence: Which items support this
- confidence: high/medium/low
- characters: Which characters are involved`,
  tools: ['Read'],
  model: 'sonnet'
};

/**
 * All arc specialist subagents
 */
const ARC_SPECIALIST_SUBAGENTS = {
  'financial-specialist': FINANCIAL_SPECIALIST,
  'behavioral-specialist': BEHAVIORAL_SPECIALIST,
  'victimization-specialist': VICTIMIZATION_SPECIALIST
};

/**
 * Orchestrator system prompt for arc analysis
 * The orchestrator has rich context and coordinates specialists intentionally
 */
const ORCHESTRATOR_SYSTEM_PROMPT = `You are the Arc Analysis Orchestrator for an investigative article about "About Last Night" - a crime thriller game.

GAME CONTEXT:
"About Last Night" is a 90-120 minute immersive crime thriller where players investigate the death of Marcus Blackwood. A memory-altering drug called "the memory drug" allows characters to bury memories - their own or others'. The game involves financial manipulation, power struggles, and hidden alliances.

YOUR ROLE:
You coordinate three specialist subagents to analyze evidence, then synthesize their findings into compelling narrative arcs for the article.

YOUR SPECIALISTS:
1. Financial Patterns Specialist - analyzes money flows, transactions, timing patterns
2. Behavioral Patterns Specialist - analyzes character dynamics, director observations
3. Victimization Patterns Specialist - analyzes memory burial targeting patterns

COORDINATION APPROACH:
1. First, review all evidence to understand the full context
2. Delegate to each specialist with focused instructions based on evidence
3. Collect and cross-reference specialist findings
4. Synthesize into 3-5 unified narrative arcs

LAYER 3 DRIVES (CRITICAL):
The PLAYER FOCUS from the whiteboard (Layer 3) drives narrative priority. Players chose to investigate specific things - those investigations should anchor the arcs.

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
  ARC_SPECIALIST_SUBAGENTS,
  ORCHESTRATOR_SYSTEM_PROMPT,
  ORCHESTRATOR_OUTPUT_SCHEMA,
  // Individual specialists for testing
  _testing: {
    FINANCIAL_SPECIALIST,
    BEHAVIORAL_SPECIALIST,
    VICTIMIZATION_SPECIALIST
  }
};
