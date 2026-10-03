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
 * The arc composers in arc-specialist-nodes.js put the mode block, the world and the
 * truth rules after this prompt's identity line (loadRuleSet), and the craft files go in
 * the user prompt.
 */

const { WEAVE_ROLES, CONNECTION_KINDS, LEDGER_RECEIPT } = require('../weave');
const { WEAVE_QUESTIONS_KEY, WEAVE_QUESTIONS_PROPERTY } = require('../writer-questions');

/**
 * The arc writer's system prompt: what the rule set does not say. Its identity line opens
 * it, as every system prompt's does, so the mode block can follow it.
 */
const WEAVE_SYSTEM_PROMPT = `You are the arc writer for an investigative article about one session of the game: you write the weave, the story the article will tell, for the director to settle at the story meeting.

YOUR ROLE:
Read the record and the director's account of the room, find the threads of the session's story, and weave them into one story. The director reads the weave at the story meeting, changes what they choose, and settles it; every later writer works from the weave the director settles.`;

/**
 * The weave's schema (lib/weave.js holds the shape and its constants). A thread's receipt
 * and reason are optional here so a thread the director adds stays valid; the code checks
 * require them on the writer's threads (lib/weave.js checkWeave). Every description says
 * what its field holds and names the rule item that governs it, restating none.
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
      description: 'Every thread of the story, each in one line (C16)',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'A short id, unique in the weave' },
          claim: { type: 'string', description: 'What the thread claims, in one line' },
          role: { type: 'string', enum: [...WEAVE_ROLES], description: "The thread's role toward the main thread (C16)" },
          receipt: { type: 'string', description: `The thread's strongest receipt: the id of a document in <RECORD>, or "${LEDGER_RECEIPT}"` },
          reason: { type: 'string', description: 'For a left-out thread: one line on why the story does not need it' },
          verdict: { type: 'boolean', description: "true on the thread that carries the room's verdict" }
        },
        required: ['id', 'claim', 'role']
      }
    },
    connections: {
      type: 'array',
      description: 'Where two threads touch (C16)',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'A short id, unique in the weave' },
          kind: { type: 'string', enum: [...CONNECTION_KINDS], description: 'What the two threads share' },
          joins: { type: 'array', items: { type: 'string' }, description: 'The ids of the two threads it joins' },
          detail: { type: 'string', description: 'Where the two threads touch, named exactly' }
        },
        required: ['id', 'kind', 'joins', 'detail']
      }
    },
    convergence: { type: 'string', description: 'Where the threads converge and the story lands (C16)' },
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
