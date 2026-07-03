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
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { ProvisionUserDto } from './dto/provision-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findAll(user.institutionId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.findOne(user.institutionId, id);
  }

  // Only users with permission can create/provision other users
  @UseGuards(PermissionsGuard)
  @RequirePermission('tenant.users.create', 'tenant.users.manage')
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.usersService.create(user.institutionId, user.id, dto);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermission('tenant.users.create')
  @Post('provision')
  provision(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ProvisionUserDto,
  ) {
    return this.usersService.provision(user.institutionId, user.id, dto);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermission('tenant.users.manage')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(user.institutionId, user.id, id, dto);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermission('tenant.users.manage')
  @Delete(':id')
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.deactivate(user.institutionId, user.id, id);
  }
}
