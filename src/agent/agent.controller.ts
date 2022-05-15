import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { initService, SolvedResult } from 'ms_math_solver_api';
import { Configuration, OpenAIApi } from 'openai'

import {
  WebhookRequest,
  WebhookResponse,
  WebhookResponseRichContextTypes,
  HelpSeekingModes,
  HelpSeekingParams
} from 'src/types';
import { getStaticImageURL } from 'src/utils';
import { AgentService } from './agent.service';

@Controller('agent')
export class AgentController {
  constructor(private agentService: AgentService) {}

  // @Post('openAIGenerate')
  // async openAIGenerate(@Body() body: WebhookRequest): Promise<WebhookResponse> {
  //   console.log('body', body)
  //   const helpSeekingMode = body.text;
  // }

  @Post('openAISummarize')
  async openAISummarize(@Body() body: WebhookRequest): Promise<WebhookResponse> {
    let prompt = "Summarize this for a second-grade student:"
    const passageForSummarization = body.sessionInfo.parameters.passage as string | undefined;
    
    if (!passageForSummarization) {
      throw new HttpException(
        'Make sure you have passed a passage for summarization',
        HttpStatus.BAD_REQUEST,
      );
    }
    
    const match = passageForSummarization.match(/\{\{(.+)\}\}/)
    if (!match) {
      throw new HttpException(
        'Make sure the passage has been wrapped with {{}}',
        HttpStatus.BAD_REQUEST,
      );
    }

    prompt = `${passageForSummarization}\n\n${match[1]}`
    const response = await this.agentService.openai.createCompletion("text-davinci-002", {
      prompt,
      temperature: 0.7,
      max_tokens: 128,
      top_p: 1.0,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
    });

    response.data.choices.map(c => console.log(c))

    return this.agentService.insertText(response.data.choices[0]?.text ?? "Failed").getRes()
  }

  @Post('clearParams')
  async clearParams(@Body() body: WebhookRequest): Promise<WebhookResponse> {
    const tags = body.fulfillmentInfo.tag.split(',');

    return this.agentService
      .insertParamInfo(
        tags.reduce((obj, tag) => {
          obj[tag.trim()] = null;
          return obj;
        }, {}),
      )
      .getRes();
  }

  // it seems that entities in long texts cannot be recognized
  @Post('extractParams')
  async extractParams(@Body() body: WebhookRequest): Promise<WebhookResponse> {
    const tag = body.fulfillmentInfo.tag
    const query = body.text
    let value = null;

    if (tag === HelpSeekingParams.passageForSummarization) {
      const match = query.match(/\{\{(.+)\}\}/)
      if (match) {
        value = match[0]
      }
    }

    if (!value) {
      return this.agentService.getRes()  
    }

    return this.agentService
      .insertParamInfo({
        [tag]: value
      })
      .getRes();
  }

  @Post('confirmParams')
  async confirmParams(@Body() body: WebhookRequest): Promise<WebhookResponse> {
    const helpSeekingMode = body.sessionInfo.parameters.help_seeking_mode;
    const latexEquation = body.sessionInfo.parameters.latex_equation;
    const passageForSummarization = body.sessionInfo.parameters.passage as string | undefined;
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
    @Body() body: WebhookRequest,
  ): Promise<WebhookResponse> {
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
