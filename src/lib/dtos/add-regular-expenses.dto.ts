import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import {
  CategoryType,
  ChannelType,
  CurrencyType,
  ExpenseType,
} from '../utils/general.enum';

export class AddRegularExpensesDto {
  @IsString()
  title!: string;

  @IsNumber()
  amount!: number;

  @IsString()
  date!: Date;

  @IsString()
  type!: ExpenseType;

  @IsString()
  currency!: CurrencyType;

  @IsString()
  channel!: ChannelType;

  @IsString()
  category!: CategoryType;

  @IsOptional()
  @IsString()
  notes!: string;

  @IsOptional()
  @IsString()
  billingMonth!: string;

  @IsBoolean()
  isRecurring!: boolean;

  @IsOptional()
  @IsString()
  recurringStart!: string;

  @IsOptional()
  @IsString()
  recurringEnd!: string;

  @IsOptional()
  @IsString()
  recurringCycle!: 'monthly' | 'yearly';
}
