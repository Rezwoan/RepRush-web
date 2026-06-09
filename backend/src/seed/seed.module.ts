import { Module } from '@nestjs/common';
import { SeedService } from './seed.service';
import { UsersModule } from '../users/users.module';
import { ExercisesModule } from '../exercises/exercises.module';

@Module({
  imports: [UsersModule, ExercisesModule],
  providers: [SeedService],
})
export class SeedModule {}
