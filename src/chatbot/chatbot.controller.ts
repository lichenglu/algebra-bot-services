import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { SessionsClient } from '@google-cloud/dialogflow-cx';

import { ChatbotService } from './chatbot.service';
import { DialogflowCustomEvents } from 'src/types';

@Controller('chatbot')
export class ChatbotController {
  constructor(private chatbotService: ChatbotService) {}

  @Post('detectIntentByText')
  async solve(@Body() body: { message: string, event?: DialogflowCustomEvents }): Promise<object> {
    const res = await this.chatbotService.detectIntentByText({
        query: body.message,
        // TODO: Change this to user id
        // sessionId: Math.random().toString(36).substring(7),
        sessionId: 's1c1asdasa23',
        event: body.event
    })

    return res
  }
}
