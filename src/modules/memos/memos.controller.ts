import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permission } from '../../common/rbac/permission.enum';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { CreateMemoDto, UpdateMemoDto } from './dto/memo.dto';
import {
  MEMO_ATTACHMENT_MAX_BYTES,
  MEMO_ATTACHMENT_MAX_FILES,
  MEMO_ATTACHMENT_MIME_TYPES,
  MemoAttachmentsService,
} from './memo-attachments.service';
import { MemosService } from './memos.service';
import { normalizeUploadMimeType } from '../../common/utils/upload-mime.util';

const memoAttachmentUploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MEMO_ATTACHMENT_MAX_BYTES },
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const normalized = normalizeUploadMimeType(
      file.mimetype,
      file.originalname,
    );

    if (!MEMO_ATTACHMENT_MIME_TYPES.has(normalized)) {
      callback(
        new BadRequestException(
          'Only JPEG, PNG, WEBP images and PDF documents are allowed',
        ),
        false,
      );
      return;
    }

    file.mimetype = normalized;
    callback(null, true);
  },
};

@Controller('memos')
export class MemosController {
  constructor(
    private readonly memosService: MemosService,
    private readonly memoAttachmentsService: MemoAttachmentsService,
  ) {}

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
    return this.memosService.findOne(
      user.institutionId!,
      user.id,
      user.role,
      id,
    );
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMemoDto) {
    return this.memosService.create(user.institutionId!, user.id, dto);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.BROADCAST_MEMO)
  @Post('publish')
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMemoDto,
    @Req() req: Request,
  ) {
    return this.memosService.publish(user.institutionId!, user.id, dto, req);
  }

  /** Multipart publish: memo JSON in `memo` field + optional `files` attachments. */
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.BROADCAST_MEMO)
  @Post('publish-with-attachments')
  @UseInterceptors(
    FilesInterceptor(
      'files',
      MEMO_ATTACHMENT_MAX_FILES,
      memoAttachmentUploadOptions,
    ),
  )
  publishWithAttachments(
    @CurrentUser() user: AuthenticatedUser,
    @Body('memo') memoJson: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Req() req: Request,
  ) {
    if (!memoJson) {
      throw new BadRequestException('memo field is required');
    }

    let dto: CreateMemoDto;
    try {
      dto = JSON.parse(memoJson) as CreateMemoDto;
    } catch {
      throw new BadRequestException('memo must be valid JSON');
    }

    return this.memosService.publishWithAttachments(
      user.institutionId!,
      user.id,
      dto,
      files,
      req,
    );
  }

  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.BROADCAST_MEMO)
  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', memoAttachmentUploadOptions))
  uploadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    return this.memoAttachmentsService.upload(
      user.institutionId!,
      id,
      user.id,
      file,
    );
  }

  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.BROADCAST_MEMO)
  @Delete(':id/attachments/:attachmentId')
  removeAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.memoAttachmentsService.remove(
      user.institutionId!,
      id,
      attachmentId,
      user.id,
    );
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMemoDto,
  ) {
    return this.memosService.update(user.institutionId!, user.id, id, dto);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.MANAGE_MEMOS)
  @Patch(':id/archive')
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.memosService.archive(user.institutionId!, user.id, id);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.MANAGE_MEMOS)
  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.memosService.remove(user.institutionId!, user.id, id);
  }

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

  @Post(':id/retry-push')
  retryPush(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.memosService.retryPushNotification(
      user.institutionId!,
      user.id,
      user.role,
      id,
    );
  }
}
