import { IsOptional } from 'class-validator';

export class chartDataDto {
  @IsOptional()
  month?: string;

  @IsOptional()
  currency?: 'MYR' | 'INR';

  @IsOptional()
  start?: string;

  @IsOptional()
  end?: string;
}
