/**
 * The arc writer's system prompt and the weave's schema (phase 4, brief 4.4; phase 4b, piece 3,
 * brief 3B; spec docs/superpowers/specs/2026-10-06-meeting-as-angles.md sections 4 and 17).
 *
 * The arc writer pitches two or three angles over one shared set of threads, and the director
 * picks one and settles it at the story meeting. One schema serves the writer and its rework
 * (reviseArcs). The detective's parked copies went with its arc stage (ruling R1): its theme
 * starts no session until it has files for the meeting, the map and the article.
 *
 * The arc composers in arc-specialist-nodes.js open the system prompt with the theme's
 * identity line, put the mode block, the world and the truth rules after it (loadRuleSet,
 * from the theme's rules folder), then this prompt's text; the craft files go in the user
 * prompt.
 */

const { ANGLE_FIELDS, CONNECTION_KINDS } = require('../weave');
const { WEAVE_QUESTIONS_KEY, WEAVE_QUESTIONS_PROPERTY } = require('../writer-questions');
// Phase 4b (brief 1B; R1): the piece of evidence under each thread and connection, the shape the
// map's beats embed too.
const { EVIDENCE_PIECE_SCHEMA } = require('../evidence');

/**
 * The arc writer's system prompt text: what the rule set does not say. The theme's identity
 * line opens the system prompt (lib/theme-config.js identityLineOf, the call `arc`; brief
 * 4.13), so this text names no narrator, publication or form of output.
 */
const WEAVE_SYSTEM_PROMPT = `YOUR ROLE:
Read the record and the director's account of the room, find the threads of the session's story, and pitch the angles the article could take, each a story told through those threads. The director reads the angles at the story meeting, picks one, changes what they choose, and settles it; every later writer works from the angle the director settles.`;

/** Each printed field of an angle (lib/weave.js ANGLE_FIELDS), with what it holds and the rule item that governs it. */
const ANGLE_FIELD_SCHEMAS = {
  headline: { type: 'string', description: 'The headline the article would print for this angle' },
  gist: { type: 'string', description: 'One sentence that sums the angle up, for its card' },
  story: { type: 'string', description: 'The story, in two or three sentences (C1)' },
  question: { type: 'string', description: 'The question the story carries through the article (C1)' },
  lands: { type: 'string', description: 'Why it lands with the players, in one line (C1)' },
  ends: { type: 'string', description: 'Where it ends up, its convergence, in one line (C16)' }
};

/**
 * The weave's schema (lib/weave.js holds the shape and its constants; phase 4b, piece 3, brief
 * 3B; spec 2026-10-06 section 17). An angle is `{id, headline, gist, story, question, lands, ends,
 * threads}`, a thread `{id, name, line, verdict?, evidence}` and a connection `{id, joins, line,
 * kind, evidence}`: the lines at the level of the story, the evidence underneath (each piece
 * lib/evidence.js EVIDENCE_PIECE_SCHEMA), and a connection's kind underneath too, unprinted. The
 * director-side schema (lib/meeting.js DIRECTOR_WEAVE_SCHEMA) is derived from this one, adds the
 * director's pick, and lets a thread the director adds have only its id, name and line. Every
 * description says what its field holds and names the rule item that governs it, restating none.
 */
const WEAVE_SCHEMA = {
  type: 'object',
  properties: {
    angles: {
      type: 'array',
      description: 'Two or three angles, each a different story the article could tell (C1)',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'A short id, unique in the weave' },
          ...Object.fromEntries(ANGLE_FIELDS.map((field) => [field, ANGLE_FIELD_SCHEMAS[field]])),
          threads: { type: 'array', items: { type: 'string' }, description: 'The ids of the threads the angle tells, in the order it tells them (C16)' }
        },
        required: ['id', ...ANGLE_FIELDS, 'threads']
      }
    },
    fromYourNotes: {
      type: 'string',
      description: "The director's own words angle 1 rests on: one unbroken passage, copied exactly from the director's notes or corrections. Present only when angle 1 starts from the director's read"
    },
    threads: {
      type: 'array',
      description: 'The threads every angle draws on, each named for what happened and said in one line in story terms, with its evidence underneath (C16)',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'A short id, unique in the weave' },
          name: { type: 'string', description: 'What happened, with its people, in a few plain words (C16)' },
          line: { type: 'string', description: 'The thread in one line, in story terms' },
          verdict: { type: 'boolean', description: "true on the thread that carries the room's verdict" },
          evidence: { type: 'array', items: EVIDENCE_PIECE_SCHEMA, description: 'The pieces of the record that tell the thread' }
        },
        required: ['id', 'name', 'line', 'evidence']
      }
    },
    connections: {
      type: 'array',
      description: 'Where two threads touch, the touches an angle turns on (C16)',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'A short id, unique in the weave' },
          joins: { type: 'array', items: { type: 'string' }, description: 'The ids of the two threads it joins' },
          line: { type: 'string', description: 'Where the two threads touch, in one line in story terms' },
          kind: { type: 'string', enum: [...CONNECTION_KINDS], description: 'What the two threads share' },
          evidence: { type: 'array', items: EVIDENCE_PIECE_SCHEMA, description: 'The pieces of the record that show the two threads touch' }
        },
        required: ['id', 'joins', 'line', 'kind', 'evidence']
      }
    },
    [WEAVE_QUESTIONS_KEY]: WEAVE_QUESTIONS_PROPERTY
  },
  required: ['angles', 'threads', 'connections', WEAVE_QUESTIONS_KEY]
};

module.exports = {
  WEAVE_SYSTEM_PROMPT,
  WEAVE_SCHEMA
};
