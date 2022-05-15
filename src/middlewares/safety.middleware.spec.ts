import { SafetyMiddleware } from './safety.middleware';

describe('SafetyMiddleware', () => {
  it('should be defined', () => {
    expect(new SafetyMiddleware()).toBeDefined();
  });
});
