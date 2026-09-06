import {
  appendCappedById,
  cycleOfferStackFrontToBack,
  DEFERRED_SHEET_MAX,
  partitionOfferQueue,
  trimStackOverflowToDeferred,
} from '../utils/offerQueue';
import { OFFER_STACK_VISIBLE_MAX } from '../utils/offerCarousel';

describe('partitionOfferQueue', () => {
  it('fills stack then sheet', () => {
    const pending = [1, 2, 3, 4, 5, 6];
    expect(partitionOfferQueue(pending)).toEqual({
      stack: [1, 2, 3, 4],
      sheet: [5, 6],
    });
  });

  it('caps sheet at 12 when many pending', () => {
    const pending = Array.from({ length: 20 }, (_, i) => i + 1);
    const { stack, sheet } = partitionOfferQueue(pending);
    expect(stack).toHaveLength(OFFER_STACK_VISIBLE_MAX);
    expect(sheet).toHaveLength(DEFERRED_SHEET_MAX);
    expect(stack).toEqual([1, 2, 3, 4]);
    expect(sheet[0]).toBe(5);
    expect(sheet[11]).toBe(16);
  });
});

describe('appendCappedById', () => {
  it('dedupes and FIFO-truncates from the front', () => {
    const list = [{ id: 'a' }, { id: 'b' }];
    const next = appendCappedById(list, [{ id: 'b' }, { id: 'c' }, { id: 'd' }], 3);
    expect(next.map((r) => r.id)).toEqual(['b', 'c', 'd']);
  });
});

describe('trimStackOverflowToDeferred', () => {
  it('moves surplus stack rides into deferred', () => {
    const result = trimStackOverflowToDeferred({
      availableRides: [
        { id: '1' },
        { id: '2' },
        { id: '3' },
        { id: '4' },
        { id: '5' },
      ],
      deferredRides: [],
      stackMax: 4,
      sheetMax: 12,
    });
    expect(result.availableRides.map((r) => r.id)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
    expect(result.deferredRides.map((r) => r.id)).toEqual(['5']);
  });
});

describe('cycleOfferStackFrontToBack', () => {
  it('moves front to the back', () => {
    expect(cycleOfferStackFrontToBack(['a', 'b', 'c'])).toEqual(['b', 'c', 'a']);
  });

  it('is a no-op for fewer than two items', () => {
    expect(cycleOfferStackFrontToBack(['a'])).toEqual(['a']);
    expect(cycleOfferStackFrontToBack([])).toEqual([]);
  });
});
