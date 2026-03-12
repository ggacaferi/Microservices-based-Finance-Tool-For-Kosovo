import { Injectable, NotFoundException, Optional, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ActivityLogService } from '../operations/activity-log.service';
import { InventoryMovementOrmEntity } from '../../infrastructure/persistence/inventory/inventory-movement.orm-entity';

export type InventoryMovementType = 'RECEIPT' | 'ISSUE';

export interface InventoryItem {
  sku: string; description: string; quantityOnHand: number; averageUnitCost: number;
}

export interface InventoryMovement {
  id: string; sku: string; description: string; type: InventoryMovementType;
  quantity: number; unitCost: number; note?: string; createdAt: string;
  reversedByMovementId?: string;
}

@Injectable()
export class InventoryService implements OnModuleInit {
  private readonly items     = new Map<string, InventoryItem>();
  private readonly movements = new Map<string, InventoryMovement>();

  constructor(
    private readonly activityLogService: ActivityLogService,
    @Optional() @InjectRepository(InventoryMovementOrmEntity, 'operations')
    private readonly orm?: Repository<InventoryMovementOrmEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.orm) return;
    const rows = await this.orm.find({ order: { createdAt: 'ASC' } });
    for (const r of rows) {
      const mv: InventoryMovement = {
        id: r.id, sku: r.sku, description: r.description,
        type: r.type as InventoryMovementType,
        quantity: Number(r.quantity), unitCost: Number(r.unitCost),
        note: r.note ?? undefined, createdAt: r.createdAt.toISOString(),
        reversedByMovementId: r.reversedByMovementId ?? undefined,
      };
      this.movements.set(mv.id, mv);
      const item = this.ensureItem(mv.sku, mv.description);
      this.applyMovement(item, mv);
    }
  }

  private async persistMovement(mv: InventoryMovement): Promise<void> {
    if (!this.orm) return;
    await this.orm.save({
      id: mv.id, sku: mv.sku, description: mv.description, type: mv.type,
      quantity: mv.quantity, unitCost: mv.unitCost, note: mv.note ?? null,
      reversedByMovementId: mv.reversedByMovementId ?? null,
    });
  }

  async recordMovement(input: {
    sku: string; description: string; type: InventoryMovementType;
    quantity: number; unitCost?: number; note?: string;
  }): Promise<InventoryMovement> {
    if (input.quantity <= 0) throw new Error('Quantity must be greater than zero');
    const item = this.ensureItem(input.sku, input.description);
    let unitCostToUse = input.unitCost ?? item.averageUnitCost;
    if (input.type === 'RECEIPT' && unitCostToUse < 0) throw new Error('Receipt unit cost cannot be negative');
    if (input.type === 'ISSUE') {
      if (item.quantityOnHand < input.quantity) throw new Error('Insufficient stock for issue movement');
      unitCostToUse = item.averageUnitCost;
    }
    const movement: InventoryMovement = {
      id: uuidv4(), sku: input.sku, description: input.description, type: input.type,
      quantity: input.quantity, unitCost: unitCostToUse, note: input.note,
      createdAt: new Date().toISOString(),
    };
    this.applyMovement(item, movement);
    this.movements.set(movement.id, movement);
    await this.persistMovement(movement);
    this.activityLogService.record('INVENTORY_MOVEMENT', { entityId: movement.id, summary: `${movement.type} ${movement.quantity} units for ${movement.sku}`, metadata: { sku: movement.sku } });
    return movement;
  }

  async reverseMovement(id: string, reason: string): Promise<InventoryMovement> {
    const original = this.movements.get(id);
    if (!original) throw new NotFoundException(`Inventory movement with id ${id} not found`);
    if (original.reversedByMovementId) throw new Error('Inventory movement already reversed');
    const reverseType: InventoryMovementType = original.type === 'RECEIPT' ? 'ISSUE' : 'RECEIPT';
    const reversal = await this.recordMovement({
      sku: original.sku, description: `${original.description} (storno)`,
      type: reverseType, quantity: original.quantity, unitCost: original.unitCost,
      note: `Storno of ${original.id}. Reason: ${reason || 'n/a'}`,
    });
    original.reversedByMovementId = reversal.id;
    await this.persistMovement(original);
    this.activityLogService.record('INVENTORY_STORNO', { entityId: reversal.id, summary: `Inventory movement ${original.id} reversed. Reason: ${reason || 'n/a'}` });
    return reversal;
  }

  getValuation() {
    return {
      totalValue: Array.from(this.items.values()).reduce((s, i) => s + i.quantityOnHand * i.averageUnitCost, 0),
      items: Array.from(this.items.values()).sort((a, b) => a.sku.localeCompare(b.sku)),
      movements: Array.from(this.movements.values()).sort((a, b) => a.createdAt > b.createdAt ? -1 : 1),
    };
  }

  private ensureItem(sku: string, description: string): InventoryItem {
    if (!this.items.has(sku)) this.items.set(sku, { sku, description, quantityOnHand: 0, averageUnitCost: 0 });
    return this.items.get(sku)!;
  }

  private applyMovement(item: InventoryItem, mv: InventoryMovement) {
    if (mv.type === 'RECEIPT') {
      const newQty = item.quantityOnHand + mv.quantity;
      item.averageUnitCost = newQty === 0 ? 0 : (item.quantityOnHand * item.averageUnitCost + mv.quantity * mv.unitCost) / newQty;
      item.quantityOnHand = newQty;
    } else {
      item.quantityOnHand -= mv.quantity;
    }
  }
}
