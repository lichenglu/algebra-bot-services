import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MathSolverController } from './mathSolver/mathSolver.controller';
import { AgentController } from './agent/agent.controller';
import { ChatbotController } from './chatbot/chatbot.controller';
import { ChatbotService } from './chatbot/chatbot.service';

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
  providers: [AppService, ChatbotService],
})
export class AppModule {}
