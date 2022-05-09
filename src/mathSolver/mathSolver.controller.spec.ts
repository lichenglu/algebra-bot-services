import { Test, TestingModule } from '@nestjs/testing';
import { MathSolverController } from './mathSolver.controller';

describe('MathSolverController', () => {
  let controller: MathSolverController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MathSolverController],
    }).compile();

    controller = module.get<MathSolverController>(MathSolverController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
