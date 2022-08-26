import { Injectable, MessageEvent } from '@nestjs/common';
import { SessionsClient, protos } from '@google-cloud/dialogflow-cx';
import { struct } from 'pb-util';
import dayjs from 'dayjs';
import { Subject } from 'rxjs' 

import {
  OPEN_AI_CHAT_FREEZE_TIME_IN_SECONDS,
  OPEN_AI_CHAT_FREEZE_COUNT,
} from 'src/constants';
import { SolvedResult } from 'ms-math-solver-api';

@Injectable()
export class ChatbotService {
  static userDataMap: {
    [userID: string]: {
      sessions: { timestamp: number; value: string }[];
      utteranceHistory: {
        timestamp: number;
        prompt: string;
        response: string;
        source?: 'openai' | 'dialogflow';
        [key: string]: any;
      }[];
      openAIUsage: {
        lastUpdatedAt: number;
        count: number;
      };
      currentProblem?: {
        step: number;
        maxStep: number;
        multipleChoiceSteps: {
          text: string;
          choices?: string[];
          answerIdx?: number;
        }[],
        altSolutions?: SolvedResult['alternativeSolveSteps']
      }
      latestSource?: 'openai' | 'dialogflow';
    };
  } = {};

  static partialResponseEmitter: Subject<MessageEvent>;

  sessionsClient: SessionsClient;

  constructor() {
    this.sessionsClient = new SessionsClient({
      apiEndpoint: 'us-central1-dialogflow.googleapis.com'
    });
  }

  createNewSession(userID: string) {
    return {
      timestamp: Date.now(),
      value: `${userID}_${Math.random().toString(36).substring(7)}`,
    };
  }

  validateUserSession(userID: string) {
    const userData = ChatbotService.userDataMap[userID];
    const newSession = this.createNewSession(userID);
    if (userData) {
      if (userData.sessions.length > 0) {
        const [latestSession] = userData.sessions.slice(-1);
        const diffInMins = dayjs(Date.now()).diff(
          latestSession.timestamp,
          'minute',
        );
        if (diffInMins >= 20) {
          ChatbotService.userDataMap[userID].sessions = [
            ...userData.sessions,
            newSession,
          ];
        }
      }
    } else {
      ChatbotService.userDataMap[userID] = {
        sessions: [newSession],
        utteranceHistory: [],
        openAIUsage: {
          lastUpdatedAt: Date.now(),
          count: 0,
        },
      };
    }

    const [latestSession] =
      ChatbotService.userDataMap[userID].sessions.slice(-1);
    return latestSession;
  }

  validateOpenAICall(userID: string) {
    if (!userID) {
      return false
    }
    
    if (
      ChatbotService.userDataMap[userID].openAIUsage.count >=
      OPEN_AI_CHAT_FREEZE_COUNT
    ) {
      if (
        dayjs(Date.now()).diff(
          ChatbotService.userDataMap[userID].openAIUsage.lastUpdatedAt,
          'seconds',
        ) >= OPEN_AI_CHAT_FREEZE_TIME_IN_SECONDS
      ) {
        ChatbotService.userDataMap[userID].openAIUsage = {
          count: 0,
          lastUpdatedAt: Date.now(),
        };
        return true;
      }
      return false;
    }

    return true;
  }

  getSessionPath(sessionId: string) {
    return this.sessionsClient.projectLocationAgentSessionPath(
      process.env.AGENT_PRJECT_ID,
      'us-central1',
      process.env.AGENT_ID,
      sessionId,
    );
  }

  getPagePath(flowId: string, pageId: string) {
    return this.sessionsClient.pagePath(
      process.env.AGENT_PRJECT_ID,
      'us-central1',
      process.env.AGENT_ID,
      flowId,
      pageId
    );
  }

  recordChat(
    userID: string,
    query: string,
    response: protos.google.cloud.dialogflow.cx.v3.IDetectIntentResponse,
  ) {
    ChatbotService.userDataMap[userID].utteranceHistory =
      ChatbotService.userDataMap[userID].utteranceHistory ?? [];

    const responseText =
      response.queryResult?.responseMessages?.[0]?.text?.text?.[0];

    ChatbotService.userDataMap[userID].utteranceHistory = [
      ...ChatbotService.userDataMap[userID].utteranceHistory,
      {
        prompt: query,
        response: responseText ?? '',
        timestamp: Date.now(),
      },
    ];
  }

  recordOpenAIChat(userID: string, query: string, response: string) {
    ChatbotService.userDataMap[userID].utteranceHistory =
      ChatbotService.userDataMap[userID].utteranceHistory ?? [];

    ChatbotService.userDataMap[userID].utteranceHistory = [
      ...ChatbotService.userDataMap[userID].utteranceHistory,
      {
        prompt: query,
        response,
        timestamp: Date.now(),
        source: 'openai',
      },
    ];

    const usage = ChatbotService.userDataMap[userID].openAIUsage;

    if (ChatbotService.userDataMap[userID].latestSource === 'openai') {
      ChatbotService.userDataMap[userID].openAIUsage = {
        lastUpdatedAt: Date.now(),
        count: usage.count + 1,
      };
    }

    console.log('userDataMap', ChatbotService.userDataMap[userID])
  }

  async detectIntentByText({
    sessionId,
    query,
    languageCode = 'en',
    event,
    userID,
  }: {
    sessionId: string;
    query: string;
    languageCode?: string;
    event?: string;
    userID?: string;
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
      queryParams: {
        parameters: struct.encode({
          userID,
        }),
      },
    };

    if (event) {
      // @ts-ignore
      request.queryInput.event = {
        event,
      };
    }

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

    response.queryResult.diagnosticInfo = struct.decode(
      // @ts-ignore
      response.queryResult.diagnosticInfo,
    );

    // by default, I use sys.no-match-1 as the triggering event
    // for openai calls
    ChatbotService.userDataMap[userID].latestSource =
      response.queryResult?.match?.event === 'sys.no-match-1'
        ? 'openai'
        : 'dialogflow';

    return response;
  }
}
