import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const nodeEnv = configService.get<string>('nodeEnv', 'development');
  const corsOrigin = configService.get<string>('cors.origin', 'http://localhost:3000');
  const sessionSecret = configService.getOrThrow<string>('session.secret');
  const sessionMaxAge = configService.get<number>('session.maxAgeMs', 604800000);

  app.use(helmet());
  app.use(cookieParser());
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      name: configService.get<string>('session.cookieName', 'tvet_session'),
      cookie: {
        httpOnly: true,
        secure: nodeEnv === 'production',
        sameSite: nodeEnv === 'production' ? 'strict' : 'lax',
        maxAge: sessionMaxAge,
      },
    }),
  );

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = configService.get<number>('port', 3000);
  await app.listen(port);
}

bootstrap();
