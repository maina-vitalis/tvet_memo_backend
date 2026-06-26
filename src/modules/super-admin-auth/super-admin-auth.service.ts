import { Injectable } from '@nestjs/common';
import { SuperAdminLoginDto } from './dto/super-admin-login.dto';

@Injectable()
export class SuperAdminAuthService {
  login(superAdminLoginDto: SuperAdminLoginDto) {
    return 'This action adds a new superAdminAuth';
  }
}
