import { Expose } from 'class-transformer';
import { IsOptional } from 'class-validator';

export class SummaryDto {
  @Expose()
  income!: number;

  @Expose()
  expense!: number;

  @Expose()
  savings!: number;

  @Expose()
  netPosition!: number;
}

export class SummaryQueryDto {
  @IsOptional()
  month?: string;
  @IsOptional()
  currency?: 'MYR' | 'INR';
}

export class SummaryDtoV2 {
  @Expose()
  income!: number;

  @Expose()
  expense!: number;

  @Expose()
  savings!: number;

  @Expose()
  netPosition!: number;

  @Expose()
  potentialNextMonthCCBill!: number;
}
