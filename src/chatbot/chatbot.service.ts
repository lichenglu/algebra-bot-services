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
      apiEndpoint: 'us-central1-dialogflow.googleapis.com',
      // project_id: "perspective-api-332000",
      // private_key_id: "317421eddc0e91859e9875f56a7914a22f47885f",
      // private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQClF+P7DxfdlStF\nVPCM/u4+oiYGwORLutvd4UwPkrsJQbsaygDtpgA4/KBu8xYgiH81kKD30g6ODOty\nWD5rS4atbHRFVjbvVtjw+EUHTZDNaXU/nr13Mt/tHnPY52vvcvGnjeSHu/6knuPa\nK8R/RolSs5trwa371xg2vN467Aa+Hgm0dbqzyPWl+H2fB0midfWsKF9LhMy/Eo7/\nR+6CTeMyRanC2BzZ3QFD4Y8uPo4i08T0tGD6Ekydn+1h+knSd8FMhnbhp5+3PEJc\npgKB49jwfnDP9m62xetrF+JwHe3qlBSswhUWTpiNcGvYcHR8j7k0OtiAXtSTUZOh\nOxt778PxAgMBAAECggEAAhP0QlVwXvXfbcS1qVfkYK65jZC7WYwwtsk/8zCcV6CC\nMbxKuu/4i12N4lhg4Mza1BXW6Zec2Kq5fJik7sSN5rYwS8qk46cFl2KrQOWioSj2\nGSU1FW4Rnfz5HKRv5kegi0ScGqOjkWrS17F0nrg/fZ00NanWAS1/HMl0HZEfkvvP\nO3h6Imybi/x+Jxu3N4xkSMrUtYUUBZ3zBDfTIPFbwLXErpKmtSFHuCrvKa3W7TRH\nxvOTiviFChMKUFnIgG8J0X/VaCo33BEFFWrIP9iOs3FRcSPE6N2S3SrmkxSJ79bo\nqUSfA/jQlVTJERCioCJzM6U7QSBMnYsL70HDKWMIewKBgQDeSud/vhQ+8AiJtmda\nea33LbkbCt0KpVQDbt7fALsBLjLin/nl7JpD9e+e08TFj30+zYja66Ne9piNlwZw\nEWQfDlORegn1KzKSWgheqfTef2oPnbGxyGuNyZOeCy6WIWiQVTxc3I+eVVB7fTYa\nGHKoMsar2yEW8iixgnBnjfkcgwKBgQC+IJai3kX+ugD+VyoG11NVRITdayheoA9Z\nb3HQCcxctSohv3m64pgu/yKziNAYCmF88MlQq1iw5CKdtDzKi9yd15Eha6nOdYIu\nd4pRNPUYyCnHG2KRW/o6I7MISe3WbF9FXDr2or2V+7qcyyn01LtIpYP5XxX+M4Mm\nUUA5bcnbewKBgH4ZbbN4Z1HApodAcubPKdGTHXNquTOFz9/WsBU++9ZSl8kZSRCW\nJHiy9chah0AvArRysdTGYTnIl4eSibNfGjXH0b4vxaBPbfO5oQ/aR69EBi1vnlKk\nx+Z52ASKgVXnA8MEpyZidBI0gWBcCinJfplNnIf22ZGDs3Pm8866qfrzAoGBAIWV\nJAFeplMooNYSq+aOl3BLagaf6YdCckZmNNL0b2+bofSAMakK1939SIZX081wTbqY\n+vkAypnOUDv5jNTKm8ES2lde67mxejvnpXkU+jflOuU36nMy6oa62mkyeDa1geKb\nwJnVEds1OJI9dEceyE9sa2NkWXF3A+iCIdu3taHNAoGAA9xhYxnPUgMLKwVGJMyF\nzx4aTwTIQaO4kBFvTnDoY+sNYuYCfftj3FhxvWJ+5gtcb2ebBaZ/It8zi2QmmBCR\n/SjG/QNFuD+tc21NHLmV/JxuPhP07bsXRHNMx/UxeK78zdJJ/NXGMcU6PTOOwceO\n2Zp1dr+g/CuEjONFVZQzzFA=\n-----END PRIVATE KEY-----\n",
      // client_email: "dialogflow-client@perspective-api-332000.iam.gserviceaccount.com",
      // client_id: "117928407313755706116",
      // auth_uri: "https://accounts.google.com/o/oauth2/auth",
      // token_uri: "https://oauth2.googleapis.com/token",
      // auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      // client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/dialogflow-client%40perspective-api-332000.iam.gserviceaccount.com"
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
