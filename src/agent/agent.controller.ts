import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express'
import { HttpService } from '@nestjs/axios'
import { initService, SolvedResult } from 'ms_math_solver_api';
import dayjs from 'dayjs';
import { tap, retry } from 'rxjs/operators';

import {
  WebhookRequest,
  WebhookResponse,
  WebhookResponseRichContextTypes,
  HelpSeekingModes,
  HelpSeekingParams,
  PineconeSearchResponse
} from 'src/types';
import { getStaticImageURL } from 'src/utils';
import { OPEN_AI_CHAT_FREEZE_TIME_IN_SECONDS } from 'src/constants';
import { AgentService } from './agent.service';
import { ChatbotService } from 'src/chatbot/chatbot.service';

@Controller('agent')
export class AgentController {
  constructor(
    private agentService: AgentService,
    private chatbotService: ChatbotService,
    private httpService: HttpService
  ) {}

  @Post('searchANVideos')
  async searchANVideos(@Body() body: WebhookRequest): Promise<WebhookResponse> {
    const userID = body.sessionInfo.parameters.userID as string | undefined;
    ChatbotService.partialResponseEmitter?.next({ 
      data: {
        response: this.agentService.insertText('Great! Working on it. This can take some time').getFullRes(),
        userID
      }
    })

    const prompt = body.text;
    const HF_API_TOKEN = process.env.HUGGINGFACE_API_KEY;
    const model = "flax-sentence-embeddings/all_datasets_v3_mpnet-base"
    
    const encodingResponse = await this.httpService.post<number[][]>(
      // https://discuss.huggingface.co/t/can-one-get-an-embeddings-from-an-inference-api-that-computes-sentence-similarity/9433
      `https://api-inference.huggingface.co/pipeline/feature-extraction/${model}`,
      { 
        inputs: [prompt],
        options: {
          wait_for_model: true
        }
      },
      {
        headers: {
          Authorization: `Bearer ${HF_API_TOKEN}`
        }, 
      }
    )
      // .pipe(
      //   tap({ error: err => console.log('error: ', err.message) }),
      //   retry({
      //     count: 2,
      //     delay: 1000 * 10
      //   }),
      // )
      .toPromise()

    const response = await this.httpService.post<PineconeSearchResponse>(
      `https://keyword-search-39d8ed5.svc.us-west1-gcp.pinecone.io/query`,
      { 
        vector: encodingResponse.data[0],
        topK: 5,
        includeMetadata: true,
        includeValues: false,
        namespace: ""
      },
      {
        headers: {
          "Api-Key": process.env.PINECONE_API_KEY
        }, 
      }
    ).toPromise()

    // @ts-ignore
    return this.agentService
      .insertText('You might find the following videos in Math Nation useful!')
      .insertRichContent([
        [
          {
            type: WebhookResponseRichContextTypes.search,
            options: response.data.matches
          }
        ]
      ])
      .getRes();
  }

