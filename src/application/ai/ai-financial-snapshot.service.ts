import { Injectable, OnModuleInit } from '@nestjs/common';
import { DomainEventBus } from '../events/domain-event.bus';

@Injectable()
export class AiFinancialSnapshotService implements OnModuleInit {
  private totalExpenses = 0;

  constructor(private readonly domainEventBus: DomainEventBus) {}

  onModuleInit(): void {
    this.domainEventBus.subscribe('journalEntryPosted', (event) => {
      this.totalExpenses = this.totalExpenses + event.deltaExpenses;
    });
  }

  getSnapshot() {
    return {
      totalExpenses: this.totalExpenses
    };
  }
}
