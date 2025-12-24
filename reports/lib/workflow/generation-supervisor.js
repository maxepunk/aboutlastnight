/**
 * Generation Supervisor - Keeper of the Vision
 *
 * Orchestrates Arc Analysis → Outline → Article as one cohesive workflow.
 * Maintains "narrative compass" that all phases reference to ensure
 * the final article tells one coherent story.
 *
 * Key Responsibilities:
 * 1. Build and maintain narrative compass from evidence + player focus
 * 2. Route between phases based on state
 * 3. Detect drift and request revision with guidance
 * 4. Ensure human always approves at checkpoints
 *
 * The supervisor DOES NOT generate content - it orchestrates.
 * Content generation happens in arc-specialist-nodes, outline generator,
 * and article generator. The supervisor ensures they align.
 *
 * See ARCHITECTURE_DECISIONS.md 8.6.1 for design rationale.
 */

const { PHASES, APPROVAL_TYPES, REVISION_CAPS } = require('./state');
const { callClaude } = require('../claude-client');

/**
 * Narrative compass structure - the "north star" for all phases
 * Built from evidence bundle + player focus + director observations
 */
const NARRATIVE_COMPASS_SCHEMA = {
  // Core narrative elements
  coreThemes: [], // e.g., ["Betrayal", "Corporate greed", "Hidden alliances"]
  emotionalHook: '', // The dual story hook (murder + systemic critique)
  dualStory: {
    theHook: '', // Who killed Marcus? What happened?
    theRealStory: '' // What this means for all of us (systemic critique)
  },

  // Player focus from whiteboard (Layer 3 - drives arc prioritization)
  playerFocusAnchors: [], // What players concluded/emphasized
  accusationContext: {
    accused: '',
    reasoning: '',
    playerConclusion: ''
  },

  // Key moments from director observations (Layer 3 - primary weight)
  keyMoments: [], // { moment, source: 'director observation' | 'whiteboard' }
  characterDynamics: [], // From director observations

  // Evidence boundaries (Layer model)
  evidenceBoundaries: {
    exposedTokenCount: 0, // Layer 1 - full reportability
    buriedPatterns: [], // Layer 2 - account names, amounts, NO ownership
    directorObservations: [] // Layer 3 - shapes focus
  },

  // Coherence notes for downstream phases
  coherenceNotes: [], // e.g., "Outline must connect Taylor's early activity to final accusation"

  // Voice consistency anchors
  voiceAnchors: {
    novaIdentity: 'Tech accountability journalist, present at scene',
    voiceBlend: 'Silicon Valley insider-skeptic meets gonzo journalism',
    toneSpectrum: {
      evidence: 'Precise, factual, grounded',
      corporateMalfeasance: 'Sardonic, cutting (at the system)',
      humanStakes: 'Empathetic, visceral, personal',
      missingInfo: 'Curious, not accusatory',
      biggerPicture: 'Urgent, consequential',
      blake: 'Suspicious but not condemning',
      sources: 'Grateful, celebratory'
    }
  },

  // Anti-patterns to avoid
  antiPatterns: [
    'neutral wire-service voice',
    'breathless tech hype',
    'em-dashes',
    '"token" instead of "extracted memory"',
    'fabricating moments',
    'character cataloging',
    'shaming those who buried',
    'condemning Blake'
  ]
};

/**
 * Get Claude client from config or use default
 */
function getClaudeClient(config) {
  return config?.configurable?.claudeClient || callClaude;
}

/**
 * Build narrative compass from state
 * Called when entering the generation supervisor for the first time
 *
 * @param {Object} state - Current state with evidenceBundle, playerFocus, directorNotes
 * @returns {Object} Narrative compass
 */
