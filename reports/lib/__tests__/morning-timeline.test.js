/**
 * The morning timeline (phase 3, brief 3.5; spec sections 3a and 6, T5, T6, T7).
 *
 * One pure function merges the ledger's sales (the bundle's buried transactions:
 * account, amount and time), the evidence log (sessionConfig.exposures, only for
 * memories the bundle holds as exposed) and the classified adjustments
 * (sessionConfig.adjustments) in time order, every time on the session clock. Events
 * in the same minute keep each table's order, sales before exposures, and are flagged
 * as the same minute. The record view prints it in place of the old buried list.
 */

const { buildMorningTimeline, renderMorningTimeline, renderRecordView } = require('../prompt-renderers/record-view');

function bundle({ tokens = [], transactions = [] } = {}) {
  return { exposed: { tokens, paperEvidence: [] }, buried: { transactions } };
}

const exposedToken = (id) => ({ id, sourceType: 'memory-token', rawData: { tokenId: id, name: id.toUpperCase(), fullDescription: `${id} text`, owners: ['Alex Reeves'] } });
const sale = (shellAccount, amount, time) => ({ sourceType: 'memory-token', shellAccount, amount, time, temporalContext: 'INVESTIGATION' });

describe('buildMorningTimeline', () => {
  it('merges sales, exposures and adjustments in time order on the evening clock', () => {
    const { clock, events } = buildMorningTimeline(
      bundle({ tokens: [exposedToken('ale003')], transactions: [sale('Ember', 500000, '07:50 PM'), sale('Ember', 375000, '08:02 PM')] }),
      {
        exposures: [{ tokenId: 'ale003', exposer: 'NovaNews (Anonymous)', time: '07:37 PM', owner: 'Alex Reeves' }],
        adjustments: [
          { time: '10:30 PM', kind: 'transfer', amount: 375000, fromAccount: 'Vic', toAccount: 'L' },
          { time: '07:50 PM', kind: 'bonus', amount: 50000, toAccount: 'Ember' }
        ]
      }
    );
    expect(clock).toEqual({ decided: true, evening: true, firstTime: '07:37 PM' });
    expect(events).toEqual([
      { kind: 'exposure', time: '07:37 AM', minute: '07:37 AM', sameMinute: false, documentId: 'ale003', exposer: null },
      { kind: 'sale', time: '07:50 AM', minute: '07:50 AM', sameMinute: true, account: 'Ember', amount: 500000 },
      { kind: 'bonus', time: '07:50 AM', minute: '07:50 AM', sameMinute: true, toAccount: 'Ember', amount: 50000 },
      { kind: 'sale', time: '08:02 AM', minute: '08:02 AM', sameMinute: false, account: 'Ember', amount: 375000 },
      { kind: 'transfer', time: '10:30 AM', minute: '10:30 AM', sameMinute: false, fromAccount: 'Vic', toAccount: 'L', amount: 375000 }
    ]);
  });

  it('keeps a same-minute exposure after that minute\'s sales, each table in its own order (092626\'s 02:25 PM)', () => {
    const transactions = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((acct) => sale(acct, 100000, '02:25 PM'));
    const { clock, events } = buildMorningTimeline(
      bundle({ tokens: [exposedToken('nat002')], transactions: [sale('Z', 50000, '02:10 PM'), ...transactions] }),
      { exposures: [{ tokenId: 'nat002', exposer: 'NovaNews (Anonymous)', time: '02:25 PM' }] }
    );
    expect(clock.evening).toBe(false);
    expect(events.map((e) => `${e.time} ${e.kind} ${e.account || e.documentId} ${e.sameMinute}`)).toEqual([
      '02:10 PM sale Z false',
      ...['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((acct) => `02:25 PM sale ${acct} true`),
      '02:25 PM exposure nat002 true'
    ]);
  });

  it('reads an exposure only for a memory the bundle holds as exposed', () => {
    const { events } = buildMorningTimeline(
      bundle({ tokens: [exposedToken('ale003')] }),
      { exposures: [{ tokenId: 'ALE003', exposer: 'Ashe', time: '09:06 PM' }, { tokenId: 'qzx913', exposer: 'Ashe', time: '09:10 PM', owner: 'Octavia Quillfeather' }] }
    );
    expect(events).toEqual([{ kind: 'exposure', time: '09:06 AM', minute: '09:06 AM', sameMinute: false, documentId: 'ale003', exposer: 'Ashe' }]);
  });

  it('names the turn-in only when the evidence log carries a name', () => {
    const { events } = buildMorningTimeline(
      bundle({ tokens: ['m1', 'm2', 'm3', 'm4'].map(exposedToken) }),
      { exposures: [
        { tokenId: 'm1', exposer: 'NovaNews (Anonymous)', time: '01:00 PM' },
        { tokenId: 'm2', exposer: '', time: '01:01 PM' },
        { tokenId: 'm3', exposer: 'NovaNews', time: '01:02 PM' },
        { tokenId: 'm4', exposer: 'Sam', time: '01:03 PM' }
      ] }
    );
    expect(events.map((e) => e.exposer)).toEqual([null, null, null, 'Sam']);
  });

  it('puts an event with no readable time last, in its table\'s order', () => {
    const { events } = buildMorningTimeline(bundle({ transactions: [sale('Jinin', 10000, null), sale('Ember', 20000, '01:00 PM')] }), {});
    expect(events.map((e) => [e.account, e.time])).toEqual([['Ember', '01:00 PM'], ['Jinin', '(not recorded)']]);
  });

  it('renders a thread from before phase 3 (no exposures, no adjustments) with its sales', () => {
    const { events } = buildMorningTimeline(bundle({ transactions: [sale('Ember', 75000, '07:50 PM')] }), { accusation: { accused: [] } });
    expect(events).toEqual([{ kind: 'sale', time: '07:50 AM', minute: '07:50 AM', sameMinute: false, account: 'Ember', amount: 75000 }]);
  });

  it('opens on an adjustment logged before the first sale, and the sales still decide the clock (fix batch, finding 2)', () => {
    const daytime = buildMorningTimeline(
      bundle({ transactions: [sale('Ember', 100000, '01:52 PM'), sale('Ember', 50000, '02:30 PM')] }),
      { adjustments: [{ time: '01:51 PM', kind: 'bonus', amount: 50000, toAccount: 'Ember' }] }
    );
    expect(daytime.clock).toEqual({ decided: true, evening: false, firstTime: '01:52 PM' });
    expect(daytime.events.map((e) => `${e.time} ${e.kind}`)).toEqual(['01:51 PM bonus', '01:52 PM sale', '02:30 PM sale']);

    const evening = buildMorningTimeline(
      bundle({ transactions: [sale('Ember', 100000, '07:50 PM'), sale('Ember', 50000, '09:10 PM')] }),
      { adjustments: [{ time: '07:49PM', kind: 'bonus', amount: 50000, toAccount: 'Ember' }] }
    );
    expect(evening.clock).toEqual({ decided: true, evening: true, firstTime: '07:50 PM' });
    expect(evening.events.map((e) => `${e.minute} ${e.kind}`)).toEqual(['07:49 AM bonus', '07:50 AM sale', '09:10 AM sale']);
  });
});

describe('renderMorningTimeline', () => {
  it('prints each event on one line, time first, and the same minute under one heading', () => {
    const out = renderMorningTimeline(
      bundle({ tokens: [exposedToken('ale003'), exposedToken('ash003')], transactions: [sale('Ember', 500000, '07:50 PM')] }),
      {
        exposures: [
          { tokenId: 'ale003', exposer: 'NovaNews (Anonymous)', time: '07:37 PM' },
          { tokenId: 'ash003', exposer: 'Ashe', time: '09:40 PM' }
        ],
        adjustments: [
          { time: '07:50 PM', kind: 'bonus', amount: 50000, toAccount: 'Ember' },
          { time: '10:30 PM', kind: 'transfer', amount: 375000, fromAccount: 'Vic', toAccount: 'L' }
        ]
      }
    );
    const lines = out.split('\n');
    expect(lines[0]).toBe('<morning-timeline>');
    expect(lines[lines.length - 1]).toBe('</morning-timeline>');
    expect(lines.slice(2, -1)).toEqual([
      '- 07:37 AM | exposure | document: ale003 | anonymous',
      '- 07:50 AM, same minute:',
      '  - sale | account: Ember | amount: $500,000',
      '  - first-burial bonus | paid to: Ember | amount: $50,000',
      '- 09:40 AM | exposure | document: ash003 | named: Ashe',
      '- 10:30 AM | transfer | from: Vic | to: L | amount: $375,000'
    ]);
  });

  it('heads one minute once however its rows were logged (fix batch, finding 1: 092026 writes "07:51PM")', () => {
    const out = renderMorningTimeline(
      bundle({ tokens: [exposedToken('ale003')], transactions: [sale('Ember', 500000, '07:50 PM')] }),
      {
        exposures: [{ tokenId: 'ale003', exposer: 'Ashe', time: '07:51 PM' }],
        adjustments: [
          { time: '07:50PM', kind: 'bonus', amount: 50000, toAccount: 'Ember' },
          { time: '07:51PM', kind: 'transfer', amount: 20000, fromAccount: 'Vic', toAccount: 'L' }
        ]
      }
    );
    expect(out.split('\n').slice(2, -1)).toEqual([
      '- 07:50 AM, same minute:',
      '  - sale | account: Ember | amount: $500,000',
      '  - first-burial bonus | paid to: Ember | amount: $50,000',
      '- 07:51 AM, same minute:',
      '  - transfer | from: Vic | to: L | amount: $20,000',
      '  - exposure | document: ale003 | named: Ashe'
    ]);
  });

  it('says (none) when the morning logged nothing', () => {
    expect(renderMorningTimeline(bundle(), {}).split('\n').slice(2)).toEqual(['(none)', '</morning-timeline>']);
  });

  it('is the record view\'s last part, and the view without it leaves it out', () => {
    const b = bundle({ tokens: [exposedToken('ale003')], transactions: [sale('Ember', 75000, '07:50 PM')] });
    const whole = renderRecordView(b, { sessionConfig: {} });
    expect(whole).toContain(renderMorningTimeline(b, {}));
    expect(whole.indexOf('<document id="ale003"')).toBeLessThan(whole.indexOf('<morning-timeline>\n'));
    expect(whole).not.toContain('<buried-transactions>');
    const documentsOnly = renderRecordView(b, { buried: false });
    expect(documentsOnly).not.toContain('morning-timeline');
    expect(documentsOnly).not.toContain('Ember');
  });
});
