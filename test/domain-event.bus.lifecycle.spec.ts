import { Test, TestingModule } from '@nestjs/testing';
import { DomainEventBus } from '../src/application/events/domain-event.bus';

describe('DomainEventBus lifecycle', () => {
  it('initializes in-memory and destroys cleanly', async () => {
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.PUBSUB_ENABLED;
    const module: TestingModule = await Test.createTestingModule({
      providers: [DomainEventBus],
    }).compile();
    const bus = module.get(DomainEventBus);
    await bus.onModuleInit();
    await bus.onModuleDestroy();
  });
});