function buildNarrativeCompass(state) {
  const compass = JSON.parse(JSON.stringify(NARRATIVE_COMPASS_SCHEMA));

  // Extract player focus
  const playerFocus = state.playerFocus || {};
  compass.playerFocusAnchors = playerFocus.suspects || [];

  if (playerFocus.primaryInvestigation) {
    compass.emotionalHook = playerFocus.primaryInvestigation;
  }

  // Extract accusation context
  if (playerFocus.accusation) {
    compass.accusationContext = {
      accused: playerFocus.accusation.accused || '',
      reasoning: playerFocus.accusation.reasoning || '',
      playerConclusion: playerFocus.accusation.conclusion || ''
    };
  }

  // Extract key moments from director notes
  const directorNotes = state.directorNotes || {};
  if (directorNotes.observations) {
    const obs = directorNotes.observations;

    // Behavioral patterns become character dynamics
    if (obs.behaviorPatterns) {
      compass.characterDynamics = obs.behaviorPatterns.map(pattern => ({
        pattern,
        source: 'director observation'
      }));
    }

    // Notable moments become key moments
    if (obs.notableMoments) {
      compass.keyMoments = obs.notableMoments.map(moment => ({
        moment,
        source: 'director observation'
      }));
    }

    // Suspicious correlations add to coherence notes
    if (obs.suspiciousCorrelations) {
      obs.suspiciousCorrelations.forEach(corr => {
        compass.coherenceNotes.push(`Director noted: ${corr}`);
      });
    }
  }

  // Extract whiteboard insights (interpreted through director observations)
  if (directorNotes.whiteboard) {
    const wb = directorNotes.whiteboard;

    // Key phrases become core themes
    if (wb.keyPhrases) {
      compass.coreThemes = wb.keyPhrases;
    }

    // Evidence connections add to coherence notes
    if (wb.evidenceConnections) {
      wb.evidenceConnections.forEach(conn => {
        compass.coherenceNotes.push(`Players connected: ${conn}`);
      });
    }
  }

  // Extract evidence boundaries from evidence bundle
  const bundle = state.evidenceBundle || {};
  if (bundle.exposed) {
    compass.evidenceBoundaries.exposedTokenCount = bundle.exposed.length;
  }
  if (bundle.buried) {
    // Only include observable patterns (Layer 2 boundaries)
    compass.evidenceBoundaries.buriedPatterns = (bundle.buried || []).map(b => ({
      account: b.shellAccount || b.account,
      amount: b.amount,
      tokenCount: b.tokenCount
      // NO ownership info - that's not visible
    }));
  }

  // Set the dual story
  compass.dualStory = {
    theHook: `Who killed ${compass.accusationContext.accused || 'Marcus'}? What happened at that party?`,
    theRealStory: 'What happens when tech companies treat human experience as a commodity. Memory as currency. The logical endpoint of surveillance capitalism.'
  };

  return compass;
}

/**
 * Check if narrative compass needs to be built
 */
function needsCompassBuild(state) {
  return !state.supervisorNarrativeCompass;
}

/**
 * Determine next routing destination based on current state
 *
 * The supervisor routes to different phases based on what's complete:
 * 1. No specialist analyses → route to arc specialists (will be parallel)
 * 2. Specialists done but no synthesis → route to synthesizer
 * 3. Synthesis done but not evaluated → route to arc evaluator
 * 4. Arcs evaluated, ready for human → checkpoint
 * 5. Arcs approved, no outline → route to outline generator
 * 6. Continue pattern for outline, article
 *
 * @param {Object} state - Current state
 * @returns {string} Next node name or 'END'
 */
function determineNextPhase(state) {
  // Check if we're at a checkpoint waiting for approval
  if (state.awaitingApproval) {
    return 'checkpoint';
  }

  // Phase progression:
  // 1. Arc specialists (financial, behavioral, victimization)
  const specialists = state.specialistAnalyses || {};
  const hasFinancial = specialists.financial && Object.keys(specialists.financial).length > 0;
  const hasBehavioral = specialists.behavioral && Object.keys(specialists.behavioral).length > 0;
  const hasVictimization = specialists.victimization && Object.keys(specialists.victimization).length > 0;

  if (!hasFinancial || !hasBehavioral || !hasVictimization) {
    return 'arcSpecialists';
  }

  // 2. Arc synthesis
  if (!state.narrativeArcs) {
    return 'arcSynthesis';
  }

  // 3. Arc evaluation
  if (state.currentPhase !== PHASES.ARC_EVALUATION && !state.selectedArcs) {
    // Need to evaluate arcs
    const arcRevisions = state.arcRevisionCount || 0;
    if (arcRevisions < REVISION_CAPS.ARCS) {
      return 'evaluateArcs';
    }
  }

  // 4. Arcs approved, need outline
  if (state.selectedArcs && !state.outline) {
    return 'generateOutline';
  }

  // 5. Outline evaluation
  if (state.outline && !state.contentBundle && state.currentPhase !== PHASES.OUTLINE_EVALUATION) {
    const outlineRevisions = state.outlineRevisionCount || 0;
    if (outlineRevisions < REVISION_CAPS.OUTLINE) {
      return 'evaluateOutline';
    }
  }

  // 6. Outline approved, need article
  if (state.outline && state.currentPhase === PHASES.OUTLINE_EVALUATION) {
    // Check if evaluation passed and approved
    if (state.awaitingApproval && state.approvalType === APPROVAL_TYPES.OUTLINE) {
      return 'checkpoint';
    }
    // If not awaiting, generate article
    return 'generateArticle';
  }

  // 7. Article evaluation
  if (state.contentBundle && state.currentPhase !== PHASES.ARTICLE_EVALUATION) {
    const articleRevisions = state.articleRevisionCount || 0;
    if (articleRevisions < REVISION_CAPS.ARTICLE) {
      return 'evaluateArticle';
    }
  }

  // 8. Article approved, complete
  if (state.contentBundle && state.currentPhase === PHASES.ARTICLE_EVALUATION) {
    if (state.awaitingApproval && state.approvalType === APPROVAL_TYPES.ARTICLE) {
      return 'checkpoint';
    }
    return 'complete';
  }

  // Default: complete
  return 'complete';
}

