import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  CategoryType,
  ChannelType,
  CurrencyType,
  ExpenseType,
} from '../utils/general.enum';

@Entity('regularExpenses')
export class RegularExpense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'enum', enum: ExpenseType, enumName: 'expense_type_enum' })
  type: ExpenseType;

  @Column({ type: 'enum', enum: CurrencyType, enumName: 'currency_type_enum' })
  currency: CurrencyType;

  @Column({ type: 'enum', enum: ChannelType, enumName: 'channel_type_enum' })
  channel: ChannelType;

  @Column({ type: 'enum', enum: CategoryType, enumName: 'category_type_enum' })
  category: CategoryType;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  billingMonth?: string;

  @Column({ type: 'boolean', default: false })
  isRecurring?: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'date', nullable: true })
  recurringStart?: Date;

  @Column({ type: 'date', nullable: true })
  recurringEnd?: Date;

  @Column({ type: 'varchar', length: 10, nullable: true })
  recurringCycle?: 'monthly' | 'yearly';

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
