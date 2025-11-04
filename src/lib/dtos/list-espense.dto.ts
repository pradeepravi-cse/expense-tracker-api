import { Expose, Type } from 'class-transformer';
import { RegularExpense } from '../entities/expense.entity';

export class ExpensesDto {
  @Expose()
  @Type(() => RegularExpense)
  items!: RegularExpense[];

  @Expose()
  total!: number;

  @Expose()
  page!: number;

  @Expose()
  limit!: number;
}
