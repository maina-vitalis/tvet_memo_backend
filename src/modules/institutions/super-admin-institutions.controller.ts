import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { ProvisionInstitutionDto } from './dto/provision-institution.dto';
import { InstitutionsService } from './institutions.service';

@Public()
@UseGuards(SuperAdminGuard)
@Controller('superadmin/institutions')
export class SuperAdminInstitutionsController {
  constructor(private readonly institutionsService: InstitutionsService) {}

  @Get()
  findAll() {
    return this.institutionsService.findAllForPlatform();
  }

  @Post('provision')
  provision(@Body() dto: ProvisionInstitutionDto) {
    return this.institutionsService.provision(dto);
  }
}
