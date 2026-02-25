import { ActivityLogService } from '../src/application/operations/activity-log.service';
import { InventoryService } from '../src/application/inventory/inventory.service';

describe('InventoryService', () => {
  let service: InventoryService;

  beforeEach(() => {
    service = new InventoryService(new ActivityLogService());
  });

  it('applies weighted average valuation correctly', () => {
    service.recordMovement({
      sku: 'SKU-1',
      description: 'Notebook',
      type: 'RECEIPT',
      quantity: 10,
      unitCost: 5
    });

    service.recordMovement({
      sku: 'SKU-1',
      description: 'Notebook',
      type: 'RECEIPT',
      quantity: 5,
      unitCost: 7
    });

    const valuation = service.getValuation();
    const item = valuation.items.find((x) => x.sku === 'SKU-1');

    expect(item).toBeDefined();
    expect(item?.quantityOnHand).toBe(15);
    expect(Number(item?.averageUnitCost.toFixed(2))).toBe(5.67);
    expect(Number(valuation.totalValue.toFixed(2))).toBe(85);
  });

  it('prevents issuing more stock than available', () => {
    service.recordMovement({
      sku: 'SKU-2',
      description: 'Mouse',
      type: 'RECEIPT',
      quantity: 3,
      unitCost: 20
    });

    expect(() =>
      service.recordMovement({
        sku: 'SKU-2',
        description: 'Mouse',
        type: 'ISSUE',
        quantity: 5
      })
    ).toThrow(/Insufficient stock/);
  });

  it('supports storno reversal of a movement', () => {
    const movement = service.recordMovement({
      sku: 'SKU-3',
      description: 'Keyboard',
      type: 'RECEIPT',
      quantity: 4,
      unitCost: 30
    });

    const reversal = service.reverseMovement(movement.id, 'Entry mistake');
    const valuation = service.getValuation();
    const item = valuation.items.find((x) => x.sku === 'SKU-3');

    expect(reversal.type).toBe('ISSUE');
    expect(item?.quantityOnHand).toBe(0);
  });
});
