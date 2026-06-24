import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { UpdateInstitutionDto } from './dto/institution.dto';
import { InstitutionsService } from './institutions.service';

@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly institutionsService: InstitutionsService) {}

  @Public()
  @Get('subdomain/:subdomain')
  findBySubdomain(@Param('subdomain') subdomain: string) {
    return this.institutionsService.findBySubdomain(subdomain);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.institutionsService.findById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInstitutionDto) {
    return this.institutionsService.update(id, dto);
  }
}
