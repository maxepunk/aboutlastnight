/**
 * Generation Supervisor Unit Tests
 *
 * Tests for the supervisor that orchestrates the generative workflow
 * and maintains narrative compass across phases.
 *
 * See ARCHITECTURE_DECISIONS.md 8.6.1 for design rationale.
 */

const {
  generationSupervisor,
  supervisorRouter,
  createMockSupervisor,
  _testing: {
    NARRATIVE_COMPASS_SCHEMA,
    getSdkClient,
    buildNarrativeCompass,
    needsCompassBuild,
    determineNextPhase,
    buildCoherenceGuidance,
    checkForDrift
  }
} = require('../../../lib/workflow/generation-supervisor');
const { PHASES, APPROVAL_TYPES, REVISION_CAPS } = require('../../../lib/workflow/state');

describe('generation-supervisor', () => {
  describe('module exports', () => {
    it('exports generationSupervisor function', () => {
      expect(typeof generationSupervisor).toBe('function');
    });

    it('exports supervisorRouter function', () => {
      expect(typeof supervisorRouter).toBe('function');
    });

    it('exports createMockSupervisor factory', () => {
      expect(typeof createMockSupervisor).toBe('function');
    });

    it('exports _testing with helper functions', () => {
      expect(NARRATIVE_COMPASS_SCHEMA).toBeDefined();
      expect(typeof buildNarrativeCompass).toBe('function');
      expect(typeof determineNextPhase).toBe('function');
      expect(typeof buildCoherenceGuidance).toBe('function');
      expect(typeof checkForDrift).toBe('function');
    });
  });

  describe('NARRATIVE_COMPASS_SCHEMA', () => {
    it('defines core narrative elements', () => {
      expect(NARRATIVE_COMPASS_SCHEMA.coreThemes).toEqual([]);
      expect(NARRATIVE_COMPASS_SCHEMA.emotionalHook).toBe('');
      expect(NARRATIVE_COMPASS_SCHEMA.dualStory).toBeDefined();
    });

    it('defines player focus anchors', () => {
      expect(NARRATIVE_COMPASS_SCHEMA.playerFocusAnchors).toEqual([]);
      expect(NARRATIVE_COMPASS_SCHEMA.accusationContext).toBeDefined();
    });

    it('defines evidence boundaries', () => {
      expect(NARRATIVE_COMPASS_SCHEMA.evidenceBoundaries).toBeDefined();
      expect(NARRATIVE_COMPASS_SCHEMA.evidenceBoundaries.exposedTokenCount).toBe(0);
      expect(NARRATIVE_COMPASS_SCHEMA.evidenceBoundaries.buriedPatterns).toEqual([]);
    });

    it('defines voice anchors', () => {
      expect(NARRATIVE_COMPASS_SCHEMA.voiceAnchors).toBeDefined();
      expect(NARRATIVE_COMPASS_SCHEMA.voiceAnchors.novaIdentity).toContain('journalist');
      expect(NARRATIVE_COMPASS_SCHEMA.voiceAnchors.toneSpectrum).toBeDefined();
    });

    it('defines anti-patterns', () => {
      expect(NARRATIVE_COMPASS_SCHEMA.antiPatterns).toContain('em-dashes');
      expect(NARRATIVE_COMPASS_SCHEMA.antiPatterns).toContain('"token" instead of "extracted memory"');
    });
  });

  describe('getSdkClient', () => {
    it('returns injected client from config', () => {
      const mockClient = jest.fn();
      const config = { configurable: { sdkClient: mockClient } };
      expect(getSdkClient(config)).toBe(mockClient);
    });

    it('returns default when not injected', () => {
      expect(typeof getSdkClient(null)).toBe('function');
    });
  });

  describe('buildNarrativeCompass', () => {
    it('builds compass from empty state', () => {
      const compass = buildNarrativeCompass({});

      expect(compass.coreThemes).toEqual([]);
      expect(compass.playerFocusAnchors).toEqual([]);
      expect(compass.antiPatterns).toBeDefined();
    });

    it('extracts player focus suspects', () => {
      const state = {
        playerFocus: {
          suspects: ['Victoria', 'Morgan', 'Derek']
        }
      };
      const compass = buildNarrativeCompass(state);

      expect(compass.playerFocusAnchors).toEqual(['Victoria', 'Morgan', 'Derek']);
    });

    it('extracts primary investigation as emotional hook', () => {
      const state = {
        playerFocus: {
          primaryInvestigation: 'Who was working with the Valet?'
        }
      };
      const compass = buildNarrativeCompass(state);

      expect(compass.emotionalHook).toBe('Who was working with the Valet?');
    });

    it('extracts accusation context', () => {
      const state = {
        playerFocus: {
          accusation: {
            accused: 'Victoria and Morgan',
            reasoning: 'Colluded on permanent solution',
            conclusion: 'Group voted unanimously'
          }
        }
      };
      const compass = buildNarrativeCompass(state);

      expect(compass.accusationContext.accused).toBe('Victoria and Morgan');
      expect(compass.accusationContext.reasoning).toBe('Colluded on permanent solution');
    });

    it('extracts director observations as key moments', () => {
      const state = {
        directorNotes: {
          observations: {
            notableMoments: [
              'Taylor at Valet at 8:15 PM',
              'Kai\'s last transaction at 11:49 PM'
            ]
          }
        }
      };
      const compass = buildNarrativeCompass(state);

      expect(compass.keyMoments).toHaveLength(2);
      expect(compass.keyMoments[0].moment).toBe('Taylor at Valet at 8:15 PM');
      expect(compass.keyMoments[0].source).toBe('director observation');
    });

    it('extracts behavioral patterns as character dynamics', () => {
      const state = {
        directorNotes: {
          observations: {
            behaviorPatterns: [
              'Taylor and Diana interacted early, then separately',
              'James NEVER spoke to Blake'
            ]
          }
        }
      };
      const compass = buildNarrativeCompass(state);

      expect(compass.characterDynamics).toHaveLength(2);
      expect(compass.characterDynamics[0].pattern).toContain('Taylor and Diana');
    });

    it('extracts suspicious correlations into coherence notes', () => {
      const state = {
        directorNotes: {
          observations: {
            suspiciousCorrelations: [
              'ChaseT = Taylor Chase',
              'Victoria and Morgan colluding'
            ]
          }
        }
      };
      const compass = buildNarrativeCompass(state);

      expect(compass.coherenceNotes.some(n => n.includes('ChaseT'))).toBe(true);
    });

    it('extracts whiteboard key phrases as core themes', () => {
      const state = {
        directorNotes: {
          whiteboard: {
            keyPhrases: ['permanent solution', 'criminal liability']
          }
        }
      };
      const compass = buildNarrativeCompass(state);

      expect(compass.coreThemes).toContain('permanent solution');
    });

    it('extracts evidence connections into coherence notes', () => {
      const state = {
        directorNotes: {
          whiteboard: {
            evidenceConnections: [
              'Victoria + Morgan = permanent solution'
            ]
          }
        }
      };
      const compass = buildNarrativeCompass(state);

      expect(compass.coherenceNotes.some(n => n.includes('Victoria + Morgan'))).toBe(true);
    });

    it('extracts evidence boundaries from bundle', () => {
      const state = {
        evidenceBundle: {
          exposed: [{ id: 'tok1' }, { id: 'tok2' }, { id: 'tok3' }],
          buried: [
            { shellAccount: 'ChaseT', amount: 750000, tokenCount: 5 },
            { shellAccount: 'Gorlan', amount: 1125000, tokenCount: 6 }
          ]
        }
      };
      const compass = buildNarrativeCompass(state);

      expect(compass.evidenceBoundaries.exposedTokenCount).toBe(3);
      expect(compass.evidenceBoundaries.buriedPatterns).toHaveLength(2);
      expect(compass.evidenceBoundaries.buriedPatterns[0].account).toBe('ChaseT');
      // Should NOT include ownership info
      expect(compass.evidenceBoundaries.buriedPatterns[0].owner).toBeUndefined();
    });

    it('builds dual story with accusation', () => {
      const state = {
        playerFocus: {
          accusation: {
            accused: 'Victoria and Morgan'
          }
        }
      };
      const compass = buildNarrativeCompass(state);

      expect(compass.dualStory.theHook).toContain('Victoria and Morgan');
      expect(compass.dualStory.theRealStory).toContain('tech companies');
    });
  });

  describe('needsCompassBuild', () => {
    it('returns true when compass not present', () => {
      expect(needsCompassBuild({})).toBe(true);
      expect(needsCompassBuild({ supervisorNarrativeCompass: null })).toBe(true);
    });

    it('returns false when compass exists', () => {
      expect(needsCompassBuild({ supervisorNarrativeCompass: {} })).toBe(false);
    });
  });

  describe('determineNextPhase', () => {
    it('returns checkpoint when awaiting approval', () => {
      const state = { awaitingApproval: true };
      expect(determineNextPhase(state)).toBe('checkpoint');
    });

    it('returns arcSpecialists when no specialist analyses', () => {
      const state = { specialistAnalyses: {} };
      expect(determineNextPhase(state)).toBe('arcSpecialists');
    });

    it('returns arcSpecialists when specialists incomplete', () => {
      const state = {
        specialistAnalyses: {
          financial: { patterns: [] },
          behavioral: { dynamics: [] }
          // Missing victimization
        }
      };
      expect(determineNextPhase(state)).toBe('arcSpecialists');
    });

    it('returns arcSynthesis when specialists complete but no arcs', () => {
      const state = {
        specialistAnalyses: {
          financial: { patterns: ['pattern1'] },
          behavioral: { dynamics: ['dynamic1'] },
          victimization: { victims: ['victim1'] }
        }
      };
      expect(determineNextPhase(state)).toBe('arcSynthesis');
    });

    it('returns evaluateArcs when arcs exist but not evaluated', () => {
      const state = {
        specialistAnalyses: {
          financial: { patterns: [] },
          behavioral: { dynamics: [] },
          victimization: { victims: [] }
        },
        narrativeArcs: [{ name: 'Arc 1' }],
        arcRevisionCount: 0
      };
      expect(determineNextPhase(state)).toBe('evaluateArcs');
    });

    it('returns generateOutline when arcs selected but no outline', () => {
      const state = {
        specialistAnalyses: {
          financial: { patterns: [] },
          behavioral: { dynamics: [] },
          victimization: { victims: [] }
        },
        narrativeArcs: [{ name: 'Arc 1' }],
        selectedArcs: [{ name: 'Arc 1' }]
      };
      expect(determineNextPhase(state)).toBe('generateOutline');
    });

    it('returns evaluateOutline when outline exists but not evaluated', () => {
      const state = {
        specialistAnalyses: {
          financial: { patterns: [] },
          behavioral: { dynamics: [] },
          victimization: { victims: [] }
        },
        narrativeArcs: [{ name: 'Arc 1' }],
        selectedArcs: [{ name: 'Arc 1' }],
        outline: { sections: [] },
        outlineRevisionCount: 0
      };
      expect(determineNextPhase(state)).toBe('evaluateOutline');
    });

    it('returns generateArticle when outline approved', () => {
      const state = {
        specialistAnalyses: {
          financial: { patterns: [] },
          behavioral: { dynamics: [] },
          victimization: { victims: [] }
        },
        narrativeArcs: [{ name: 'Arc 1' }],
        selectedArcs: [{ name: 'Arc 1' }],
        outline: { sections: [] },
        currentPhase: PHASES.OUTLINE_EVALUATION
      };
      expect(determineNextPhase(state)).toBe('generateArticle');
    });

    it('returns checkpoint for outline approval', () => {
      const state = {
        specialistAnalyses: {
          financial: { patterns: [] },
          behavioral: { dynamics: [] },
          victimization: { victims: [] }
        },
        narrativeArcs: [{ name: 'Arc 1' }],
        selectedArcs: [{ name: 'Arc 1' }],
        outline: { sections: [] },
        currentPhase: PHASES.OUTLINE_EVALUATION,
        awaitingApproval: true,
        approvalType: APPROVAL_TYPES.OUTLINE
      };
      expect(determineNextPhase(state)).toBe('checkpoint');
    });

    it('returns evaluateArticle when content exists but not evaluated', () => {
      const state = {
        specialistAnalyses: {
          financial: { patterns: [] },
          behavioral: { dynamics: [] },
          victimization: { victims: [] }
        },
        narrativeArcs: [{ name: 'Arc 1' }],
        selectedArcs: [{ name: 'Arc 1' }],
        outline: { sections: [] },
        contentBundle: { headline: {} },
        articleRevisionCount: 0
      };
      expect(determineNextPhase(state)).toBe('evaluateArticle');
    });

    it('returns complete when article evaluated and approved', () => {
      const state = {
        specialistAnalyses: {
          financial: { patterns: [] },
          behavioral: { dynamics: [] },
          victimization: { victims: [] }
        },
        narrativeArcs: [{ name: 'Arc 1' }],
        selectedArcs: [{ name: 'Arc 1' }],
        outline: { sections: [] },
        contentBundle: { headline: {} },
        currentPhase: PHASES.ARTICLE_EVALUATION
      };
      expect(determineNextPhase(state)).toBe('complete');
    });
  });

  describe('buildCoherenceGuidance', () => {
    const createCompass = () => ({
      playerFocusAnchors: ['Victoria', 'Morgan', 'Derek'],
      dualStory: {
        theHook: 'Who killed Marcus?',
        theRealStory: 'Memory as commodity'
      },
      coherenceNotes: ['Director noted: ChaseT = Taylor'],
      evidenceBoundaries: {
        exposedTokenCount: 10,
        buriedPatterns: []
      },
      antiPatterns: ['em-dashes', 'tokens']
    });

    describe('arcs phase', () => {
      it('includes director observations priority', () => {
        const guidance = buildCoherenceGuidance(createCompass(), 'arcs');

        expect(guidance.mustMaintain.some(m => m.includes('Director observations'))).toBe(true);
        expect(guidance.mustMaintain.some(m => m.includes('PRIMARY weight'))).toBe(true);
      });

      it('includes whiteboard prioritization', () => {
        const guidance = buildCoherenceGuidance(createCompass(), 'arcs');

        expect(guidance.mustMaintain.some(m => m.includes('Whiteboard'))).toBe(true);
        expect(guidance.mustMaintain.some(m => m.includes('PRIORITIZATION'))).toBe(true);
      });

      it('includes roster coverage requirement', () => {
        const guidance = buildCoherenceGuidance(createCompass(), 'arcs');

        expect(guidance.mustMaintain.some(m => m.includes('roster member'))).toBe(true);
      });

      it('includes follow threads not people', () => {
        const guidance = buildCoherenceGuidance(createCompass(), 'arcs');

        expect(guidance.mustMaintain.some(m => m.includes('THREADS'))).toBe(true);
      });
    });

    describe('outline phase', () => {
      it('includes structural decision principle', () => {
        const guidance = buildCoherenceGuidance(createCompass(), 'outline');

        expect(guidance.mustMaintain.some(m => m.includes('structural decisions'))).toBe(true);
      });

      it('includes visual rhythm rule', () => {
        const guidance = buildCoherenceGuidance(createCompass(), 'outline');

        expect(guidance.mustMaintain.some(m => m.includes('3 consecutive paragraphs'))).toBe(true);
      });

      it('includes section differentiation', () => {
        const guidance = buildCoherenceGuidance(createCompass(), 'outline');

        expect(guidance.mustMaintain.some(m => m.includes('DIFFERENT question'))).toBe(true);
      });

      it('includes coherence notes from compass', () => {
        const guidance = buildCoherenceGuidance(createCompass(), 'outline');

        expect(guidance.mustMaintain.some(m => m.includes('ChaseT'))).toBe(true);
      });
    });

    describe('article phase', () => {
      it('includes first-person voice requirement', () => {
        const guidance = buildCoherenceGuidance(createCompass(), 'article');

        expect(guidance.mustMaintain.some(m => m.includes('First-person'))).toBe(true);
        expect(guidance.mustMaintain.some(m => m.includes('I was there'))).toBe(true);
      });

      it('includes no em-dashes', () => {
        const guidance = buildCoherenceGuidance(createCompass(), 'article');

        expect(guidance.mustMaintain.some(m => m.includes('em-dashes'))).toBe(true);
      });

      it('includes extracted memories language', () => {
        const guidance = buildCoherenceGuidance(createCompass(), 'article');

        expect(guidance.mustMaintain.some(m => m.includes('Extracted memories'))).toBe(true);
      });

      it('includes Blake handling', () => {
        const guidance = buildCoherenceGuidance(createCompass(), 'article');

        expect(guidance.mustMaintain.some(m => m.includes('Blake'))).toBe(true);
      });

      it('includes evidence boundary counts', () => {
        const guidance = buildCoherenceGuidance(createCompass(), 'article');

        expect(guidance.mustMaintain.some(m => m.includes('10 exposed tokens'))).toBe(true);
        expect(guidance.mustMaintain.some(m => m.includes('CANNOT report whose'))).toBe(true);
      });

      it('includes dual story in voice reminders', () => {
        const guidance = buildCoherenceGuidance(createCompass(), 'article');

        expect(guidance.voiceReminders.some(r => r.includes('Marcus'))).toBe(true);
        expect(guidance.voiceReminders.some(r => r.includes('commodity'))).toBe(true);
      });
    });

    it('includes anti-patterns for all phases', () => {
      ['arcs', 'outline', 'article'].forEach(phase => {
        const guidance = buildCoherenceGuidance(createCompass(), phase);
        expect(guidance.mustAvoid).toContain('em-dashes');
      });
    });

    it('includes player focus anchors in priority', () => {
      const guidance = buildCoherenceGuidance(createCompass(), 'arcs');

      expect(guidance.narrativePriority).toContain('Victoria');
      expect(guidance.narrativePriority).toContain('Morgan');
    });
  });

  describe('checkForDrift', () => {
    const createCompass = () => ({
      playerFocusAnchors: ['Victoria', 'Morgan'],
      antiPatterns: ['em-dashes', '"token" instead of "extracted memory"'],
      coherenceNotes: []
    });

    describe('arcs phase', () => {
      it('detects missing player focus', () => {
        const output = {
          narrativeArcs: [
            { name: 'Some Other Arc', description: 'Not about Victoria or Morgan' }
          ]
        };
        const drift = checkForDrift(createCompass(), output, 'arcs');

        expect(drift.hasDrift).toBe(true);
        expect(drift.issues.some(i => i.type === 'player-focus-missing')).toBe(true);
      });

      it('passes when player focus represented', () => {
        const output = {
          narrativeArcs: [
            { name: 'Victoria and Morgan Collusion', description: 'The colluders' }
          ]
        };
        const drift = checkForDrift(createCompass(), output, 'arcs');

        expect(drift.issues.filter(i => i.type === 'player-focus-missing')).toHaveLength(0);
      });

      it('detects Layer 2 violations', () => {
        const output = {
          narrativeArcs: [
            {
              name: 'Buried Secrets',
              description: 'Victoria\'s memory was buried showing the murder'
            }
          ]
        };
        const drift = checkForDrift(createCompass(), output, 'arcs');

        expect(drift.hasDrift).toBe(true);
        expect(drift.issues.some(i => i.type === 'layer-2-violation')).toBe(true);
      });
    });

    describe('article phase', () => {
      it('detects em-dashes', () => {
        const output = {
          contentBundle: {
            sections: [{ content: 'Marcus—the founder—was dead' }]
          }
        };
        const drift = checkForDrift(createCompass(), output, 'article');

        expect(drift.hasDrift).toBe(true);
        expect(drift.issues.some(i => i.detail.includes('em-dash'))).toBe(true);
      });

      it('detects token language', () => {
        const output = {
          contentBundle: {
            sections: [{ content: 'The token was exposed' }]
          }
        };
        const drift = checkForDrift(createCompass(), output, 'article');

        expect(drift.hasDrift).toBe(true);
        expect(drift.issues.some(i => i.detail.includes('token'))).toBe(true);
      });

      it('allows extracted memory language', () => {
        const output = {
          contentBundle: {
            sections: [{ content: 'The extracted memory was exposed' }]
          }
        };
        const drift = checkForDrift(createCompass(), output, 'article');

        // Should not flag "extracted memory"
        expect(drift.issues.filter(i => i.detail.includes('token'))).toHaveLength(0);
      });

      it('returns no drift for clean content', () => {
        const output = {
          contentBundle: {
            sections: [{ content: 'Marcus is dead. Victoria did it.' }]
          }
        };
        const drift = checkForDrift(createCompass(), output, 'article');

        expect(drift.hasDrift).toBe(false);
      });
    });
  });

  describe('generationSupervisor', () => {
    it('builds compass when missing', async () => {
      const state = {
        playerFocus: { suspects: ['Victoria'] }
      };
      const result = await generationSupervisor(state, {});

      expect(result.supervisorNarrativeCompass).toBeDefined();
      expect(result.supervisorNarrativeCompass.playerFocusAnchors).toContain('Victoria');
    });

    it('preserves existing compass', async () => {
      const existingCompass = { coreThemes: ['Test Theme'] };
      const state = {
        supervisorNarrativeCompass: existingCompass
      };
      const result = await generationSupervisor(state, {});

      expect(result.supervisorNarrativeCompass).toBe(existingCompass);
    });

    it('returns checkpoint when awaiting approval', async () => {
      const state = {
        awaitingApproval: true,
        currentPhase: PHASES.ARC_EVALUATION
      };
      const result = await generationSupervisor(state, {});

      expect(result.currentPhase).toBe(PHASES.ARC_EVALUATION);
    });

    it('returns complete phase when done', async () => {
      const state = {
        specialistAnalyses: {
          financial: { patterns: [] },
          behavioral: { dynamics: [] },
          victimization: { victims: [] }
        },
        narrativeArcs: [{ name: 'Arc 1' }],
        selectedArcs: [{ name: 'Arc 1' }],
        outline: { sections: [] },
        contentBundle: { headline: {} },
        currentPhase: PHASES.ARTICLE_EVALUATION
      };
      const result = await generationSupervisor(state, {});

      expect(result.currentPhase).toBe(PHASES.COMPLETE);
    });

    it('sets routing to arcSpecialists when needed', async () => {
      const state = { specialistAnalyses: {} };
      const result = await generationSupervisor(state, {});

      expect(result._supervisorRouting).toBe('arcSpecialists');
    });

    it('sets routing to arcSynthesis when specialists complete', async () => {
      const state = {
        specialistAnalyses: {
          financial: { patterns: ['p1'] },
          behavioral: { dynamics: ['d1'] },
          victimization: { victims: ['v1'] }
        }
      };
      const result = await generationSupervisor(state, {});

      expect(result._supervisorRouting).toBe('arcSynthesis');
    });

    it('includes coherence guidance for synthesis', async () => {
      const state = {
        specialistAnalyses: {
          financial: { patterns: ['p1'] },
          behavioral: { dynamics: ['d1'] },
          victimization: { victims: ['v1'] }
        },
        playerFocus: { suspects: ['Victoria'] }
      };
      const result = await generationSupervisor(state, {});

      expect(result._coherenceGuidance).toBeDefined();
      expect(result._coherenceGuidance.phase).toBe('arcs');
    });
  });

  describe('supervisorRouter', () => {
    it('uses _supervisorRouting from state', () => {
      const state = { _supervisorRouting: 'evaluateArcs' };
      expect(supervisorRouter(state)).toBe('evaluateArcs');
    });

    it('falls back to determineNextPhase', () => {
      const state = {
        awaitingApproval: true
      };
      expect(supervisorRouter(state)).toBe('checkpoint');
    });
  });

  describe('createMockSupervisor', () => {
    it('creates supervisor that returns specified next phase', async () => {
      const mock = createMockSupervisor({ nextPhase: 'generateOutline' });
      const result = await mock({}, {});

      expect(result._supervisorRouting).toBe('generateOutline');
    });

    it('creates supervisor that returns complete', async () => {
      const mock = createMockSupervisor({ nextPhase: 'complete' });
      const result = await mock({}, {});

      expect(result.currentPhase).toBe(PHASES.COMPLETE);
    });

    it('builds compass by default', async () => {
      const mock = createMockSupervisor({});
      const result = await mock({ playerFocus: { suspects: ['Test'] } }, {});

      expect(result.supervisorNarrativeCompass).toBeDefined();
    });

    it('can skip compass building', async () => {
      const mock = createMockSupervisor({ buildCompass: false });
      const result = await mock({}, {});

      expect(result.supervisorNarrativeCompass).toBeUndefined();
    });
  });

  describe('integration: narrative compass usage', () => {
    it('compass guides arc phase correctly', async () => {
      const state = {
        playerFocus: {
          suspects: ['Victoria', 'Morgan'],
          primaryInvestigation: 'Who was working with the Valet?',
          accusation: {
            accused: 'Victoria and Morgan',
            reasoning: 'Permanent solution'
          }
        },
        directorNotes: {
          observations: {
            behaviorPatterns: ['Taylor and Diana at Valet early'],
            suspiciousCorrelations: ['ChaseT = Taylor Chase']
          },
          whiteboard: {
            keyPhrases: ['permanent solution'],
            evidenceConnections: ['Victoria + Morgan colluding']
          }
        },
        evidenceBundle: {
          exposed: [{ id: 't1' }, { id: 't2' }],
          buried: [{ shellAccount: 'ChaseT', amount: 750000 }]
        },
        specialistAnalyses: {
          financial: { patterns: ['p1'] },
          behavioral: { dynamics: ['d1'] },
          victimization: { victims: ['v1'] }
        }
      };

      const result = await generationSupervisor(state, {});
      const compass = result.supervisorNarrativeCompass;

      // Compass should have player focus
      expect(compass.playerFocusAnchors).toContain('Victoria');
      expect(compass.playerFocusAnchors).toContain('Morgan');

      // Compass should have accusation
      expect(compass.accusationContext.accused).toBe('Victoria and Morgan');

      // Compass should have director observations
      expect(compass.characterDynamics[0].pattern).toContain('Taylor and Diana');

      // Compass should have coherence notes
      expect(compass.coherenceNotes.some(n => n.includes('ChaseT'))).toBe(true);

      // Compass should have evidence boundaries
      expect(compass.evidenceBoundaries.exposedTokenCount).toBe(2);
      expect(compass.evidenceBoundaries.buriedPatterns[0].account).toBe('ChaseT');

      // Coherence guidance should be for arcs phase
      expect(result._coherenceGuidance.phase).toBe('arcs');
      expect(result._coherenceGuidance.narrativePriority).toContain('Victoria');
    });
  });
});
