import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AgentService } from '../agent/agent.service';

@Injectable()
export class OpenAIMiddleware implements NestMiddleware {
  constructor(private agentService: AgentService) {}

  use(req: Request, res: Response, next: () => void) {
    console.log('ohhhhhh', process.env.ENABLE_OPENAI)
    if (process.env.ENABLE_OPENAI === 'false') {
      return res.json(
        this.agentService
          .insertText('This is a placeholder for openAI calls')
          .getRes(),
      );
    }

    next();
  }
}
