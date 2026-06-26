import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { SuperAdminGuard } from '../../../common/guards/super-admin.guard';
import { InstitutionsService } from '../institutions.service';
import { ProvisionInstitutionDto } from '../dto/provision-institution.dto';

@Public()
@UseGuards(SuperAdminGuard)
@Controller('platform/institutions')
export class PlatformInstitutionsController {
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
