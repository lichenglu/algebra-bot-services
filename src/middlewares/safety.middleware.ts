import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

import { WebhookResponseRichContextTypes } from 'src/types';
import { AgentService } from 'src/agent/agent.service';
import { CHEER_UP_PLACEHOLDERS } from 'src/constants';

@Injectable()
export class SafetyMiddleware implements NestMiddleware {
  constructor(private agentService: AgentService) {}

  async use(req: Request, res: Response, next: () => void) {
    const response = await this.agentService.openai.createCompletion(
      'content-filter-alpha',
      {
        prompt: '<|endoftext|>' + req.body.message + '\n--\nLabel:',
        temperature: 0,
        max_tokens: 1,
        top_p: 0,
        logprobs: 10,
      },
    );

    let label = response.data.choices[0].text;
    const toxicThreshold = -0.355;

    if (label === '2') {
      // If the model returns "2", return its confidence in 2 or other output-labels
      const logprobs =
        response.data['choices'][0]['logprobs']['top_logprobs'][0];

      // If the model is not sufficiently confident in "2",
      // choose the most probable of "0" or "1"
      // Guaranteed to have a confidence for 2 since this was the selected token.

      if (logprobs['2'] < toxicThreshold) {
        const logprob0 = logprobs['0'] ?? null;
        const logprob1 = logprobs['1'] ?? null;

        // If both "0" and "1" have probabilities, set the output label
        // to whichever is most probable
        if (!logprob0 && !logprob1) {
          logprob0 >= logprob1 ? '0' : '1';

          // If only one of them is found, set output label to that one
        } else if (!logprob0) {
          label = '0';
        } else if (!logprob1) {
          label = '1';
        }

        // If neither "0" or "1" are available, stick with "2"
        // by leaving output_label unchanged.
      }
    }

    if (!['0', '1', '2'].includes(label)) {
      label = '2';
    }

    console.log('label', label);

    if (label === '2') {
      const cheerUp =
        CHEER_UP_PLACEHOLDERS[
          Math.floor(Math.random() * CHEER_UP_PLACEHOLDERS.length)
        ];
      return res.json({
        queryResult: {
          responseMessages: [
            {
              text: {
                text: [cheerUp.text],
                allowPlaybackInterruption: false,
              },
              message: 'text',
            },
            {
              payload: {
                richContent: [
                  [
                    {
                      accessibilityText: 'Cheer up!',
                      rawUrl: cheerUp.image,
                      type: 'image',
                    },
                  ],
                ],
              },
              message: 'payload',
            },
          ],
        },
      });
    }

    next();
  }
}
