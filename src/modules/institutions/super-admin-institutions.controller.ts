import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { ProvisionInstitutionDto } from './dto/provision-institution.dto';
import { SuperAdminInstitutionsService } from './super-admin-institutions.service';

@Public()
@UseGuards(SuperAdminGuard)
@Controller('superadmin/institutions')
export class SuperAdminInstitutionsController {
  constructor(
    private readonly superAdminInstitutionsService: SuperAdminInstitutionsService,
  ) {}

  @Get()
  findAll() {
    return this.superAdminInstitutionsService.findAll();
  }

  @Post('provision')
  provision(@Body() dto: ProvisionInstitutionDto) {
    return this.superAdminInstitutionsService.provision(dto);
  }
}
