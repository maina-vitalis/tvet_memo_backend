import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import {
  AcknowledgeMemoDto,
  CreateMemoDto,
  UpdateMemoDto,
} from './dto/memo.dto';
import { MemosService } from './memos.service';

@Controller('memos')
export class MemosController {
  constructor(private readonly memosService: MemosService) {}

  @Get('sent')
  findSent(@CurrentUser() user: AuthenticatedUser) {
    return this.memosService.findSent(user.institutionId, user.id);
  }

  @Get('inbox')
  findInbox(@CurrentUser() user: AuthenticatedUser) {
    return this.memosService.findInbox(user.institutionId, user.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.memosService.findOne(user.institutionId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMemoDto) {
    return this.memosService.create(user.institutionId, user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateMemoDto,
  ) {
    return this.memosService.update(user.institutionId, user.id, id, dto);
  }

  @Post(':id/send')
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.memosService.send(user.institutionId, user.id, id, req);
  }

  @Post(':id/read')
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.memosService.markRead(user.institutionId, user.id, id);
  }

  @Post(':id/acknowledge')
  acknowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AcknowledgeMemoDto,
  ) {
    return this.memosService.acknowledge(user.institutionId, user.id, id, dto);
  }
}
