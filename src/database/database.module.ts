import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DRIZZLE } from './database.constants';
import { createDrizzleClient } from './drizzle';

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.getOrThrow<string>('database.url');
        return createDrizzleClient(databaseUrl);
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
