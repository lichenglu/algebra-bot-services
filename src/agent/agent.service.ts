import { Injectable } from '@nestjs/common';
import {
  WebhookResponse,
  WebhookResponseRichContextTypes,
  IValue,
} from 'src/types';
import { SolvedResult } from 'ms_math_solver_api';
import { clone } from 'ramda'
import { Configuration, OpenAIApi } from 'openai'

@Injectable()
export class AgentService {
  private res: WebhookResponse = {
    fulfillmentResponse: {
      messages: [],
    },
  };

  openai: OpenAIApi
  private configuration: Configuration

  constructor() {
    this.configuration = new Configuration({
        apiKey: process.env.OPENAI_API_KEY,
      });
    this.openai = new OpenAIApi(this.configuration);
  }

  getRes() {
    return clone(this.res);
  }

  setRes(res: WebhookResponse): AgentService {
    const service = new AgentService()
    service.res = res
    return service
  }

  createEmptyResponse(): AgentService {
    return new AgentService().setRes({
        fulfillmentResponse: {
          messages: [],
        },
      });
  }

  insertText(text: string, atIdx?: number): AgentService {
    const res = this.getRes()

    const textObj = {
      text: {
        //fulfillment text response to be sent to the agent
        text: [text],
      },
    };
    if (atIdx === undefined) {
      res.fulfillmentResponse.messages.push(textObj);
    } else {
      res.fulfillmentResponse.messages.splice(atIdx, 0, textObj);
    }
    return new AgentService().setRes(res);
  }

  insertRichContent(
    content: {
      type: WebhookResponseRichContextTypes;
      text?: string | string[];
      [key: string]: any;
    }[][],
  ): AgentService {
    const res = this.getRes()
    res.fulfillmentResponse.messages.push({
      payload: {
        richContent: [...content],
      },
    });
    return new AgentService().setRes(res);
  }

  insertSessionInfo(session: { [key: string]: any }): AgentService {
    const res = this.getRes()
    res['sessionInfo'] = session;
    return new AgentService().setRes(res);
  }

  insertParamInfo(parameters: { [key: string]: any }): AgentService {
    const res = this.getRes()
    res['sessionInfo'] = { parameters };
    return new AgentService().setRes(res);
  }

  getHelpSeekingPrompt(): WebhookResponse {
    return this.insertRichContent([
      [
        {
          type: WebhookResponseRichContextTypes.button,
          text: 'Search relevant videos in Math Nation',
        },
      ],
      [
        {
          type: WebhookResponseRichContextTypes.button,
          text: 'Solve/simplify an equation!',
        },
      ],
      [
        {
          text: 'Recommend external learning resources',
          type: WebhookResponseRichContextTypes.button,
        },
      ],
      [
        {
          text: 'Summarize a chunk of texts',
          type: WebhookResponseRichContextTypes.button,
        },
      ],
      [
        {
          text: 'Correct grammar for me',
          type: WebhookResponseRichContextTypes.button,
        },
      ],
    ]).getRes();
  }

  getSolveInfo(solvedData?: SolvedResult): WebhookResponse {
    return this.insertText(
      solvedData?.answer?.solution 
        ? `Alrighty! I got the solution now. The answer is: ${solvedData.answer.solution}`
        : 'Hmm...there does not seem to be a solution for it. Make sure it is a valid equation',
    )
      .insertRichContent([
        [
          solvedData?.solveSteps?.length > 0 && {
            type: WebhookResponseRichContextTypes.description,
            title: 'Helpful Info for Solving',
            items: [
              ...solvedData.solveSteps.map((step, idx) => ({
                title: `\n${idx + 1}): ${step.step}`,
                description: `${
                  idx === 0
                    ? ''
                    : `Then you changed ${step.prevExpression} to ${step.expression}`
                }`,
              })),
              {
                title:
                  solvedData.relatedConcepts.length > 0
                    ? '\nI have also found related concepts for you:'
                    : '',
              },
            ],
          },
          {
            type: WebhookResponseRichContextTypes.chips,
            options: solvedData.relatedConcepts.map((cpt) => {
              return {
                text: cpt.name,
                link: cpt.url,
              };
            }),
          },
        ],
        [
          {
            type: WebhookResponseRichContextTypes.text,
            title:
              'Meanwhile, I can also recommend videos and practice problems to help with your learning. Do you want them?',
          },
          {
            type: WebhookResponseRichContextTypes.button,
            text: 'Yes, PLEASE!',
          },
          {
            type: WebhookResponseRichContextTypes.button,
            text: 'Nah...I am good',
          },
        ],
      ])
      .insertParamInfo({
        equationResource: {
          relatedVideos: solvedData.relatedVideos,
          relatedProblems: solvedData.relatedProblems,
        } as IValue,
      })
      .getRes();
  }

  getResourceRecommendation(
    solvedData: Partial<SolvedResult>,
  ): WebhookResponse {
    return this.insertRichContent([
      [
        {
          type: WebhookResponseRichContextTypes.info,
          text: 'Video Recommendation',
          items: solvedData.relatedVideos.slice(0, 3).map((vid) => {
            const thumbnail = Array.isArray(vid.thumbnail)
              ? vid.thumbnail[0]
              : vid.thumbnail;
            return {
              type: WebhookResponseRichContextTypes.info,
              rawUrl: thumbnail?.thumbnailUrl,
              title: `Video: ${vid.name}`,
              subtitle: vid.description,
              actionLink: vid.url,
            };
          }),
        },
      ],
      [
        {
          type: WebhookResponseRichContextTypes.info,
          text: 'Problem Recommendation',
          items: solvedData.relatedProblems.slice(0, 3).map((prob) => {
            return {
              type: WebhookResponseRichContextTypes.info,
              title: `Pratice: ${prob.title}`,
              subtitle: prob.snippet,
              actionLink: prob.url,
            };
          }),
        },
      ],
    ]).getRes();
  }

  async checkSafetyOf(content: string) {
    const response = await this.openai.createCompletion(
      'content-filter-alpha',
      {
        prompt: '<|endoftext|>' + content + '\n--\nLabel:',
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

    return label
  }
}
