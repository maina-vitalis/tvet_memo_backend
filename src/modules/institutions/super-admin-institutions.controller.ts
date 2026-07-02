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
import { Public } from '../../common/decorators/public.decorator';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { ProvisionInstitutionDto } from './dto/provision-institution.dto';
import { UpdateInstitutionDto } from './dto/update-institution.dto';
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

  //provisioning the instittuion and the admin
  @Post('provision')
  provision(@Body() dto: ProvisionInstitutionDto) {
    return this.superAdminInstitutionsService.provision(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInstitutionDto) {
    return this.superAdminInstitutionsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.superAdminInstitutionsService.remove(id);
  }
}
