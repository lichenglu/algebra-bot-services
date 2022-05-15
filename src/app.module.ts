import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MathSolverController } from './mathSolver/mathSolver.controller';
import { AgentController } from './agent/agent.controller';
import { AgentService } from './agent/agent.service';
import { ChatbotController } from './chatbot/chatbot.controller';
import { ChatbotService } from './chatbot/chatbot.service';

import { OpenAIMiddleware } from './middlewares/openai.middleware'
import { SafetyMiddleware } from './middlewares/safety.middleware'

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: [`.env.${process.env.NODE_ENV}`],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
  ],
  controllers: [AppController, MathSolverController, AgentController, ChatbotController],
  providers: [AppService, AgentService, ChatbotService],
})

export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(OpenAIMiddleware)
      .forRoutes('/agent/openAI*')
      .apply(SafetyMiddleware)
      .forRoutes('chatbot');
  }
}