  @Post('openAIGenerate')
  async openAIGenerate(@Body() body: WebhookRequest): Promise<WebhookResponse> {
    const prompt = body.text;
    const userID = body.sessionInfo.parameters.userID as string | undefined;

    if (!prompt) {
      return this.agentService
        .insertText(
          `Oops...it seems that you did not type anything. I don't know how to response :(`,
        )
        .getRes();
    }

    if (!this.chatbotService.validateOpenAICall(userID)) {
      return this.agentService
        .insertText(
          `Alright! It was great chitchating with you, but let's focus on your Algebra learning. We can catch up after ${(
            // 300 seconds minus passed seconds
            (OPEN_AI_CHAT_FREEZE_TIME_IN_SECONDS -
              dayjs(Date.now()).diff(
                ChatbotService.userDataMap[userID]?.openAIUsage.lastUpdatedAt,
                'seconds',
              )) /
            60
          ).toFixed(2)} minutes`,
        )
        .insertRichContent([
          [
            {
              type: WebhookResponseRichContextTypes.image,
              rawUrl: 'https://media3.giphy.com/media/QPQ3xlJhqR1BXl89RG/giphy.gif?cid=ecf05e479rr2jjbwwk5l7hcxnbkwj69no9h7fombqm2nfbnn&rid=giphy.gif&ct=g'
            }
          ]
        ])
        .getRes();
    }

    const userProfile = {
      careerGoal: ['Any job'],
      musicGenre: ['Blues', 'Funk', 'Groovy'],
      favoirteSingers: ['John Mayer', 'Stevie Wonder'],
      favoriteHolidays: ['Chinese New Year'],
      favoriteBooks: ['Alice in Wonderland'],
      favoriteSubjects: ['math'],
    };

    const background = `
    My name is Joi, a female African-American living in Austin, Texas.
    I am a ${userProfile.careerGoal.join(
      ', ',
    )} with a doctor degree from University of Florida. 
    I love ${userProfile.musicGenre.join(
      ', ',
    )} music (${userProfile.favoirteSingers.join(', ')}).
    I enjoy reading books such as ${userProfile.favoriteBooks.join(', ')}.
    Back in school, I'm best at ${userProfile.favoriteSubjects.join(', ')}.
    `.replace(/(\r\n|\n|\r)/gm, ' ');

    const history = userID
      ? ChatbotService.userDataMap[userID]?.utteranceHistory
          // only keep history with openai response
          ?.filter((history) => history.source === 'openai')
          // last for utterances
          .slice(-4)
          .map((history) => `You: ${history.prompt}\nMe: ${history.response}`)
          .join('\n')
      : '';

    console.log('history', history);

    const response = await this.agentService.openai.createCompletion(
      'text-davinci-002',
      {
        prompt: `${background}\n\n${history}You: ${prompt}\nMe: `,
        temperature: 0.5,
        max_tokens: 64,
        top_p: 1.0,
        frequency_penalty: 0.5,
        presence_penalty: 0.0,
        stop: 'You:',
      },
    );

    response.data.choices.map((c) => console.log(c));

    const generatedText = response.data.choices[0]?.text ?? null;

    this.chatbotService.recordOpenAIChat(userID, prompt, generatedText);

    return this.agentService.insertText(generatedText).getRes();
  }

  @Post('openAISummarize')
  async openAISummarize(
    @Body() body: WebhookRequest,
  ): Promise<WebhookResponse> {
    let prompt = 'Summarize this for a second-grade student:';
    const passageForSummarization = body.sessionInfo.parameters.passage as
      | string
      | undefined;

    if (!passageForSummarization) {
      throw new HttpException(
        'Make sure you have passed a passage for summarization',
        HttpStatus.BAD_REQUEST,
      );
    }

    const match = passageForSummarization.match(/\{\{(.+)\}\}/);
    if (!match) {
      throw new HttpException(
        'Make sure the passage has been wrapped with {{}}',
        HttpStatus.BAD_REQUEST,
      );
    }

    prompt = `${prompt}\n\n${match[1]}`;

    const response = await this.agentService.openai.createCompletion(
      'text-davinci-002',
      {
        prompt,
        temperature: 0.7,
        max_tokens: 64,
        top_p: 1.0,
        frequency_penalty: 0.0,
        presence_penalty: 0.0,
      },
    );

    response.data.choices.map((c) => console.log(c));

    const summary = response.data.choices[0]?.text ?? null;

    return this.agentService
      .insertText(summary)
      .insertParamInfo({
        summary,
      })
      .getRes();
  }

  @Post('clearParams')
  async clearParams(@Body() body: WebhookRequest): Promise<WebhookResponse> {
    const tags = body.fulfillmentInfo.tag.split(',');
    const currentParams = body.sessionInfo.parameters

    const newParams = tags.reduce((obj, tag) => {
      obj[tag.trim()] = null;
      return obj;
    }, currentParams ?? {})

    console.log(newParams)
    
    return this.agentService
      .insertParamInfo(newParams)
      .getRes();
  }

