import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { initService, SolvedResult } from 'ms_math_solver_api';

import {
  WebhookRequest,
  WebhookResponse,
  WebhookResponseRichContextTypes,
  IValue,
} from 'src/types';
import { getStaticImageURL } from 'src/utils';

@Controller('agent')
export class AgentController {

  // @Post('openAIGenerate')
  // async openAIGenerate(@Body() body: WebhookRequest): Promise<WebhookResponse> {
  //   console.log('body', body)
  //   const helpSeekingMode = body.text;
  // }

  @Post('confirmParams')
  async confirmParams(@Body() body: WebhookRequest): Promise<WebhookResponse> {
    console.log('body', body)
    const helpSeekingMode = body.sessionInfo.parameters.help_seeking_mode;
    const latexEquation = body.sessionInfo.parameters.latex_equation;
    const tag = body.fulfillmentInfo.tag;

    if (tag === 'help_seeking') {
      let message = '';

      if (helpSeekingMode === 'solve') {
        message = `You want to solve/simplify this equation ${latexEquation}.`;
      } else if (helpSeekingMode === 'recommend') {
        message = `You want to look for learning resources based on this equation ${latexEquation}.`;
      }
      message += ' Is that correct?';

      const jsonResponse = {
        fulfillmentResponse: {
          messages: [
            {
              text: {
                //fulfillment text response to be sent to the agent
                text: [message],
              },
            },
            {
              payload: {
                richContent: [
                  [
                    {
                      type: WebhookResponseRichContextTypes.button,
                      text: 'Yes!',
                    },
                  ],
                  [
                    {
                      type: WebhookResponseRichContextTypes.button,
                      text: 'Nope...',
                    },
                  ],
                ],
              },
            },
          ],
        },
      };

      return jsonResponse;
    }

    throw new HttpException(
      'Make sure you have added the correct webhook tag',
      HttpStatus.BAD_REQUEST,
    );
  }

