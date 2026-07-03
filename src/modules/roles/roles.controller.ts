import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { RolesService } from './roles.service';
import { permissions } from '../../database/schema';
import { Inject } from '@nestjs/common';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { eq } from 'drizzle-orm';

@Controller('roles')
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.rolesService.findAll(user.institutionId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.rolesService.findOne(user.institutionId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRoleDto) {
    return this.rolesService.create(user.institutionId, user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.update(user.institutionId, user.id, id, dto);
  }

  @Delete(':id')
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.rolesService.deactivate(user.institutionId, id);
  }

  /**
   * [RBAC] List available tenant permissions for this institution's role editor.
   * Super admins may want a different endpoint for platform permissions.
   */
  @Get('permissions/available')
  async listAvailablePermissions(@CurrentUser() user: AuthenticatedUser) {
    // For tenant side, return non-platform permissions
    // In real impl you might filter by category
    return this.db
      .select()
      .from(permissions)
      .where(eq(permissions.isActive, true));
  }
}
