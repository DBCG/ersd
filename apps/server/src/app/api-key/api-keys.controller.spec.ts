import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeysController } from './api-keys.controller';

describe('Subscription Controller', () => {
  let module: TestingModule;
  
  beforeAll(async () => {
    module = await Test.createTestingModule({
      controllers: [ApiKeysController],
    }).compile();
  });
  it('should be defined', () => {
    const controller: ApiKeysController = module.get<ApiKeysController>(ApiKeysController);
    expect(controller).toBeDefined();
  });
});