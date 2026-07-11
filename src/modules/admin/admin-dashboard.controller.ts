import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { AdminDashboardService } from './admin-dashboard.service';
import { ListMemosQueryDto } from './dto/list-memos-query.dto';

@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly adminDashboardService: AdminDashboardService) {}

  @Get()
  getSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.adminDashboardService.getSummary(user);
  }

  @Get('memos')
  listMemos(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMemosQueryDto,
  ) {
    return this.adminDashboardService.listMemos(user, query);
  }

  @Get('memos/:id')
  getMemoDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminDashboardService.getMemoDetail(user, id);
  }
}
