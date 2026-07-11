import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateUserRoleDto,
} from './dto/user.dto';
import { ProvisionUserDto } from './dto/provision-user.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import {
  DeactivatePushTokenDto,
  RegisterPushTokenDto,
} from './dto/register-push-token.dto';
import { ROLE_RANK } from '../../common/rbac/role-rank';
import { Role } from '../../common/rbac/role.enum';
import { canAssignRole } from '../../common/rbac/can-assign-role';
import { UsersService } from './users.service';

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

@Controller('users')
@UseGuards(PermissionsGuard, TenantScopeGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** [SELF-SERVICE] Edit own profile (name/phone/avatar) in a single request. */
  @Patch('me')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, callback) => {
        if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
          callback(
            new BadRequestException(
              'Only JPEG, PNG, or WEBP images are allowed',
            ),
            false,
          );
          return;
        }

        callback(null, true);
      },
    }),
  )
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMyProfileDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.usersService.updateMyProfile(user.id, dto, file);
  }

  /** [RBAC] Returns roles the actor may assign (fixed enum, filtered by ceiling). */
  @Get('assignable-roles')
  @RequirePermissions(Permission.MANAGE_ROLES)
  listAssignableRoles(@CurrentUser() user: AuthenticatedUser) {
    return Object.values(Role)
      .filter((r) => r !== Role.SUPER_ADMIN && canAssignRole(user, r))
      .map((role) => ({ role, rank: ROLE_RANK[role] }))
      .sort((a, b) => b.rank - a.rank);
  }

  @Patch('me/push-token')
  registerPushToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterPushTokenDto,
  ) {
    return this.usersService.upsertPushToken(user.id, dto);
  }

  @Delete('me/push-token')
  deactivatePushToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeactivatePushTokenDto,
  ) {
    return this.usersService.deactivatePushToken(user.id, dto.token);
  }

  @Get()
  @RequirePermissions(Permission.MANAGE_TENANT_USERS)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findAll(user.institutionId!);
  }

  @Get(':id')
  @RequirePermissions(Permission.MANAGE_TENANT_USERS)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.findOne(user.institutionId!, id);
  }

  @Post()
  @RequirePermissions(Permission.MANAGE_TENANT_USERS)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.usersService.create(user.institutionId!, user, dto);
  }

  @Post('provision')
  @RequirePermissions(Permission.MANAGE_TENANT_USERS)
  provision(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ProvisionUserDto,
  ) {
    return this.usersService.provision(user.institutionId!, user, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.MANAGE_TENANT_USERS)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(user.institutionId!, user, id, dto);
  }

  /** [RBAC] Role update — ceiling enforced in service via canAssignRole(). */
  @Patch(':id/role')
  @RequirePermissions(Permission.MANAGE_ROLES)
  updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.usersService.updateRole(user.institutionId!, user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.MANAGE_TENANT_USERS)
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.deactivate(user.institutionId!, user, id);
  }
}
