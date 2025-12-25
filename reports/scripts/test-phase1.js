#!/usr/bin/env node
/**
 * Test Phase 0.1 - Raw input parsing
 */
require('dotenv').config();

const rawSessionInput = {
  roster: 'Alex, Ashe, Diana, James, Jessicah, Morgan, Oliver, Tori, Victoria, Derek, Jamie, Kai, Rachel, Sarah, Taylor',

  accusation: 'The group largely blamed Victoria and Morgan for collusion to murder Marcus, even though there may have been some other evidence pointing to other potential suspects.',

  sessionReport: `1221 game (12/21/2025)

Session Overview
| Field              | Value                                |
|--------------------|--------------------------------------|
| Session ID         | 51484c43-5ec2-4e4e-adcb-4ecd44c6c7c0 |
| Session Name       | 1221 game                            |
| Start Time         | Dec 21, 2025 @ 7:24 PM (local)       |
| Status             | Active (still running)               |
| Teams              | 8 teams                              |
| Total Transactions | 47                                   |
| Player Scans       | 96                                   |

Teams Registered: BM Holdings, DET, Offbeat, Dominic, John D., Gorlan, ChaseT, Fun

1. Detective Scans Breakdown (31 tokens)
All tokens submitted to the Detective for public evidence display:

| Token  | Character                | Scan Time | Evidence Summary                                                                                              |
|--------|--------------------------|-----------|---------------------------------------------------------------------------------------------------------------|
| alr001 | ALEX                     | 11:48 PM  | ALEX refactors MARCUS's prototype code for BizAI, discovering the original algorithm was fundamentally broken |
| asm031 | ASHE                     | 11:36 PM  | ASHE witnesses MARCUS treat KAI like dirt                                                                     |
| asm042 | ASHE/MARCUS              | 11:29 PM  | MARCUS files frivolous defamation suit against ASHE, forcing settlement with non-disparagement clause         |
| din002 | DIANA                    | 11:24 PM  | DIANA negotiates with Stanford police to avoid arrests after first party gets raided                          |
| din021 | (no summary)             | 11:38 PM  | —                                                                                                             |
| fli031 | FLIP/MARCUS              | 11:48 PM  | FLIP asks MARCUS for a personal loan in exchange for undefined future favor                                   |
| hos002 | HOWIE                    | 11:33 PM  | HOWIE watches the party descend into chaos, sees 40 years of Silicon Valley ideals die                        |
| hos011 | HOWIE                    | 10:46 PM  | HOWIE gives a lecture on research on adaptive systems for collaboration                                       |
| jav003 | JAMIE                    | 11:34 PM  | JAMIE overhears MYSTERIOUS STRANGER threaten MARCUS with lethal consequences                                  |
| jav021 | JAMIE/MARCUS             | 11:10 PM  | JAMIE witnesses MARCUS hand envelope of cash to MORGAN near the bar                                           |
| jav042 | JAMIE                    | 10:51 PM  | JAMIE witnesses VICTORIA offer MARCUS' job to ALEX                                                            |
| jaw011 | JAMES                    | 10:45 PM  | JAMES sees MARCUS entering secret room before losing consciousness                                            |
| jek002 | JESSICAH/SARAH           | 11:48 PM  | JESSICAH and SARAH have moment of truth about pregnancy                                                       |
| jek031 | JESSICAH/MARCUS          | 10:52 PM  | HOWIE witnesses heated exchange between JESSICAH and MARCUS                                                   |
| kaa001 | KAI/MARCUS               | 11:48 PM  | KAI 'hired' by MARCUS for 'test install' with promise of future work                                          |
| kaa002 | KAI/ASHE                 | 10:37 PM  | KAI searches desperately for ASHE after MARCUS dismissal                                                      |
| leb002 | LEILA/MARCUS             | 11:48 PM  | LEILA compiles proof MARCUS's NeurAI memory indexing is stolen from her work                                  |
| leb011 | LEILA/MARCUS             | 11:04 PM  | MARCUS shows up at LEILA's home, begs access to private research                                              |
| mab001 | MARCUS                   | 11:36 PM  | MARCUS' experiment notes: MEMORIES RETURNED if tokens not processed before EXPIRATION                         |
| mab002 | MARCUS/DEREK             | 11:04 PM  | MARCUS contacted by mysterious stranger after DEREK brings new party 'favor'                                  |
| mab003 | MARCUS                   | 10:20 PM  | MARCUS executes memory token locking protocol using drugged partygoers                                        |
| mor042 | MORGAN/MARCUS            | 11:35 PM  | Anonymous NeurAI employee sends MORGAN evidence of MARCUS's illegal experiments                               |
| ols002 | OLIVER/JAMES/LEILA       | 11:48 PM  | OLIVER ends venture to bury dangerous research. JAMES backs him. LEILA doesn't forgive                        |
| rat031 | RACHEL/SARAH             | 11:31 PM  | RACHEL tells SARAH about evidence of MARCUS' criminal dealings with MORGAN                                    |
| sab001 | SARAH                    | 10:41 PM  | SARAH receives personal offer from BLACK MARKET to betray MARCUS                                              |
| sab002 | SARAH/MARCUS             | 11:34 PM  | SARAH submits Facebook resignation to support MARCUS's BizAI launch                                           |
| ski001 | SKYLER                   | 10:57 PM  | SKYLER draws schema for world's first humanoid biological robot                                               |
| sof002 | SOFIA/DIANA/DEREK/MARCUS | 11:00 PM  | The Stanford Four's glow rave: Before money changed everything                                                |
| sof003 | SOFIA                    | 11:32 PM  | SOFIA's film research reveals NeurAI's AI claims are fraudulent                                               |
| tac001 | TAYLOR/ASHE              | 11:15 PM  | TAYLOR drunkenly brags about getting ASHE fired                                                               |
| toz001 | TORI/VICTORIA            | 11:28 PM  | TORI prepares to pitch Synesthesia Engine to VICTORIA                                                         |

2. Black Market Scans with Scoring Analysis (16 tokens)
| Token  | Team    | Points   | Rating     | Type      | Formula    | Time     |
|--------|---------|----------|------------|-----------|------------|----------|
| mor021 | Offbeat | 150,000 | 3star     | Business  | 50K x 3x  | 10:30 PM |
| fli002 | Dominic | 450,000 | 5star | Business  | 150K x 3x | 10:53 PM |
| ols011 | John D. | 375,000 | 4star   | Technical | 75K x 5x  | 10:55 PM |
| fli004 | Dominic | 50,000  | 3star     | Personal  | 50K x 1x  | 11:00 PM |
| vik002 | Gorlan  | 450,000 | 5star | Business  | 150K x 3x | 11:03 PM |
| ski002 | ChaseT  | 375,000 | 4star   | Technical | 75K x 5x  | 11:06 PM |
| tac002 | ChaseT  | 150,000 | 3star     | Business  | 50K x 3x  | 11:14 PM |
| fli003 | Gorlan  | 25,000  | 2star       | Personal  | 25K x 1x  | 11:21 PM |
| alr002 | Gorlan  | 75,000  | 2star       | Business  | 25K x 3x  | 11:21 PM |
| det001 | Gorlan  | 125,000 | 2star       | Technical | 25K x 5x  | 11:22 PM |
| toz002 | John D. | 250,000 | 3star     | Technical | 50K x 5x  | 11:23 PM |
| leb003 | ChaseT  | 225,000 | 4star   | Business  | 75K x 3x  | 11:25 PM |
| det002 | Fun     | 450,000 | 5star | Business  | 150K x 3x | 11:27 PM |
| sof001 | Gorlan  | 450,000 | 5star | Business  | 150K x 3x | 11:35 PM |
| vik001 | Dominic | 450,000 | 5star | Business  | 150K x 3x | 11:47 PM |
| kaa003 | Dominic | 10,000  | 1star         | Personal  | 10K x 1x  | 11:49 PM |

Team Standings (Black Market)
| Rank | Team    | Total Earnings | Tokens Sold |
|------|---------|----------------|-------------|
| 1   | Gorlan  | 1,125,000     | 5           |
| 2   | Dominic | 960,000       | 4           |
| 3   | ChaseT  | 750,000       | 3           |
| 4    | John D. | 625,000       | 2           |
| 5    | Fun     | 450,000       | 1           |
| 6    | Offbeat | 150,000       | 1           |

Total Black Market Economy: 4,060,000`,

  directorNotes: `Taylor and Diana were spotted interacting with the Valet early on together, but then were seen dealing with the valet separately later on. a falling out perhaps? There was an account for Offbeat that got activated very early on with the 50,000 first buried token bonus, but then never saw any transactions after meanwhile, a shell account under the title ChaseT was spotted with a lot of account activity during the second half of the investigation. There was also some brief commotion as Kai was spotted conducting some last minute transactions with the Valet while others were monitoriting the shell account activity to trace patterns back to those going behind the group's back for their own profit. No concrete evidence, but may have been using the moniker 'Dominic'. James never even spoke to Blake once despite the Valet's (Blake) efforts to establish rapport throughout the evening. While there's no concrete evidence, Victoria and Morgan appeared to be colluding throughout the investigation and may have dealt with the Black market through Blake. And finally a certain John D. not only successfully remained anonymous throughout but also made quite a lot of profit for themselves.`,

  paperEvidenceCriteria: 'ALL entities with basic prop type: Prop, or Physical, or Clue, or Document, OR Set Dressing WITH Narrative threads: Underground Parties, or Memory Drug, or Funding & Espionage, or Marriage Troubles.',

  photosPath: 'C:\\Users\\spide\\Documents\\claudecode\\aboutlastnight\\reports\\sessionphotos\\122125',

  whiteboardPhotoPath: 'C:\\Users\\spide\\Documents\\claudecode\\aboutlastnight\\reports\\sessionphotos\\122125\\finalwhiteboard122125.jpg'
};

async function main() {
  const password = process.env.ACCESS_PASSWORD;

  // Login
  console.log('Logging in...');
  const loginRes = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0];
  console.log('Login status:', loginRes.status);

  // Call API with raw input
  console.log('\nCalling /api/generate with raw input...');
  const startTime = Date.now();

  const res = await fetch('http://localhost:3001/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
    body: JSON.stringify({
      sessionId: `test-${Date.now()}`,  // Fresh session each run
      theme: 'journalist',
      rawSessionInput
    })
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const data = await res.json();

  console.log(`\nResponse (${elapsed}s):`);
  console.log('  Session ID:', data.sessionId);
  console.log('  Status:', res.status);
  console.log('  Phase:', data.currentPhase);
  console.log('  Awaiting Approval:', data.awaitingApproval);
  console.log('  Approval Type:', data.approvalType);

  if (data.error) {
    console.log('  Error:', data.error);
  }

  // Output full response for review
  console.log('\n=== FULL CHECKPOINT DATA ===');
  console.log(JSON.stringify(data, null, 2));
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
