import { v4 as uuidv4 } from 'uuid';
import { ComplianceClient } from '../../compliance/compliance.client';

export enum BillStatus {
  Draft    = 'DRAFT',
  Posted   = 'POSTED',
  Reverted = 'REVERTED',
}

export interface BillLineProps {
  description: string;
  quantity: number;
  unitPrice: number;
  taxCategoryId: string;
}

export class BillLine {
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly taxCategoryId: string;

  constructor(props: BillLineProps) {
    if (!props.description?.trim()) throw new Error('Bill line description is required.');
    if (props.quantity <= 0)        throw new Error('Bill line quantity must be greater than zero.');
    if (props.unitPrice < 0)        throw new Error('Bill line unit price cannot be negative.');
    this.description   = props.description;
    this.quantity      = props.quantity;
    this.unitPrice     = props.unitPrice;
    this.taxCategoryId = props.taxCategoryId;
  }

  get netAmount(): number { return this.quantity * this.unitPrice; }
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

  private constructor(id: string, props: FaturaHyreseProps, status = BillStatus.Draft) {
    if (!props.supplierId?.trim())          throw new Error('SupplierId is required.');
    if (!props.issueDate)                   throw new Error('Issue date is required.');
    if (!props.currency?.trim())            throw new Error('Currency is required.');
    if (!props.lines?.length)              throw new Error('At least one bill line is required.');
    this.id          = id;
    this.supplierId  = props.supplierId;
    this.issueDate   = props.issueDate;
    this.dueDate     = props.dueDate ?? null;
    this.currency    = props.currency;
    this._status     = status;
    this._lines      = props.lines.map(l => new BillLine(l));
  }

  static createNew(props: FaturaHyreseProps): FaturaHyrese {
    return new FaturaHyrese(uuidv4(), props, BillStatus.Draft);
  }

  static rehydrate(id: string, props: FaturaHyreseProps, status: BillStatus): FaturaHyrese {
    return new FaturaHyrese(id, props, status);
  }

  get status(): BillStatus                { return this._status; }
  get lines(): ReadonlyArray<BillLine>    { return this._lines; }
  get totalNetAmount(): number            { return this._lines.reduce((s, l) => s + l.netAmount, 0); }

  private ensureMutable(): void {
    if (this._status === BillStatus.Posted)   throw new Error('Cannot modify a posted bill. Use reversal.');
    if (this._status === BillStatus.Reverted) throw new Error('Cannot modify a reverted bill.');
  }

  post(complianceClient: ComplianceClient): void {
    if (this._status !== BillStatus.Draft) {
      throw new Error(`Bill can only be posted from Draft. Current: ${this._status}`);
    }
    complianceClient.assertAllValidTaxIds(this._lines.map(l => l.taxCategoryId));
    this._status = BillStatus.Posted;
  }

  reverse(): void {
    if (this._status !== BillStatus.Posted) {
      throw new Error(`Storno is only allowed for Posted bills. Current: ${this._status}`);
    }
    this._status = BillStatus.Reverted;
  }
}
