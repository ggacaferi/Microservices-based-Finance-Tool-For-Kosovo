import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

// ── Event Type Definitions ───────────────────────────────

export interface BillPostedEvent {
  type: 'billPosted';
  billId: string;
  supplierId: string;
  totalNetAmount: number;
  date: string;
  originalReference: string;
}

export interface BillRevertedEvent {
  type: 'billReverted';
  originalReference: string;
  billId: string;
  date: string;
  reason?: string;
}

export interface JournalEntryPostedEvent {
  type: 'journalEntryPosted';
  journalEntryId: string;
  reference: string;
  date: string;
  deltaExpenses: number;
}

export type DomainEvent =
  | BillPostedEvent
  | BillRevertedEvent
  | JournalEntryPostedEvent;

// ── Topic name mapping ───────────────────────────────────

const TOPIC_MAP: Record<DomainEvent['type'], string> = {
  billPosted: 'guri-finance.operations.bill-posted',
  billReverted: 'guri-finance.operations.bill-reverted',
  journalEntryPosted: 'guri-finance.ledger.journal-entry-posted',
};

const SUBSCRIPTION_MAP: Record<DomainEvent['type'], string> = {
  billPosted: 'guri-finance.ledger.bill-posted-sub',
  billReverted: 'guri-finance.ledger.bill-reverted-sub',
  journalEntryPosted: 'guri-finance.ai.journal-entry-posted-sub',
};

// ── Google Cloud Pub/Sub–backed Event Bus ────────────────

@Injectable()
export class DomainEventBus implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DomainEventBus.name);
  private readonly localHandlers = new Map<DomainEvent['type'], Array<(event: DomainEvent) => void>>();

  private pubsubClient: any = null;
  private readonly activeSubscriptions: any[] = [];
  private usePubSub = false;

  async onModuleInit(): Promise<void> {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;

    if (projectId && process.env.PUBSUB_ENABLED === 'true') {
      try {
        const { PubSub } = await import('@google-cloud/pubsub');
        this.pubsubClient = new PubSub({ projectId });
        this.usePubSub = true;

        // Ensure topics + subscriptions exist
        for (const [eventType, topicName] of Object.entries(TOPIC_MAP)) {
          await this.ensureTopic(topicName);
          const subName = SUBSCRIPTION_MAP[eventType as DomainEvent['type']];
          await this.ensureSubscription(topicName, subName);
        }

        this.logger.log(`✅ Google Cloud Pub/Sub connected (project: ${projectId})`);
        this.logger.log(`   Topics: ${Object.values(TOPIC_MAP).join(', ')}`);

        // Start pulling messages for subscribed event types
        await this.startSubscriptions();
      } catch (err: any) {
        this.logger.warn(`⚠️  Pub/Sub init failed (${err.message}), falling back to in-memory bus`);
        this.usePubSub = false;
      }
    } else {
      this.logger.log('📨 Event bus: in-memory (set PUBSUB_ENABLED=true + GOOGLE_CLOUD_PROJECT for Pub/Sub)');
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const sub of this.activeSubscriptions) {
      sub.removeAllListeners();
      await sub.close().catch(() => {});
    }
    if (this.pubsubClient) {
      await this.pubsubClient.close().catch(() => {});
    }
  }

  // ── Public API (same interface whether Pub/Sub or in-memory) ──

  subscribe<T extends DomainEvent['type']>(
    type: T,
    handler: (event: Extract<DomainEvent, { type: T }>) => void,
  ): void {
    const list = this.localHandlers.get(type) ?? [];
    list.push(handler as (event: DomainEvent) => void);
    this.localHandlers.set(type, list);
  }

  async publish<T extends DomainEvent>(event: T): Promise<void> {
    if (this.usePubSub && this.pubsubClient) {
      await this.publishToPubSub(event);
    }

    // Always dispatch to local handlers (in-process subscribers)
    // In a true microservice split, each service only has local handlers
    // for events it subscribes to via Pub/Sub pull.
    this.dispatchLocally(event);
  }

  // ── Pub/Sub internals ──────────────────────────────────

  private async publishToPubSub(event: DomainEvent): Promise<void> {
    const topicName = TOPIC_MAP[event.type];
    if (!topicName) return;

    try {
      const topic = this.pubsubClient.topic(topicName);
      const data = Buffer.from(JSON.stringify(event));
      const messageId = await topic.publishMessage({ data });
      this.logger.debug(`Published ${event.type} → ${topicName} (msg: ${messageId})`);
    } catch (err: any) {
      this.logger.error(`Failed to publish ${event.type} to Pub/Sub: ${err.message}`);
      // Events still dispatched locally as fallback
    }
  }

  private async startSubscriptions(): Promise<void> {
    // For each event type that has local handlers registered,
    // start a Pub/Sub pull subscription
    for (const [eventType, subName] of Object.entries(SUBSCRIPTION_MAP)) {
      try {
        const subscription = this.pubsubClient.subscription(subName);
        subscription.on('message', (message: any) => {
          try {
            const event: DomainEvent = JSON.parse(message.data.toString());
            this.logger.debug(`Received ${event.type} from ${subName}`);
            // Don't dispatch locally — Pub/Sub messages are for cross-service only
            // Local handlers already fired during publish() in the same process
            message.ack();
          } catch (err: any) {
            this.logger.error(`Error processing Pub/Sub message: ${err.message}`);
            message.nack();
          }
        });
        this.activeSubscriptions.push(subscription);
      } catch (err: any) {
        this.logger.warn(`Could not subscribe to ${subName}: ${err.message}`);
      }
    }
  }

  private dispatchLocally(event: DomainEvent): void {
    const list = this.localHandlers.get(event.type) ?? [];
    for (const handler of list) {
      handler(event);
    }
  }

  private async ensureTopic(topicName: string): Promise<void> {
    try {
      const [exists] = await this.pubsubClient.topic(topicName).exists();
      if (!exists) {
        await this.pubsubClient.createTopic(topicName);
        this.logger.log(`Created Pub/Sub topic: ${topicName}`);
      }
    } catch { /* topic may already exist */ }
  }

  private async ensureSubscription(topicName: string, subName: string): Promise<void> {
    try {
      const [exists] = await this.pubsubClient.subscription(subName).exists();
      if (!exists) {
        await this.pubsubClient.topic(topicName).createSubscription(subName);
        this.logger.log(`Created Pub/Sub subscription: ${subName}`);
      }
    } catch { /* subscription may already exist */ }
  }
}
