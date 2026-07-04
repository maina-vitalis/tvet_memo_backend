import { Module } from '@nestjs/common';
import { MemosController } from './memos.controller';
import { MemoTargetingService } from './memo-targeting.service';
import { MemosService } from './memos.service';

@Module({
  controllers: [MemosController],
  providers: [MemosService, MemoTargetingService],
  exports: [MemosService, MemoTargetingService],
})
export class MemosModule {}