  @Post('solveProblem')
  async solve(@Body() body: WebhookRequest): Promise<WebhookResponse> {
    const mathSolverService = initService({
      youtubeAPIKey: process.env.YOUTUBE_DATA_API_KEY,
      fallbackToYoutubeVideos:
        process.env.FALLBACK_TO_YOUTUBE_SEARCH === 'true',
    });

    const latexEquation = body.sessionInfo.parameters.latex_equation as string;

    console.log('latexEquation', latexEquation);

    if (!latexEquation) {
      return {
        fulfillmentResponse: {
          messages: [
            { text: { text: ['Hmm...I might have forgotten your equation'] } },
          ],
        },
      };
    }

    const res = await mathSolverService.solveFor(
      latexEquation.replace(/\$/g, ''),
    );

    if (!res.ok) {
      throw new HttpException(
        'Failed to solve equation from MS Math Solver',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return {
      fulfillmentResponse: {
        messages: [
          {
            text: {
              text: [
                res.data?.answer?.solution &&
                  `Alrighty! I got the solution now. The answer is: ${res.data.answer.solution}`,
              ],
            },
          },
          {
            payload: {
              richContent: [
                [
                  res.data?.solveSteps?.length > 0
                    ? {
                        type: WebhookResponseRichContextTypes.description,
                        title: 'Helpful Info for Solving',
                        items: [
                          ...res.data.solveSteps.map(
                            (step, idx) => ({
                              title: `\n${idx + 1}): ${step.step}`,
                              description: `${idx === 0 ? '' : `Then you changed ${
                                step.prevExpression
                              } to ${step.expression}`}`
                            }),
                          ),
                          {
                            title: res.data.relatedConcepts.length > 0
                            ? '\nI have also found related concepts for you:'
                            : ''
                          }
                        ],
                      }
                    : null,
                  {
                    type: WebhookResponseRichContextTypes.chips,
                    options: res.data.relatedConcepts.map((cpt) => {
                      return {
                        text: cpt.name,
                        link: cpt.url,
                        image: {
                          src: {
                            rawUrl: `${getStaticImageURL('light-bulb.png')}`,
                          },
                        },
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
              ],
            },
          },
        ],
      },
      sessionInfo: {
        parameters: {
          equationResource: {
            relatedVideos: res.data.relatedVideos,
            relatedProblems: res.data.relatedProblems,
          } as IValue,
        },
      },
    };
  }

  @Post('recommendResource')
  async recommendResource(
    @Body() body: WebhookRequest,
  ): Promise<WebhookResponse> {
    const mathSolverService = initService({
      youtubeAPIKey: process.env.YOUTUBE_DATA_API_KEY,
      fallbackToYoutubeVideos:
        process.env.FALLBACK_TO_YOUTUBE_SEARCH === 'true',
    });
    // only videos and problems
    // @ts-ignore
    let solvedData = (body.sessionInfo.parameters.equationResource as Partial<SolvedResult>);
    const latexEquation = body.sessionInfo.parameters.latex_equation as string;

    if (!solvedData && !latexEquation) {
      throw new HttpException(
        'No stored equationResource or latexEquation in session',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!solvedData) {
      const res = await mathSolverService.solveFor(
        latexEquation.replace(/\$/g, ''),
      );
  
      if (!res.ok) {
        throw new HttpException(
          'Failed to solve equation from MS Math Solver',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      solvedData = {
        relatedVideos: res.data.relatedVideos,
        relatedProblems: res.data.relatedProblems,
      }
    }

    return {
      fulfillmentResponse: {
        messages: [
          {
            payload: {
              richContent: [
                [
                  {
                    type: WebhookResponseRichContextTypes.info,
                    text: "Video Recommendation",
                    items: solvedData.relatedVideos.slice(0, 3).map((vid) => {
                      const thumbnail = Array.isArray(vid.thumbnail) ? vid.thumbnail[0] : vid.thumbnail
                      return {
                          type: WebhookResponseRichContextTypes.info,
                          rawUrl: thumbnail?.thumbnailUrl,
                          title: `Video: ${vid.name}`,
                          subtitle: vid.description,
                          actionLink: vid.url,
                      }
                      ;
                    })
                  }
                ],
                [
                  {
                    type: WebhookResponseRichContextTypes.info,
                    text: "Problem Recommendation",
                    items: solvedData.relatedProblems.slice(0, 3).map((prob) => {
                      return {
                          type: WebhookResponseRichContextTypes.info,
                          title: `Pratice: ${prob.title}`,
                          subtitle: prob.snippet,
                          actionLink: prob.url
                        };
                    })
                  }
                ],
              ],
            },
          },
        ],
      },
    };
  }

  @Post('promptHelpSeekingHint')
  async promptHelpSeekingHint(
    @Body() body: WebhookRequest,
  ): Promise<WebhookResponse> {
    const helpSeekingMode = body.sessionInfo?.parameters?.help_seeking_mode;
    if (!helpSeekingMode) {
      return {
        fulfillmentResponse: {
          messages: [
            {
              payload: {
                richContent: [
                  [
                    {
                      event: {
                        languageCode: '',
                        parameters: {
                          'help_seeking.mode': 'solve',
                        },
                        name: '',
                      },
                      icon: {
                        color: '#FF9800',
                        type: 'chevron_right',
                      },
                      type: WebhookResponseRichContextTypes.button,
                      text: 'Solve/simplify an equation!',
                    },
                  ],
                  [
                    {
                      text: 'Recommend some learning resources',
                      event: {
                        parameters: {
                          'help_seeking.mode': 'recommend',
                        },
                        languageCode: '',
                        name: '',
                      },
                      type: WebhookResponseRichContextTypes.button,
                      icon: {
                        color: '#FF9800',
                        type: 'chevron_right',
                      },
                    },
                  ],
                ],
              },
            },
          ],
        },
      };
    }

    return {
      fulfillmentResponse: {
        messages: [],
      },
    };
  }
}
