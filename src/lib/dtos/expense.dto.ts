import { Expose } from 'class-transformer';

export class AddRegularExpensesDto {
  @Expose()
  id!: string;
  @Expose()
  title!: string;
  @Expose()
  amount!: number;
  @Expose()
  date!: Date;
  @Expose()
  type!: string;
  @Expose()
  currency!: 'MYR' | 'INR';
  @Expose()
  channel!: string;
  @Expose()
  category!: string;
  @Expose()
  notes!: string;
  @Expose()
  createdAt!: string;
  @Expose()
  updatedAt!: string;
  @Expose()
  isRecurring!: boolean;
}
