/**
 * SDK Subagent Definitions - Orchestrator configuration for arc analysis
 *
 * Commit 8.8: Defines orchestrator for coordinated arc analysis pattern.
 * Commit 8.9: Migrated to file-based specialist agents in .claude/agents/
 *
 * Architecture:
 * - Orchestrator (parent Claude) has full context about game rules, voice, objectives
 * - Specialists are defined as file-based agents that load reference docs at runtime
 * - Orchestrator invokes specialists via Task tool, then synthesizes results
 *
 * Specialist Agents (file-based in .claude/agents/):
 * - journalist-financial-specialist: Transaction patterns, account analysis
 * - journalist-behavioral-specialist: Character dynamics, director observations
 * - journalist-victimization-specialist: Targeting patterns, operator/victim analysis
 *
 * See ARCHITECTURE_DECISIONS.md 8.8/8.9 for design rationale.
 */

/**
 * Names of file-based specialist agents
 * These are discovered automatically from .claude/agents/ directory
 */
const SPECIALIST_AGENT_NAMES = {
  financial: 'journalist-financial-specialist',
  behavioral: 'journalist-behavioral-specialist',
  victimization: 'journalist-victimization-specialist'
};

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

YOUR SPECIALISTS (invoke via Task tool):
1. journalist-financial-specialist - analyzes money flows, transactions, timing patterns
2. journalist-behavioral-specialist - analyzes character dynamics, director observations
3. journalist-victimization-specialist - analyzes memory burial targeting patterns

Each specialist will load reference documentation (character-voice.md, evidence-boundaries.md, anti-patterns.md) before analysis to ensure consistency with Nova's voice and reporting boundaries.

COORDINATION APPROACH:
1. First, review all evidence to understand the full context
2. Use the Task tool to invoke each specialist with the evidence context
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
  // Commit 8.9: File-based agents replace programmatic definitions
  SPECIALIST_AGENT_NAMES,
  ORCHESTRATOR_SYSTEM_PROMPT,
  ORCHESTRATOR_OUTPUT_SCHEMA,
  // Backwards compatibility alias (deprecated)
  // Tests may still reference ARC_SPECIALIST_SUBAGENTS - provide empty object
  ARC_SPECIALIST_SUBAGENTS: {},
  // Testing exports
  _testing: {
    SPECIALIST_AGENT_NAMES
  }
};