/**
 * Build coherence guidance for a specific phase
 * Helps downstream phases maintain alignment with narrative compass
 *
 * @param {Object} compass - Narrative compass
 * @param {string} phase - Target phase
 * @returns {Object} Coherence guidance
 */
function buildCoherenceGuidance(compass, phase) {
  const guidance = {
    phase,
    narrativePriority: compass.playerFocusAnchors.slice(0, 3),
    mustMaintain: [],
    mustAvoid: compass.antiPatterns,
    voiceReminders: []
  };

  switch (phase) {
    case 'arcs':
      guidance.mustMaintain = [
        'Director observations are PRIMARY weight for analysis',
        'Whiteboard conclusions drive arc PRIORITIZATION',
        'Every roster member needs placement opportunity',
        'Follow THREADS not PEOPLE',
        compass.dualStory.theRealStory
      ];
      guidance.voiceReminders = [
        'This article tells the story of THIS GROUP\'s investigation',
        'Player emphasis determines arc order, not evidence volume'
      ];
      break;

    case 'outline':
      guidance.mustMaintain = [
        'All structural decisions made HERE, before generation',
        'Evidence cards REPLACE paragraphs, not supplement',
        'Never more than 3 consecutive paragraphs without visual break',
        'Each section answers a DIFFERENT question',
        ...compass.coherenceNotes
      ];
      guidance.voiceReminders = [
        'Outline determines where photos, quotes, and cards go',
        'Generator just writes prose around pre-placed elements'
      ];
      break;

    case 'article':
      guidance.mustMaintain = [
        'First-person participatory voice ("I was there when...")',
        'No em-dashes anywhere',
        '"Extracted memories" never "tokens"',
        'Blake suspicious but not condemned',
        'Systemic critique woven throughout',
        'Celebrate sources who exposed',
        'Understand (not judge) those who buried'
      ];
      guidance.voiceReminders = [
        'Nova IS the journalist who was present',
        'Follow the outline EXACTLY',
        compass.dualStory.theHook,
        compass.dualStory.theRealStory
      ];
      // Add evidence boundary reminders
      guidance.mustMaintain.push(
        `${compass.evidenceBoundaries.exposedTokenCount} exposed tokens - CAN quote content`,
        'Buried patterns - CAN report accounts/amounts, CANNOT report whose memories'
      );
      break;
  }

  return guidance;
}

/**
 * Check for drift between phase output and narrative compass
 * Returns issues if content drifts from the established vision
 *
 * @param {Object} compass - Narrative compass
 * @param {Object} phaseOutput - Output from a generative phase
 * @param {string} phase - Which phase produced this output
 * @returns {Object} Drift analysis { hasDrift, issues, guidance }
 */
function checkForDrift(compass, phaseOutput, phase) {
  const issues = [];

  // Check arc analysis drift
  if (phase === 'arcs' && phaseOutput.narrativeArcs) {
    const arcs = phaseOutput.narrativeArcs;

    // Check if player focus anchors are represented
    const arcNames = arcs.map(a => (a.name || '').toLowerCase());
    compass.playerFocusAnchors.forEach(anchor => {
      const anchorLower = anchor.toLowerCase();
      const hasMatch = arcNames.some(name =>
        name.includes(anchorLower) || anchorLower.includes(name)
      );
      if (!hasMatch) {
        issues.push({
          type: 'player-focus-missing',
          detail: `Player focus "${anchor}" not represented in arcs`,
          guidance: `Add arc addressing "${anchor}" or explain why it's not present`
        });
      }
    });

    // Check if arcs mention Layer 2 content incorrectly
    arcs.forEach(arc => {
      const description = arc.description || '';
      if (description.includes('memory was buried') && description.includes('showing')) {
        issues.push({
          type: 'layer-2-violation',
          detail: `Arc "${arc.name}" describes buried memory content`,
          guidance: 'Cannot report buried memory content - only account patterns visible'
        });
      }
    });
  }

  // Check outline drift
  if (phase === 'outline' && phaseOutput.sections) {
    // Check for proper section differentiation
    const sectionTopics = phaseOutput.sections.map(s => s.content || '').join(' ');

    // Anti-pattern: repetition across sections
    compass.coherenceNotes.forEach(note => {
      // Just note these for review, not automatic issues
    });
  }

  // Check article drift
  if (phase === 'article' && phaseOutput.contentBundle) {
    const content = JSON.stringify(phaseOutput.contentBundle);

    // Check for anti-patterns
    compass.antiPatterns.forEach(pattern => {
      if (pattern === 'em-dashes' && content.includes('—')) {
        issues.push({
          type: 'anti-pattern',
          detail: 'Article contains em-dashes',
          guidance: 'Replace em-dashes with periods or restructure sentences'
        });
      }
      if (pattern.includes('token') && /\btoken[s]?\b/i.test(content)) {
        // Check if it's not "extracted memory token" which could be ok
        if (!/extracted\s+memory/i.test(content)) {
          issues.push({
            type: 'anti-pattern',
            detail: 'Article uses "token" instead of "extracted memory"',
            guidance: 'Replace "token" with "extracted memory" or "stolen memory"'
          });
        }
      }
    });
  }

  return {
    hasDrift: issues.length > 0,
    issues,
    guidance: issues.map(i => i.guidance)
  };
}

