import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

import { WebhookResponseRichContextTypes } from 'src/types';
import { AgentService } from 'src/agent/agent.service';
import { CHEER_UP_PLACEHOLDERS } from 'src/constants';

@Injectable()
export class SafetyMiddleware implements NestMiddleware {
  constructor(private agentService: AgentService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const label = await this.agentService.checkSafetyOf(req.body.message);

    console.log('label', label);

    if (label === '2') {
      const cheerUp =
        CHEER_UP_PLACEHOLDERS[
          Math.floor(Math.random() * CHEER_UP_PLACEHOLDERS.length)
        ];
      return res.json(
        this.agentService
          .insertText(cheerUp.text)
          .insertRichContent([
            [
              {
                accessibilityText: 'Cheer up!',
                rawUrl: cheerUp.image,
                type: WebhookResponseRichContextTypes.image,
              },
            ],
          ])
          .getRes(),
      );
    }

    next();
  }
}
