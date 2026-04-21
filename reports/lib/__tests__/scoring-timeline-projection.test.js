const { _testing } = require('../workflow/nodes/input-nodes');
const { projectBuriedTokensToScoringTimeline } = _testing;

describe('projectBuriedTokensToScoringTimeline', () => {
  it('is exported for testing', () => {
    expect(typeof projectBuriedTokensToScoringTimeline).toBe('function');
  });

  it('returns [] for empty array input', () => {
    expect(projectBuriedTokensToScoringTimeline([])).toEqual([]);
  });

  it('returns [] for null/undefined input (defensive)', () => {
    expect(projectBuriedTokensToScoringTimeline(null)).toEqual([]);
    expect(projectBuriedTokensToScoringTimeline(undefined)).toEqual([]);
  });

  it('returns [] for non-array input (defensive)', () => {
    expect(projectBuriedTokensToScoringTimeline({})).toEqual([]);
    expect(projectBuriedTokensToScoringTimeline('not an array')).toEqual([]);
  });

  it('projects a single buried-token row into the expected scoringTimeline shape', () => {
    const input = [
      { tokenId: 'tay004', shellAccount: 'Cass', amount: 450000, time: '09:40 PM' }
    ];
    const result = projectBuriedTokensToScoringTimeline(input);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      time: '09:40 PM',
      type: 'Sale',
      detail: 'tay004',
      team: 'Cass',
      amount: '+$450,000'
    });
  });

  it('prefers sessionTransactionTime over time when both are present', () => {
    const input = [
      { tokenId: 'abc001', shellAccount: 'Team A', amount: 75000, sessionTransactionTime: '08:15 PM', time: '10:00 PM' }
    ];
    const result = projectBuriedTokensToScoringTimeline(input);
    expect(result[0].time).toBe('08:15 PM');
  });

  it('falls back to time when sessionTransactionTime is missing', () => {
    const input = [
      { tokenId: 'abc001', shellAccount: 'Team A', amount: 75000, time: '09:26 PM' }
    ];
    const result = projectBuriedTokensToScoringTimeline(input);
    expect(result[0].time).toBe('09:26 PM');
  });

  it('uses empty string when neither sessionTransactionTime nor time is available', () => {
    const input = [
      { tokenId: 'sam001', shellAccount: 'Customs', amount: 75000, time: '' }
    ];
    const result = projectBuriedTokensToScoringTimeline(input);
    expect(result[0].time).toBe('');
  });

  it('projects multiple rows in order', () => {
    const input = [
      { tokenId: 'sar004', shellAccount: 'Elephant', amount: 450000, time: '09:26 PM' },
      { tokenId: 'qui001', shellAccount: 'Party Guy', amount: 75000, time: '08:43 PM' },
      { tokenId: 'zia001', shellAccount: 'Sarah',     amount: 75000, time: '07:45 PM' }
    ];
    const result = projectBuriedTokensToScoringTimeline(input);

    expect(result).toHaveLength(3);
    expect(result.map(r => r.detail)).toEqual(['sar004', 'qui001', 'zia001']);
    expect(result.map(r => r.team)).toEqual(['Elephant', 'Party Guy', 'Sarah']);
    expect(result.map(r => r.time)).toEqual(['09:26 PM', '08:43 PM', '07:45 PM']);
    result.forEach(row => expect(row.type).toBe('Sale'));
  });

  it('formats numeric amount with $ prefix, + sign, and thousands separator', () => {
    const input = [
      { tokenId: 'a', shellAccount: 'X', amount: 75000, time: '' },
      { tokenId: 'b', shellAccount: 'X', amount: 1500000, time: '' },
      { tokenId: 'c', shellAccount: 'X', amount: 500, time: '' }
    ];
    const result = projectBuriedTokensToScoringTimeline(input);

    expect(result[0].amount).toBe('+$75,000');
    expect(result[1].amount).toBe('+$1,500,000');
    expect(result[2].amount).toBe('+$500');
  });

  it('defaults amount to +$0 when amount is non-numeric', () => {
    const input = [
      { tokenId: 'bad', shellAccount: 'X', time: '' } // amount missing
    ];
    const result = projectBuriedTokensToScoringTimeline(input);
    expect(result[0].amount).toBe('+$0');
  });

  it('always labels type as "Sale"', () => {
    const input = [
      { tokenId: 'x', shellAccount: 'Y', amount: 100, time: '' }
    ];
    expect(projectBuriedTokensToScoringTimeline(input)[0].type).toBe('Sale');
  });
});