/**
 * Main supervisor node function
 *
 * This node is called repeatedly as the workflow progresses.
 * It maintains the narrative compass and routes to appropriate phases.
 *
 * @param {Object} state - Current state
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update
 */
async function generationSupervisor(state, config) {
  console.log('[generationSupervisor] Entering supervisor');

  // Build narrative compass if needed
  let compass = state.supervisorNarrativeCompass;
  if (needsCompassBuild(state)) {
    console.log('[generationSupervisor] Building narrative compass');
    compass = buildNarrativeCompass(state);
  }

  // Determine next phase
  const nextPhase = determineNextPhase(state);
  console.log(`[generationSupervisor] Next phase: ${nextPhase}`);

  // If we're at a checkpoint, just update state
  if (nextPhase === 'checkpoint') {
    return {
      supervisorNarrativeCompass: compass,
      currentPhase: state.currentPhase
    };
  }

  // If complete, signal end
  if (nextPhase === 'complete') {
    return {
      supervisorNarrativeCompass: compass,
      currentPhase: PHASES.COMPLETE
    };
  }

  // Build coherence guidance for the target phase
  let coherenceGuidance = null;
  if (['arcSynthesis', 'generateOutline', 'generateArticle'].includes(nextPhase)) {
    const phaseMap = {
      arcSynthesis: 'arcs',
      generateOutline: 'outline',
      generateArticle: 'article'
    };
    coherenceGuidance = buildCoherenceGuidance(compass, phaseMap[nextPhase]);
    console.log(`[generationSupervisor] Built coherence guidance for ${phaseMap[nextPhase]}`);
  }

  // Return updated state with routing info
  return {
    supervisorNarrativeCompass: compass,
    // The graph will use conditional edges to route based on this
    _supervisorRouting: nextPhase,
    _coherenceGuidance: coherenceGuidance,
    currentPhase: PHASES.GENERATION_SUPERVISOR
  };
}

/**
 * Supervisor routing function for conditional edges
 * Returns the node name to route to
 *
 * @param {Object} state - Current state
 * @returns {string} Node name to route to
 */
function supervisorRouter(state) {
  // Use the routing decision from the supervisor
  if (state._supervisorRouting) {
    return state._supervisorRouting;
  }

  // Fallback: determine from state
  return determineNextPhase(state);
}

/**
 * Create mock supervisor for testing
 *
 * @param {Object} options - Mock configuration
 * @returns {Function} Mock supervisor function
 */
function createMockSupervisor(options = {}) {
  const {
    nextPhase = 'complete',
    buildCompass = true
  } = options;

  return async function mockSupervisor(state, config) {
    let compass = state.supervisorNarrativeCompass;

    if (buildCompass && !compass) {
      compass = buildNarrativeCompass(state);
    }

    return {
      supervisorNarrativeCompass: compass,
      _supervisorRouting: nextPhase,
      currentPhase: nextPhase === 'complete' ? PHASES.COMPLETE : PHASES.GENERATION_SUPERVISOR
    };
  };
}

module.exports = {
  // Main exports
  generationSupervisor,
  supervisorRouter,
  createMockSupervisor,

  // Testing exports
  _testing: {
    NARRATIVE_COMPASS_SCHEMA,
    getClaudeClient,
    buildNarrativeCompass,
    needsCompassBuild,
    determineNextPhase,
    buildCoherenceGuidance,
    checkForDrift
  }
};
