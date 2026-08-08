import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExercisePlan } from './exercise-plan.entity';
import { UserPlan } from './user-plan.entity';
import { ExercisesService } from './exercises.service';
import { CatalogService } from './catalog.service';
import { ExercisesController } from './exercises.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ExercisePlan, UserPlan])],
  providers: [ExercisesService, CatalogService],
  controllers: [ExercisesController],
  exports: [ExercisesService, CatalogService],
})
export class ExercisesModule {}
