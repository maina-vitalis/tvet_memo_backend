import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
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
import { ROLE_RANK } from '../../common/rbac/role-rank';
import { Role } from '../../common/rbac/role.enum';
import { canAssignRole } from '../../common/rbac/can-assign-role';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(PermissionsGuard, TenantScopeGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** [RBAC] Returns roles the actor may assign (fixed enum, filtered by ceiling). */
  @Get('assignable-roles')
  @RequirePermissions(Permission.MANAGE_ROLES)
  listAssignableRoles(@CurrentUser() user: AuthenticatedUser) {
    return Object.values(Role)
      .filter((r) => r !== Role.SUPER_ADMIN && canAssignRole(user, r))
      .map((role) => ({ role, rank: ROLE_RANK[role] }))
      .sort((a, b) => b.rank - a.rank);
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