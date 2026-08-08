import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedService } from './seed.service';
import { UsersModule } from '../users/users.module';
import { ExercisesModule } from '../exercises/exercises.module';
import { WorkoutSet } from '../workouts/workout-set.entity';

@Module({
  imports: [UsersModule, ExercisesModule, TypeOrmModule.forFeature([WorkoutSet])],
  providers: [SeedService],
})
export class SeedModule {}
