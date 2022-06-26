import {
  Controller,
  Post,
  Body,
  Sse,
  MessageEvent,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, Subject } from 'rxjs' 

import { ChatbotService } from './chatbot.service';
import { DialogflowCustomEvents } from 'src/types';

@Controller('chatbot')
export class ChatbotController {
  constructor(private chatbotService: ChatbotService) {}

  @Post('detectIntentByText')
  async solve(@Body() body: { message: string, event?: DialogflowCustomEvents, userID?: string }): Promise<object> {
    const sessionInfo = this.chatbotService.validateUserSession(body.userID)
    
    const res = await this.chatbotService.detectIntentByText({
        query: body.message,
        sessionId: sessionInfo.value,
        event: body.event,
        userID: body.userID
    })

    return res
  }

  @Sse('partialResponse')
  sse(): Observable<MessageEvent> {
    ChatbotService.partialResponseEmitter = new Subject()

    return ChatbotService.partialResponseEmitter.asObservable();
  }
}
