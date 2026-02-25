import { v4 as uuidv4 } from 'uuid';
import { TaxCategoryId, TaxRuleService } from '../tax/tax-rule.service';

export enum BillStatus {
  Draft = 'DRAFT',
  Posted = 'POSTED',
  Reverted = 'REVERTED'
}

export interface BillLineProps {
  description: string;
  quantity: number;
  unitPrice: number;
  taxCategoryId: TaxCategoryId | string;
}

export class BillLine {
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly taxCategoryId: TaxCategoryId | string;

  constructor(props: BillLineProps) {
    if (!props.description || !props.description.trim()) {
      throw new Error('Bill line description is required.');
    }
    if (props.quantity <= 0) {
      throw new Error('Bill line quantity must be greater than zero.');
    }
    if (props.unitPrice < 0) {
      throw new Error('Bill line unit price cannot be negative.');
    }

    this.description = props.description;
    this.quantity = props.quantity;
    this.unitPrice = props.unitPrice;
    this.taxCategoryId = props.taxCategoryId;
  }

  get netAmount(): number {
    return this.quantity * this.unitPrice;
  }
}

export interface FaturaHyreseProps {
  supplierId: string;
  issueDate: Date;
  dueDate?: Date | null;
  currency: string;
  lines: BillLineProps[];
}

export class FaturaHyrese {
  readonly id: string;
  readonly supplierId: string;
  readonly issueDate: Date;
  readonly dueDate?: Date | null;
  readonly currency: string;

  private _status: BillStatus;
  private _lines: BillLine[];

  private constructor(
    id: string,
    props: FaturaHyreseProps,
    status: BillStatus = BillStatus.Draft
  ) {
    if (!props.supplierId || !props.supplierId.trim()) {
      throw new Error('SupplierId is required.');
    }
    if (!props.issueDate) {
      throw new Error('Issue date is required.');
    }
    if (!props.currency || !props.currency.trim()) {
      throw new Error('Currency is required.');
    }
    if (!props.lines || props.lines.length === 0) {
      throw new Error('At least one bill line is required.');
    }

    this.id = id;
    this.supplierId = props.supplierId;
    this.issueDate = props.issueDate;
    this.dueDate = props.dueDate ?? null;
    this.currency = props.currency;
    this._status = status;
    this._lines = props.lines.map((l) => new BillLine(l));
  }

  static createNew(props: FaturaHyreseProps): FaturaHyrese {
    const id = uuidv4();
    return new FaturaHyrese(id, props, BillStatus.Draft);
  }

  static rehydrate(
    id: string,
    props: FaturaHyreseProps,
    status: BillStatus
  ): FaturaHyrese {
    return new FaturaHyrese(id, props, status);
  }

  get status(): BillStatus {
    return this._status;
  }

  get lines(): ReadonlyArray<BillLine> {
    return this._lines;
  }

  get totalNetAmount(): number {
    return this._lines.reduce((sum, line) => sum + line.netAmount, 0);
  }

  private ensureMutable(): void {
    if (this._status === BillStatus.Posted) {
      throw new Error('Cannot modify a posted bill. Use reversal.');
    }
    if (this._status === BillStatus.Reverted) {
      throw new Error('Cannot modify a reverted bill.');
    }
  }

  addLine(line: BillLineProps): void {
    this.ensureMutable();
    this._lines.push(new BillLine(line));
  }

  private doPost(taxRuleService: TaxRuleService): void {
    if (this._status !== BillStatus.Draft) {
      throw new Error(
        `Bill can only be posted from Draft. Current status: ${this._status}`
      );
    }

    const taxIds = this._lines.map((l) => l.taxCategoryId);
    taxRuleService.assertAllValid(taxIds as string[]);

    this._status = BillStatus.Posted;
  }

  post(taxRuleService: TaxRuleService): void {
    this.doPost(taxRuleService);
  }

  Post(taxRuleService: TaxRuleService): void {
    this.doPost(taxRuleService);
  }

  reverse(): void {
    if (this._status !== BillStatus.Posted) {
      throw new Error(
        `Storno is only allowed for Posted bills. Current status: ${this._status}`
      );
    }
    this._status = BillStatus.Reverted;
  }
}

