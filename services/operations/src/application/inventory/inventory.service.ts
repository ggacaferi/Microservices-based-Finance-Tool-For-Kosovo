import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ActivityLogService } from '../operations/activity-log.service';

export type InventoryMovementType = 'RECEIPT' | 'ISSUE';

export interface InventoryItem {
  sku: string;
  description: string;
  quantityOnHand: number;
  averageUnitCost: number;
}

export interface InventoryMovement {
  id: string;
  sku: string;
  description: string;
  type: InventoryMovementType;
  quantity: number;
  unitCost: number;
  note?: string;
  createdAt: string;
  reversedByMovementId?: string;
}

@Injectable()
export class InventoryService {
  private readonly items = new Map<string, InventoryItem>();
  private readonly movements = new Map<string, InventoryMovement>();

  constructor(private readonly activityLogService: ActivityLogService) {}

  recordMovement(input: {
    sku: string;
    description: string;
    type: InventoryMovementType;
    quantity: number;
    unitCost?: number;
    note?: string;
  }): InventoryMovement {
    if (input.quantity <= 0) {
      throw new Error('Quantity must be greater than zero');
    }

    const item = this.ensureItem(input.sku, input.description);

    let unitCostToUse = input.unitCost ?? item.averageUnitCost;
    if (input.type === 'RECEIPT' && unitCostToUse < 0) {
      throw new Error('Receipt unit cost cannot be negative');
    }
    if (input.type === 'ISSUE') {
      if (item.quantityOnHand < input.quantity) {
        throw new Error('Insufficient stock for issue movement');
      }
      unitCostToUse = item.averageUnitCost;
    }

    const movement: InventoryMovement = {
      id: uuidv4(),
      sku: input.sku,
      description: input.description,
      type: input.type,
      quantity: input.quantity,
      unitCost: unitCostToUse,
      note: input.note,
      createdAt: new Date().toISOString()
    };

    this.applyMovement(item, movement);
    this.movements.set(movement.id, movement);

    this.activityLogService.record('INVENTORY_MOVEMENT', {
      entityId: movement.id,
      summary: `${movement.type} ${movement.quantity} units for ${movement.sku}`,
      metadata: { sku: movement.sku }
    });

    return movement;
  }

  reverseMovement(id: string, reason: string): InventoryMovement {
    const original = this.movements.get(id);
    if (!original) {
      throw new NotFoundException(`Inventory movement with id ${id} not found`);
    }
    if (original.reversedByMovementId) {
      throw new Error('Inventory movement already reversed');
    }

    const reverseType: InventoryMovementType = original.type === 'RECEIPT' ? 'ISSUE' : 'RECEIPT';

    const reversal = this.recordMovement({
      sku: original.sku,
      description: `${original.description} (storno)`,
      type: reverseType,
      quantity: original.quantity,
      unitCost: original.unitCost,
      note: `Storno of ${original.id}. Reason: ${reason || 'n/a'}`
    });

    original.reversedByMovementId = reversal.id;

    this.activityLogService.record('INVENTORY_STORNO', {
      entityId: reversal.id,
      summary: `Inventory movement ${original.id} reversed. Reason: ${reason || 'n/a'}`
    });

    return reversal;
  }

  getValuation() {
    const items = Array.from(this.items.values()).sort((a, b) =>
      a.sku.localeCompare(b.sku)
    );

    const totalValue = items.reduce(
      (sum, item) => sum + item.quantityOnHand * item.averageUnitCost,
      0
    );

    return {
      totalValue,
      items,
      movements: Array.from(this.movements.values()).sort((a, b) =>
        a.createdAt > b.createdAt ? -1 : 1
      )
    };
  }

  private ensureItem(sku: string, description: string): InventoryItem {
    const existing = this.items.get(sku);
    if (existing) {
      return existing;
    }

    const created: InventoryItem = {
      sku,
      description,
      quantityOnHand: 0,
      averageUnitCost: 0
    };
    this.items.set(sku, created);
    return created;
  }

  private applyMovement(item: InventoryItem, movement: InventoryMovement) {
    if (movement.type === 'RECEIPT') {
      const currentValue = item.quantityOnHand * item.averageUnitCost;
      const incomingValue = movement.quantity * movement.unitCost;
      const newQty = item.quantityOnHand + movement.quantity;

      item.quantityOnHand = newQty;
      item.averageUnitCost = newQty === 0 ? 0 : (currentValue + incomingValue) / newQty;
      return;
    }

    item.quantityOnHand = item.quantityOnHand - movement.quantity;
  }
}
