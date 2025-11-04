import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('monthly_summaries')
export class MonthlySummary {
  @PrimaryColumn({ type: 'varchar', length: 7 }) month!: string;
  @PrimaryColumn({ type: 'varchar', length: 3 }) currency!: 'MYR' | 'INR';

  @Column('decimal', { precision: 12, scale: 2, default: 0 }) opening!: number;
  @Column('decimal', { precision: 12, scale: 2, default: 0 }) income!: number;
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  expenseCash!: number;
  @Column('decimal', { precision: 12, scale: 2, default: 0 }) ccBilled!: number;
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  ccSettlements!: number;
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  transfersIn!: number;
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  transfersOut!: number;
  @Column('decimal', { precision: 12, scale: 2, default: 0 }) closing!: number;
}
