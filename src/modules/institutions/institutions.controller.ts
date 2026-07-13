import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permission } from '../../common/rbac/permission.enum';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { DiscoverInstitutionDto } from './dto/discover-institution.dto';
import { UpdateInstitutionDto } from './dto/institution.dto';
import { InstitutionsService } from './institutions.service';

@UseGuards(PermissionsGuard)
@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly institutionsService: InstitutionsService) {}

  @Public()
  @Post('discover')
  discover(@Body() dto: DiscoverInstitutionDto) {
    return this.institutionsService.discover(dto);
  }

  @Public()
  @Get('subdomain/:subdomain')
  findBySubdomain(@Param('subdomain') subdomain: string) {
    return this.institutionsService.findBySubdomain(subdomain);
  }

  /** [RBAC] Members can only view their own institution's profile. */
  @Get(':id')
  findById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.institutionId !== id) {
      throw new ForbiddenException('You can only view your own institution');
    }

    return this.institutionsService.findById(id);
  }

  /** [RBAC] Institution admins can only edit their own institution's profile. */
  @Patch(':id')
  @RequirePermissions(Permission.MANAGE_OWN_INSTITUTION)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateInstitutionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.institutionId !== id) {
      throw new ForbiddenException('You can only update your own institution');
    }

    return this.institutionsService.update(id, dto);
  }
}
