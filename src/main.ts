import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const corsOrigin = configService.get<string>(
    'cors.origin',
    'http://localhost:3000',
  );

  const allowedOrigins = corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const isDev = configService.get<string>('nodeEnv') === 'development';

  app.use(helmet());

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(
        origin,
      );

      if (allowedOrigins.includes(origin) || (isDev && isLocalhost)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');
  // cookie-parser must be registered before morgan (and before the JWT strategy
  // fires) so Express populates req.cookies for HttpOnly cookie extraction.
  app.use(cookieParser());
  app.use(morgan('dev'));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = configService.get<number>('port', 5000);
  await app.listen(port, () => {
    console.log(`App is running on port ${port}`);
  });
}

bootstrap();
