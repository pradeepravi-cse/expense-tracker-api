import { IsNumber, IsOptional, IsString } from 'class-validator';
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
}
