import { OpenAIMiddleware } from './openai.middleware';
import { AgentService } from '../agent/agent.service';

describe('OpenAIMiddleware', () => {
  it('should be defined', () => {
    expect(new OpenAIMiddleware(new AgentService())).toBeDefined();
  });
});
