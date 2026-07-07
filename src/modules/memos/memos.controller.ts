import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permission } from '../../common/rbac/permission.enum';
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
    return this.memosService.findSent(user.institutionId!, user.id);
  }

  @Get('inbox')
  findInbox(@CurrentUser() user: AuthenticatedUser) {
    return this.memosService.findInbox(user.institutionId!, user.id);
  }

  @Get('targetable-users')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.BROADCAST_MEMO)
  findTargetableUsers(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') query?: string,
  ) {
    return this.memosService.findTargetableUsers(
      user.institutionId!,
      user,
      query,
    );
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.memosService.findOne(user.institutionId!, id);
  }

  // Creating a memo draft is relatively open
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMemoDto) {
    return this.memosService.create(user.institutionId!, user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMemoDto,
  ) {
    return this.memosService.update(user.institutionId!, user.id, id, dto);
  }

  // Sending requires explicit permission
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.BROADCAST_MEMO)
  @Post(':id/send')
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.memosService.send(user.institutionId!, user.id, id, req);
  }

  @Post(':id/read')
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.memosService.markRead(user.institutionId!, user.id, id);
  }

  @Post(':id/acknowledge')
  acknowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcknowledgeMemoDto,
  ) {
    return this.memosService.acknowledge(user.institutionId!, user.id, id, dto);
  }
}
