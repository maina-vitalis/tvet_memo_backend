import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export enum MemoPriorityDto {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum MemoCategoryDto {
  GENERAL = 'general',
  ACADEMIC = 'academic',
  ADMINISTRATIVE = 'administrative',
  EMERGENCY = 'emergency',
  EVENT = 'event',
}

export enum MemoTargetTypeDto {
  BROADCAST = 'broadcast',
  DEPARTMENT = 'department',
  ROLE = 'role',
  INDIVIDUAL = 'individual',
}

export class CreateMemoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsEnum(MemoPriorityDto)
  @IsOptional()
  priority?: MemoPriorityDto;

  @IsEnum(MemoCategoryDto)
  category!: MemoCategoryDto;

  @IsEnum(MemoTargetTypeDto)
  targetType!: MemoTargetTypeDto;

  @IsObject()
  @IsOptional()
  targetPayload?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  requiresAck?: boolean;

  @IsDateString()
  @IsOptional()
  ackDeadlineAt?: string;

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}

export class UpdateMemoDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  subject?: string;

  @IsString()
  @IsOptional()
  body?: string;

  @IsEnum(MemoPriorityDto)
  @IsOptional()
  priority?: MemoPriorityDto;

  @IsEnum(MemoCategoryDto)
  @IsOptional()
  category?: MemoCategoryDto;

  @IsEnum(MemoTargetTypeDto)
  @IsOptional()
  targetType?: MemoTargetTypeDto;

  @IsObject()
  @IsOptional()
  targetPayload?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  requiresAck?: boolean;

  @IsDateString()
  @IsOptional()
  ackDeadlineAt?: string;

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}

export class AcknowledgeMemoDto {
  @IsEnum(['simple', 'reply'])
  ackType!: 'simple' | 'reply';

  @IsString()
  @IsOptional()
  ackReply?: string;
}
