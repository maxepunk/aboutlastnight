/**
 * checkpointInputReview — dedicated input-review checkpoint node (CODE-REVIEW B2, B8)
 *
 * B2: the interrupt used to live INSIDE parseRawInput, after three SDK calls and
 * three file writes. LangGraph re-executes an interrupted node from its top on
 * resume, so every approve re-paid the whole parse. B8: the checkpoint never
 * fired at all, because its skip condition (`sessionConfig.roster?.length > 0`)
 * was satisfied by the parse that had just run two statements earlier.
 *
 * The interrupt now lives in its own node (the checkpoint-nodes.js SRP pattern)
 * and gates on a dedicated `inputReviewApproved` channel. A reject with
 * corrections nulls the parse outputs and routes back to parseRawInput.
 */

jest.mock('../../../lib/workflow/checkpoint-helpers',
  () => require('../../mocks/checkpoint-helpers.mock'));

const {
  _testing: { checkpointInputReview }
} = require('../../../lib/workflow/nodes/checkpoint-nodes');

const { checkpointInterrupt } = require('../../../lib/workflow/checkpoint-helpers');

const PARSED_STATE = {
  inputReviewApproved: false,
  sessionConfig: { roster: ['Vic', 'Mel'], accusation: { accused: ['Blake'] } },
  directorNotes: { rawProse: 'They circled each other all morning.' },
  playerFocus: { primaryInvestigation: 'Who buried the ledger?' },
  canonicalCharacters: { Vic: 'Vic Kingsley' }
};

describe('checkpointInputReview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('interrupts with the parsed input when inputReviewApproved is false', async () => {
    await checkpointInputReview({ ...PARSED_STATE }, {});

    expect(checkpointInterrupt).toHaveBeenCalledWith(
      'input-review',
      expect.objectContaining({
        sessionConfig: PARSED_STATE.sessionConfig,
        directorNotes: PARSED_STATE.directorNotes,
        playerFocus: PARSED_STATE.playerFocus,
        canonicalCharacters: PARSED_STATE.canonicalCharacters
      }),
      null
    );
  });

  it('does not interrupt when inputReviewApproved is already true', async () => {
    const result = await checkpointInputReview(
      { ...PARSED_STATE, inputReviewApproved: true },
      {}
    );

    // skipCondition truthy => checkpointInterrupt returns it without pausing
    expect(checkpointInterrupt).toHaveBeenCalledWith(
      'input-review',
      expect.any(Object),
      true
    );
    expect(result.inputReviewApproved).toBe(true);
    expect(result).not.toHaveProperty('sessionConfig');
  });

  it('approves on resume value { approved: true }', async () => {
    checkpointInterrupt.mockReturnValueOnce({ approved: true });

    const result = await checkpointInputReview({ ...PARSED_STATE }, {});

    expect(result.inputReviewApproved).toBe(true);
    expect(result._inputCorrections).toBeNull();
  });

  it('captures corrections and nulls the parse outputs on reject', async () => {
    checkpointInterrupt.mockReturnValueOnce({
      approved: false,
      feedback: 'Blake said the dead-man line, not Casper'
    });

    const result = await checkpointInputReview({ ...PARSED_STATE }, {});

    expect(result.inputReviewApproved).toBe(false);
    expect(result._inputCorrections).toBe('Blake said the dead-man line, not Casper');
    // parseRawInput skips when sessionConfig is populated — null it so the
    // re-parse actually runs.
    expect(result.sessionConfig).toBeNull();
    expect(result.directorNotes).toBeNull();
    expect(result.playerFocus).toBeNull();
  });

  it('treats a reject with blank feedback as an approve (no re-parse loop)', async () => {
    checkpointInterrupt.mockReturnValueOnce({ approved: false, feedback: '   ' });

    const result = await checkpointInputReview({ ...PARSED_STATE }, {});

    expect(result.inputReviewApproved).toBe(true);
    expect(result._inputCorrections).toBeNull();
  });
});

describe('state channels for the input-review checkpoint', () => {
  const { ReportStateAnnotation, getDefaultState } = require('../../../lib/workflow/state');

  it('declares inputReviewApproved and _inputCorrections (LangGraph drops undeclared keys)', () => {
    const channels = Object.keys(ReportStateAnnotation.spec);
    expect(channels).toContain('inputReviewApproved');
    expect(channels).toContain('_inputCorrections');
  });

  it('defaults inputReviewApproved to false and _inputCorrections to null', () => {
    const state = getDefaultState();
    expect(state.inputReviewApproved).toBe(false);
    expect(state._inputCorrections).toBeNull();
  });
});

describe('parseRawInput consumes the corrections (no re-parse loop)', () => {
  const { _testing } = require('../../../lib/workflow/nodes/input-nodes');

  it('clears _inputCorrections when a file-based run cannot re-parse', async () => {
    // A reject nulls sessionConfig and routes back to parseRawInput. With no
    // rawSessionInput there is nothing to re-parse, so the corrections must be
    // consumed or the gate keeps offering a re-parse that cannot happen.
    const { parseRawInput } = require('../../../lib/workflow/nodes/input-nodes');
    const result = await parseRawInput(
      { sessionConfig: null, rawSessionInput: null, _inputCorrections: 'Blake said it' },
      {}
    );
    expect(result._inputCorrections).toBeNull();
  });

  it('leaves the channel alone on an ordinary skip', async () => {
    const { parseRawInput } = require('../../../lib/workflow/nodes/input-nodes');
    const result = await parseRawInput(
      { sessionConfig: { roster: ['Vic'] }, rawSessionInput: {}, _inputCorrections: null },
      {}
    );
    expect(result).not.toHaveProperty('_inputCorrections');
  });
});

describe('the e2e harness speaks the new gate contract', () => {
  // scripts/e2e-walkthrough.js is the operator's dry-run tool and has no test
  // harness of its own, so this asserts on its source. Its old [E]dit path built
  // an `inputEdits` map of dotted field paths and sent it with
  // `{inputReview: true}` — the server wrote it to a `_inputEdits` key that was
  // never an Annotation channel, so the operator's edits were DISCARDED while the
  // run reported success.
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'scripts', 'e2e-walkthrough.js'), 'utf8'
  );

  it('no longer builds or sends inputEdits in any form', () => {
    // `/inputEdits:/` alone would have passed on the old file, which used the
    // object shorthand `return { inputReview: true, inputEdits };`.
    expect(src).not.toMatch(/inputEdits/);
  });

  it('offers reject-with-corrections and sends inputFeedback', () => {
    expect(src).toContain('[R]eject with corrections');
    expect(src).toContain('{ inputReview: false, inputFeedback: feedback.trim() }');
  });

  it('still offers a plain approve', () => {
    expect(src).toContain('{ inputReview: true }');
  });

  it('every --auto profile approves this gate', () => {
    const dir = path.join(__dirname, '..', '..', '..', 'config', 'auto-profiles');
    const profiles = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    expect(profiles.length).toBeGreaterThan(0);
    profiles.forEach((f) => {
      const cfg = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      expect(cfg.checkpoints['input-review'].strategy).toBe('approve');
    });
  });
});
