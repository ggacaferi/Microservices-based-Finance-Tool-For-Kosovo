import fc from 'fast-check';
import { BillLine } from '../../src/domain/bills/fatura-hyrese.aggregate';

describe('BillLine properties', () => {
  it('netAmount equals quantity * unitPrice for positive quantities', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        fc.integer({ min: 1, max: 1000 }),
        fc.double({ min: 0, max: 10_000, noNaN: true }),
        (description, quantity, unitPrice) => {
          const line = new BillLine({
            description,
            quantity,
            unitPrice,
            taxCategoryId: '43',
          });
          expect(line.netAmount).toBeCloseTo(quantity * unitPrice, 5);
        },
      ),
      { numRuns: 50 },
    );
  });
});