  // it seems that entities in long texts cannot be recognized
  @Post('extractParams')
  async extractParams(@Body() body: WebhookRequest): Promise<WebhookResponse> {
    const tag = body.fulfillmentInfo.tag;
    const query = body.text;
    let value = null;

    if (tag === HelpSeekingParams.passageForSummarization) {
      const match = query.match(/\{\{(.+)\}\}/);
      if (match) {
        value = match[0];
      }
    }

    if (!value) {
      return this.agentService.getRes();
    }

    return this.agentService
      .insertParamInfo({
        [tag]: value,
      })
      .getRes();
  }

  @Post('confirmParams')
  async confirmParams(@Body() body: WebhookRequest): Promise<WebhookResponse> {
    const helpSeekingMode = body.sessionInfo.parameters.help_seeking_mode;
    const latexEquation = body.sessionInfo.parameters.latex_equation;
    const passageForSummarization = body.sessionInfo.parameters.passage as
      | string
      | undefined;
    const tag = body.fulfillmentInfo.tag;

    if (tag === 'help_seeking') {
      let message = '';

      if (helpSeekingMode === HelpSeekingModes.solve) {
        message = `You want to solve/simplify this equation ${latexEquation}.`;
      } else if (helpSeekingMode === HelpSeekingModes.recommend) {
        message = `You want to look for learning resources based on this equation ${latexEquation}.`;
      } else if (
        passageForSummarization &&
        helpSeekingMode === HelpSeekingModes.summarize
      ) {
        message = `You want to summarize this ${passageForSummarization.slice(
          0,
          60,
        )}`;
        if (passageForSummarization.length >= 70) {
          message += `...[Truncated for display]`;
        }
      }

      message += ' Is that correct?';

      return this.agentService
        .insertText(message)
        .insertRichContent([
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
        ])
        .getRes();
    }

    throw new HttpException(
      'Make sure you have added the correct webhook tag',
      HttpStatus.BAD_REQUEST,
    );
  }

  @Post('solveProblem')
  async solve(@Body() body: WebhookRequest): Promise<WebhookResponse> {
    const userID = body.sessionInfo.parameters.userID as string | undefined;
    ChatbotService.partialResponseEmitter?.next({ 
      data: {
        response: this.agentService.insertText('Great! Working on it. This can take several seconds').getFullRes(),
        userID
      }
    })

    const mathSolverService = initService({
      youtubeAPIKey: process.env.YOUTUBE_DATA_API_KEY,
      fallbackToYoutubeVideos:
        process.env.FALLBACK_TO_YOUTUBE_SEARCH === 'true',
    });

    const latexEquation = body.sessionInfo.parameters.latex_equation as string;

    console.log('latexEquation', latexEquation);

    if (!latexEquation) {
      return this.agentService
        .insertText('Hmm...I might have forgotten your equation')
        .getRes();
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

    return this.agentService.getSolveInfo(res.data);
  }

  @Post('recommendResource')
  async recommendResource(
    @Body() body: WebhookRequest
  ): Promise<WebhookResponse> {
    const userID = body.sessionInfo.parameters.userID as string | undefined;

    ChatbotService.partialResponseEmitter?.next({ 
      data: {
        response: this.agentService.insertText('Processing! This can take some time').getFullRes(),
        userID
      }
    })

    const mathSolverService = initService({
      youtubeAPIKey: process.env.YOUTUBE_DATA_API_KEY,
      fallbackToYoutubeVideos:
        process.env.FALLBACK_TO_YOUTUBE_SEARCH === 'true',
    });
    // only videos and problems
    // @ts-ignore
    let solvedData = body.sessionInfo.parameters
      .equationResource as Partial<SolvedResult>;
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
      };
    }

    return this.agentService.getResourceRecommendation(solvedData);
  }

  @Post('promptHelpSeekingHint')
  async promptHelpSeekingHint(
    @Body() body: WebhookRequest,
  ): Promise<WebhookResponse> {
    const helpSeekingMode = body.sessionInfo?.parameters?.help_seeking_mode;
    console.log('helpSeekingMode', helpSeekingMode);
    if (!helpSeekingMode) {
      return this.agentService.getHelpSeekingPrompt();
    }

    return this.agentService.getRes();
  }
}
