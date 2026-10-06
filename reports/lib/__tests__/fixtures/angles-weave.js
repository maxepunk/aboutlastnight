/**
 * A weave pitched as angles, in session 100326's shape (phase 4b, piece 3, brief 3B; spec
 * 2026-10-06 sections 4 and 17): three angles over one shared set of seven threads, the verdict's
 * thread in every angle and one thread no angle uses; three connections; "from your notes"
 * resting angle 1 on the director's read; a question by the pitch and one beside a thread.
 * Each line is in story terms, and each piece names a source the record below holds.
 *
 * The record: three exposed memories, a paper memo, and the director's notes. Invented text: the
 * repo is public.
 *
 * Not a test file (jest's testMatch is *.test.js).
 */

const clone = (v) => JSON.parse(JSON.stringify(v));

const NOTES = 'Morgan and Vic circled each other all morning. This felt like a clash of the big names, and the room picked Morgan in the end.';

/** The curated bundle. */
function anglesRecord() {
  return {
    exposed: {
      tokens: [
        { id: 'mor002', tokenId: 'mor002', fullContent: 'MOR002 - Morgan strikes her own name from the board minutes.', rawData: { tokenId: 'mor002', name: 'MOR002 - The minutes', fullDescription: 'MOR002 - Morgan strikes her own name from the board minutes.', owners: ['Morgan Reed'] } },
        { id: 'vic004', tokenId: 'vic004', fullContent: 'VIC004 - Vic meets Morgan about the trouble Marcus is in.', rawData: { tokenId: 'vic004', name: 'VIC004 - The meeting', fullDescription: 'VIC004 - Vic meets Morgan about the trouble Marcus is in.', owners: ['Vic Kingsley'] } },
        { id: 'tay001', tokenId: 'tay001', fullContent: 'TAY001 - Taylor kills a story another reporter wrote about Marcus.', rawData: { tokenId: 'tay001', name: 'TAY001 - The buried story', fullDescription: 'TAY001 - Taylor kills a story another reporter wrote about Marcus.', owners: ['Taylor Chase'] } }
      ],
      paperEvidence: [
        { notionId: 'p-memo', id: 'p-memo', name: 'Board memo', description: 'Alex asks the board in writing to remove Marcus.', fullContent: 'Alex asks the board in writing to remove Marcus.', owners: ['Alex Reeves'] }
      ]
    },
    buried: { transactions: [] }
  };
}

/** A piece of evidence. */
const piece = (sources, shows, stance = 'supports') => ({ sources, shows, stance });

/** The writer's weave: three angles over seven threads. */
const ANGLES_WEAVE = {
  angles: [
    {
      id: 'a1',
      headline: 'The Big Names Turned on Each Other. The Room Named Morgan Reed.',
      gist: 'The fight came down to Morgan and Vic, and the room named Morgan on her own memories.',
      story: 'In a room full of power, the fight came down to Morgan and Vic. The room named Morgan on the strength of her own memories.',
      question: 'Was the room growing a conscience, or settling scores among the powerful?',
      lands: 'Every player watched the two of them circle each other.',
      ends: 'The big names fought, the room named Morgan, and power may drift to Alex.',
      threads: ['t1', 't2', 't3', 't4', 't5']
    },
    {
      id: 'a2',
      headline: 'The Reporter Who Exposed Morgan Had Buried a Story of His Own',
      gist: 'Taylor put his name on the memories that sank Morgan, and Morgan answered with the story he buried.',
      story: 'Taylor turned in the memories that sank Morgan. Morgan answered that Taylor once buried a story about Marcus, and the room sold memories while it argued.',
      question: 'Who gets to decide which stories are told?',
      lands: 'The players saw the reporter become the story.',
      ends: 'The man who buried one story exposed another, and the room voted on his word.',
      threads: ['t3', 't1', 't6']
    },
    {
      id: 'a3',
      headline: 'Nobody Named Alex Reeves. By Evening She Was Rising.',
      gist: 'While the room fought over Morgan and Vic, no theory touched Alex.',
      story: 'While the room fought over Morgan and Vic, no theory touched Alex, who had asked in writing for Marcus to go.',
      question: 'Who walked away from the morning stronger?',
      lands: 'The players never looked at Alex, and the record did.',
      ends: 'The room named Morgan, and the quiet one in the corner rose.',
      threads: ['t5', 't1', 't2']
    }
  ],
  fromYourNotes: 'This felt like a clash of the big names',
  threads: [
    {
      id: 't1', name: 'Morgan, named by her own memories', line: 'She struck her name from the board, and the room put it back on the strength of her own memories.', verdict: true,
      evidence: [piece(['mor002'], 'Morgan strikes her own name from the board minutes.'), piece(['notes'], 'The room picked Morgan in the end.')]
    },
    {
      id: 't2', name: 'Vic, nearly named with Morgan', line: 'Vic met Morgan about the trouble Marcus was in, and the room came close to naming him too.',
      evidence: [piece(['vic004'], 'Vic meets Morgan about the trouble Marcus is in.')]
    },
    {
      id: 't3', name: 'Taylor buried a story, then exposed Morgan', line: 'The reporter who turned in the memories against Morgan once killed a story about Marcus.',
      evidence: [piece(['tay001'], 'Taylor kills a story another reporter wrote about Marcus.')]
    },
    {
      id: 't4', name: 'The suspects the room let go', line: 'The room weighed four others and let each one go.',
      evidence: [piece(['notes'], 'Morgan and Vic circled each other all morning.')]
    },
    {
      id: 't5', name: 'Alex, untouched and rising', line: 'No theory named Alex, who had asked the board to remove Marcus.',
      evidence: [piece(['p-memo'], 'Alex asks the board in writing to remove Marcus.')]
    },
    {
      id: 't6', name: 'Memories sold while the room argued', line: 'Memories went to the buyer while the room argued over Morgan.',
      evidence: [piece(['notes'], 'Morgan and Vic circled each other all morning.'), piece(['notes'], 'The room picked Morgan in the end.', 'cuts-against')]
    },
    {
      id: 't7', name: "Marcus's stolen code", line: 'Someone took the code Marcus wrote, and the room never asked who.',
      evidence: [piece(['notes'], 'The room picked Morgan in the end.')]
    }
  ],
  connections: [
    {
      id: 'c1', joins: ['t1', 't3'], line: 'Morgan said Taylor buried a story, and his own memory of it went public.', kind: 'person',
      evidence: [piece(['tay001', 'mor002'], 'Taylor kills a story; Morgan strikes her name.')]
    },
    {
      id: 'c2', joins: ['t2', 't1'], line: 'Vic meeting Morgan fed the case against both of them.', kind: 'document',
      evidence: [piece(['vic004'], 'Vic meets Morgan about the trouble Marcus is in.')]
    },
    {
      id: 'c3', joins: ['t2', 't5'], line: 'Vic kept handing Alex his memories, and Alex kept her distance.', kind: 'person',
      evidence: [piece(['vic004', 'p-memo'], 'Vic meets Morgan; Alex asks the board to remove Marcus.')]
    }
  ],
  questions: [
    { id: 'q1', kind: 'player', about: 'Mel', question: 'What did Mel do in the room?', changes: 'Whether Mel gets a moment in the article.' },
    { id: 'q2', kind: 'figure', about: 'The first-burial bonus', question: 'Was the bonus paid with the first sale this morning?', changes: "Whether the buyer's figure prints.", thread: 't6' }
  ]
};

module.exports = {
  NOTES,
  anglesRecord,
  ANGLES_WEAVE,
  anglesWeave: () => clone(ANGLES_WEAVE)
};
