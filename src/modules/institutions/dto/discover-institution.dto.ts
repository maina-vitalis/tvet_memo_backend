import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DiscoverInstitutionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  query!: string;

  @IsIn(['email', 'shortcode'])
  mode!: 'email' | 'shortcode';
}

export type DiscoveredInstitutionResponse = {
  id: string;
  name: string;
  shortcode: string;
};
