import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { initService } from 'ms-math-solver-api';

@Controller('mathSolver')
export class MathSolverController {
  @Post('solve')
  async solve(@Body() body: { latexEquation: string }): Promise<object> {
    const mathSolverService = initService({
      youtubeAPIKey: process.env.YOUTUBE_DATA_API_KEY,
      fallbackToYoutubeVideos: process.env.FALLBACK_TO_YOUTUBE_SEARCH === 'true',
    });

    const res = await mathSolverService.solveFor(body.latexEquation);
    
    if (!res.ok) {
      throw new HttpException('Forbidden', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return {
      answer: res.data.answer,
      solveSteps: res.data.solveSteps,
      altSolveSteps: res.data.alternativeSolveSteps,
      relatedConcepts: res.data.relatedConcepts,
      relatedProblems: res.data.relatedProblems,
      relatedVideos: res.data.relatedVideos,
    };
  }
}
