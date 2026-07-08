import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  registerDecorator,
  validateSync,
  type ValidationOptions,
} from 'class-validator';

function isValidOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function IsCorsOriginList(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCorsOriginList',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null || value === '') {
            return true;
          }

          if (typeof value !== 'string') {
            return false;
          }

          const origins = value
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean);

          return (
            origins.length > 0 &&
            origins.every((origin) => isValidOrigin(origin))
          );
        },
        defaultMessage() {
          return 'CORS_ORIGIN must be one or more valid URLs separated by commas';
        },
      },
    });
  };
}

class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  @IsOptional()
  NODE_ENV?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  PORT?: number;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN?: string;

  @IsCorsOriginList()
  @IsOptional()
  CORS_ORIGIN?: string;

  @IsString()
  @IsOptional()
  PORTAL_BASE_DOMAIN?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  SETUP_TOKEN_EXPIRY_HOURS?: number;

  @IsString()
  @IsOptional()
  AZURE_COMMUNICATION_CONNECTION_STRING?: string;

  @IsString()
  @IsOptional()
  AZURE_EMAIL_SENDER_ADDRESS?: string;

  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  @IsString()
  @IsOptional()
  EXPO_ACCESS_TOKEN?: string;
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validated;
}
