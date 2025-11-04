import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { CategoryType, ChannelType, CurrencyType } from '../utils/general.enum';

export class ListExpensesDto {
  @IsOptional()
  q?: string;

  @IsOptional()
  category?: CategoryType;

  @IsOptional()
  channel?: ChannelType;

  @IsOptional()
  start?: string;

  @IsOptional()
  currency?: CurrencyType;

  @IsOptional()
  end?: string;

  @IsOptional()
  order?: 'ASC' | 'DESC';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}
