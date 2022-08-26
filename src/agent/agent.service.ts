import { Injectable } from '@nestjs/common';
import {
  WebhookResponse,
  WebhookResponseRichContextTypes,
  IValue,
} from 'src/types';
import { SolvedResult  } from 'ms-math-solver-api';
import { clone } from 'ramda';
import { Configuration, OpenAIApi } from 'openai';
import { rando } from '@nastyox/rando.js';
import { ComputeEngine } from '@cortex-js/compute-engine'

import { modifyExpression, normalizeLatexExpression } from 'src/utils'
import { ChatbotService } from 'src/chatbot/chatbot.service'
import { MSMathSolverResultActionStep } from 'ms-math-solver-api/dist/lib/types';

@Injectable()
export class AgentService {
  private res: WebhookResponse = {
    fulfillmentResponse: {
      messages: [],
    },
  };

  openai: OpenAIApi;
  private configuration: Configuration;

  constructor() {
    this.configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.openai = new OpenAIApi(this.configuration);
  }

  // webhook
  getRes() {
    return clone(this.res);
  }

  // direct response for chatbot
  getFullRes() {
    return {
      queryResult: {
        responseMessages: [...this.getRes().fulfillmentResponse.messages],
      },
    };
  }

  setRes(res: WebhookResponse): AgentService {
    const service = new AgentService();
    service.res = res;
    return service;
  }

  createEmptyResponse(): AgentService {
    return new AgentService().setRes({
      fulfillmentResponse: {
        messages: [],
      },
    });
  }

  insertText(text: string, atIdx?: number): AgentService {
    const res = this.getRes();

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
    const res = this.getRes();
    res.fulfillmentResponse.messages.push({
      payload: {
        richContent: [...content],
      },
    });
    return new AgentService().setRes(res);
  }

  insertSessionInfo(session: { [key: string]: any }): AgentService {
    const res = this.getRes();
    res['sessionInfo'] = session;
    return new AgentService().setRes(res);
  }

  insertParamInfo(parameters: { [key: string]: any }): AgentService {
    const res = this.getRes();
    res['sessionInfo'] = { parameters };
    return new AgentService().setRes(res);
  }

  insertTargetPage(page): AgentService {
    const res = this.getRes();
    res['targetPage'] = page;
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

  generateSolutionStepsAsDesc(stepData: SolvedResult['solveSteps']) {
    return {
      type: WebhookResponseRichContextTypes.description,
      title: stepData.name,
      items: [
        ...stepData.steps.map((step, idx) => ({
          title: `\n${idx + 1}): ${step.step}`,
          description: `${
            idx === 0
              ? ''
              : `Then you changed ${step.prevExpression} to ${step.expression}`
          }`,
        })),
      ],
    }
  }

  generateSolutionStepsAsMultipleChoice(steps: MSMathSolverResultActionStep[]) {
    const ce = new ComputeEngine()
    return steps.map((step, stepNum) => {
      const answerIdx = rando(3)
      try {
        const candidate = {
          text: `${step.step}\n\nThen you changed ${step.prevExpression} to`,
          choices: [...Array(4).keys()].map((_, idx) => {
            if (idx === answerIdx) {
              return step.expression
            }

            // if more than one expression
            if (step.expression.trim().match(/\$\$/g).length > 2) {
              return ''
            }

            // modify expression
            const cleanedExpression = normalizeLatexExpression(step.expression.trim().replace(/\$/g, ""))
            const parsed = ce.parse(cleanedExpression)
            if (parsed.head === "Error") {
              return '' 
            }
  
            // @ts-ignore
            const modified = `$$${normalizeLatexExpression(ce.serialize(modifyExpression(parsed.json)))}$$`
  
            return modified
          }),
          answerIdx
        }

        // if no choice can be generated
        // of if it is the final step
        // then we just show the answer
        if (candidate.choices.includes('') || stepNum === (steps.length - 1)) {
          return {
            text: `${step.step}\nThen you changed ${step.prevExpression} to ${step.expression}`,
          }
        }

        return candidate
      } catch (err) {
        console.log('aloha', err)
        return {
          text: `${step.step}\nThen you changed ${step.prevExpression} to ${step.expression}`,
        }
      }
    })
  }

  getAltSolveInfo(stepData: SolvedResult['solveSteps']) {
    return this.insertRichContent([
      [
        this.generateSolutionStepsAsDesc(stepData)
      ]
    ])
  }

  getSolveInfo(userID?: string, solvedData?: SolvedResult): WebhookResponse {
    // this.insertText(
    //   solvedData?.answer?.solution
    //     ? `Alrighty! I got the solution now. The answer is: ${solvedData.answer.solution}`
    //     : 'Hmm...there does not seem to be a solution for it. Make sure it is a valid equation/expression',
    // )

    const stepEvalCompleted = solvedData.solveSteps?.steps?.length < 3 || !userID || !solvedData.solveSteps?.steps;
    const hasAltSolutions = solvedData.alternativeSolveSteps?.length > 0;

    // we record the steps in multiple choice
    if (!stepEvalCompleted) {
      // @ts-ignore
      ChatbotService.userDataMap[userID] = ChatbotService.userDataMap[userID] ?? {}
      const steps = solvedData.solveSteps.steps.slice(1)
      ChatbotService.userDataMap[userID].currentProblem = {
        step: 0,
        multipleChoiceSteps: this.generateSolutionStepsAsMultipleChoice(steps),
        maxStep: steps.length - 1,
        altSolutions: solvedData.alternativeSolveSteps
      }
    }

    return this.insertRichContent([
      // do not show concept message if no concept is found
      solvedData.relatedConcepts.length > 0 && [
        {
          type: WebhookResponseRichContextTypes.text,
          text: 'I have found related concepts for you:'
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
        solvedData?.solveSteps?.steps?.length > 0
          ? stepEvalCompleted
            // if there are less than 3 steps, then we don't do the step-by-step evaluation
            ? this.generateSolutionStepsAsDesc(solvedData.solveSteps)
            // Otherwise, we do the step-by-step evaluation, and use the first step as hint
            : {
                type: WebhookResponseRichContextTypes.description,
                title: solvedData.solveSteps.name,
                items: [
                  {
                    title: `Step 1`,
                    description: `${solvedData.solveSteps.steps[0].step}\n\nNow let's solve it step-by-step.`,
                  },
                ],
              }
          : {
              type: WebhookResponseRichContextTypes.text,
              title: 'Hmm...I cannot seem to solve this problem',
            },
      ]
    ])
      .insertParamInfo({
        equationResource: {
          relatedVideos: solvedData.relatedVideos,
          relatedProblems: solvedData.relatedProblems,
        } as IValue,
        hasAltSolutions,
        stepEvalCompleted,
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
      {
        prompt: '<|endoftext|>' + content + '\n--\nLabel:',
        temperature: 0,
        max_tokens: 1,
        top_p: 0,
        logprobs: 10,
        model: 'content-filter-alpha',
      },
    );

    let label = response.data.choices[0].text;
    const toxicThreshold = -0.32;

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
        if (logprob0 && logprob1) {
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

    return label;
  }
}
