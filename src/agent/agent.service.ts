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
          text: 'Solve/simplify an equation!',
        },
      ],
      [
        {
          text: 'Recommend some learning resources',
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
}
