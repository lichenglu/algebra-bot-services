import { Injectable } from '@nestjs/common';
import { SessionsClient } from '@google-cloud/dialogflow-cx';
import { struct } from 'pb-util';

@Injectable()
export class ChatbotService {
  sessionsClient: SessionsClient;

  constructor() {
    this.sessionsClient = new SessionsClient({
      apiEndpoint: 'us-central1-dialogflow.googleapis.com',
    });
  }

  getSessionPath(sessionId: string) {
    return this.sessionsClient.projectLocationAgentSessionPath(
      process.env.AGENT_PRJECT_ID,
      'us-central1',
      process.env.AGENT_ID,
      sessionId,
    );
  }

  async detectIntentByText({
    sessionId,
    query,
    languageCode = 'en',
  }: {
    sessionId: string;
    query: string;
    languageCode?: string;
  }) {
    const sessionPath = this.getSessionPath(sessionId);

    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: query,
        },
        languageCode,
      },
    };

    const [response] = await this.sessionsClient.detectIntent(request);

    response.queryResult.responseMessages =
      response.queryResult.responseMessages.map((msg) => {
        if (msg.payload) {
          // @ts-ignore
          msg.payload = struct.decode(msg.payload);
          return msg;
        }
        return msg;
      });

    return response;
  }
}
