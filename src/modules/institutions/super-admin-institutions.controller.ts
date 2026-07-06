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
import { RequirePermissions } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permission } from '../../common/rbac/permission.enum';
import { ProvisionInstitutionDto } from './dto/provision-institution.dto';
import { UpdateInstitutionDto } from './dto/update-institution.dto';
import { SuperAdminInstitutionsService } from './super-admin-institutions.service';

/** [RBAC] Super-admin institution management — gated by MANAGE_INSTITUTIONS. */
@UseGuards(PermissionsGuard)
@Controller('superadmin/institutions')
export class SuperAdminInstitutionsController {
  constructor(
    private readonly superAdminInstitutionsService: SuperAdminInstitutionsService,
  ) {}

  @Get()
  @RequirePermissions(Permission.MANAGE_INSTITUTIONS)
  findAll() {
    return this.superAdminInstitutionsService.findAll();
  }

  @Post('provision')
  @RequirePermissions(Permission.MANAGE_INSTITUTIONS)
  provision(@Body() dto: ProvisionInstitutionDto) {
    return this.superAdminInstitutionsService.provision(dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.MANAGE_INSTITUTIONS)
  update(@Param('id') id: string, @Body() dto: UpdateInstitutionDto) {
    return this.superAdminInstitutionsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.MANAGE_INSTITUTIONS)
  remove(@Param('id') id: string) {
    return this.superAdminInstitutionsService.remove(id);
  }
}
