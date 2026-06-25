import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { PlatformAdminGuard } from '../../../common/guards/platform-admin.guard';
import { InstitutionsService } from '../institutions.service';
import { ProvisionInstitutionDto } from '../dto/provision-institution.dto';

@Public()
@UseGuards(PlatformAdminGuard)
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
