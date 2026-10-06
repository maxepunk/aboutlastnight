/**
 * The arc writer's system prompt and the weave's schema (phase 4, brief 4.4; spec
 * docs/superpowers/specs/2026-10-02-story-meeting-and-map.md sections 4.1 and 4.2).
 *
 * The arc writer writes one weave, the story the article will tell, which the director
 * settles at the story meeting. One schema serves the writer and its rework
 * (reviseArcs): the weave's shape replaces the arcs (CORE_ARC_SCHEMA) and the arc
 * rework's arcs with their interweaving (PLAYER_FOCUS_GUIDED_SCHEMA). The interweaving
 * call went with the long write-up for each thread (spec section 10): the weave names
 * the connections itself, and the meeting shows them. The detective's parked copies went
 * with its arc stage (ruling R1): its theme starts no session until it has files for the
 * meeting, the map and the article.
 *
 * The arc composers in arc-specialist-nodes.js open the system prompt with the theme's
 * identity line, put the mode block, the world and the truth rules after it (loadRuleSet,
 * from the theme's rules folder), then this prompt's text; the craft files go in the user
 * prompt.
 */

const { WEAVE_ROLES, CONNECTION_KINDS } = require('../weave');
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
Read the record and the director's account of the room, find the threads of the session's story, and weave them into one story. The director reads the weave at the story meeting, changes what they choose, and settles it; every later writer works from the weave the director settles.`;

/**
 * The weave's schema (lib/weave.js holds the shape and its constants; phase 4b, brief 1B, R1).
 * A thread is `{id, name, line, role, verdict?, reason?, evidence}` and a connection `{id, joins,
 * line, kind, evidence}`: the lines at the level of the story, the evidence underneath (each piece
 * lib/evidence.js EVIDENCE_PIECE_SCHEMA), and a connection's kind underneath too, unprinted. The
 * director-side schema (lib/meeting.js DIRECTOR_WEAVE_SCHEMA) is derived from this one, and lets a
 * thread the director adds have only its id, name, line and role. Every description says what its
 * field holds and names the rule item that governs it, restating none.
 */
const WEAVE_SCHEMA = {
  type: 'object',
  properties: {
    story: { type: 'string', description: 'The story: the thesis, in one to three sentences (C1)' },
    question: { type: 'string', description: 'The question the story carries through the article (C1)' },
    headline: { type: 'string', description: 'A working headline' },
    fromYourNotes: {
      type: 'string',
      description: "The director's own words the story rests on: one unbroken passage, copied exactly from the director's notes or corrections. Present only when the story starts from the director's read"
    },
    threads: {
      type: 'array',
      description: 'The threads of the story, each a short name and one line in story terms, with its evidence underneath (C16)',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'A short id, unique in the weave' },
          name: { type: 'string', description: 'A short name for the thread, in a few words' },
          line: { type: 'string', description: 'The thread in one line, in story terms' },
          role: { type: 'string', enum: [...WEAVE_ROLES], description: "The thread's role toward the main thread (C16)" },
          verdict: { type: 'boolean', description: "true on the thread that carries the room's verdict" },
          reason: { type: 'string', description: 'For a left-out thread: one line on why the story does not need it' },
          evidence: { type: 'array', items: EVIDENCE_PIECE_SCHEMA, description: 'The pieces of the record that tell the thread' }
        },
        required: ['id', 'name', 'line', 'role', 'evidence']
      }
    },
    connections: {
      type: 'array',
      description: 'Where two threads touch, the touches the story turns on (C16)',
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
    convergence: { type: 'string', description: 'Where the threads converge and the story lands, in a line or two in story terms (C16)' },
    strongerMainThread: {
      type: 'object',
      description: 'Present only when another thread would carry a stronger story as the main thread (C1)',
      properties: {
        thread: { type: 'string', description: "That thread's id" },
        reason: { type: 'string', description: 'Why, in one line' }
      },
      required: ['thread', 'reason']
    },
    [WEAVE_QUESTIONS_KEY]: WEAVE_QUESTIONS_PROPERTY
  },
  required: ['story', 'question', 'headline', 'threads', 'connections', 'convergence', WEAVE_QUESTIONS_KEY]
};

module.exports = {
  WEAVE_SYSTEM_PROMPT,
  WEAVE_SCHEMA
};
