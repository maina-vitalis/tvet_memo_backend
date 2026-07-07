import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantScopeGuard } from '../../common/guards/tenant-scope.guard';
import { Permission } from '../../common/rbac/permission.enum';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { BulkUploadService } from './bulk-upload.service';

const ALLOWED_SPREADSHEET_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);
const ALLOWED_SPREADSHEET_EXTENSION = /\.(xlsx|xls)$/i;

/** Kept under the `/users` prefix so the frontend's existing endpoint (`POST /users/bulk-upload`) is unaffected. */
@Controller('users')
@UseGuards(PermissionsGuard, TenantScopeGuard)
export class BulkUploadController {
  constructor(private readonly bulkUploadService: BulkUploadService) {}

  @Post('bulk-upload')
  @RequirePermissions(Permission.PROVISION_USERS_BULK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, callback) => {
        const isAllowed =
          ALLOWED_SPREADSHEET_MIME_TYPES.has(file.mimetype) ||
          ALLOWED_SPREADSHEET_EXTENSION.test(file.originalname);

        if (!isAllowed) {
          callback(
            new BadRequestException('Only .xlsx or .xls files are allowed'),
            false,
          );
          return;
        }

        callback(null, true);
      },
    }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.bulkUploadService.upload(
      user.institutionId!,
      user,
      file.buffer,
    );
  }
}
