/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, ILike, Raw, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';

import { AddRegularExpensesDto } from './lib/dtos/add-regular-expenses.dto';
import { ListExpensesDto } from './lib/dtos/list-expenses.dto';
import { ExpensesDto } from './lib/dtos/list-espense.dto';
import { SummaryDtoV2, SummaryQueryDto } from './lib/dtos/summary.dto';

import { RegularExpense } from './lib/entities/expense.entity';
import { CurrencyType, ExpenseType } from './lib/utils/general.enum';
import { chartDataDto } from './lib/dtos/get-chart-data.dto';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    @InjectRepository(RegularExpense)
    private readonly expenseRepo: Repository<RegularExpense>,
  ) {}

  // ---------------------------
  // Helpers (month / timezone)
  // ---------------------------
  private ensure<T>(val: T | null | undefined, message: string): T {
    if (val === null || val === undefined) {
      throw new HttpException(message, HttpStatus.BAD_REQUEST);
    }
    return val;
  }

  private monthRange(month: string | Date) {
    let y: number, mZeroBased: number;

    if (month instanceof Date) {
      y = month.getUTCFullYear();
      mZeroBased = month.getUTCMonth();
    } else if (/^\d{4}-\d{2}$/.test(month)) {
      const [ys, ms] = month.split('-');
      y = Number(ys);
      mZeroBased = Number(ms) - 1;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(month)) {
      const [ys, ms] = month.split('-');
      y = Number(ys);
      mZeroBased = Number(ms) - 1;
    } else {
      throw new HttpException(
        'Invalid month format. Use YYYY-MM or YYYY-MM-DD.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      !Number.isFinite(y) ||
      !Number.isFinite(mZeroBased) ||
      mZeroBased < 0 ||
      mZeroBased > 11
    ) {
      throw new HttpException('Invalid month', HttpStatus.BAD_REQUEST);
    }

    const start = new Date(Date.UTC(y, mZeroBased, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, mZeroBased + 1, 1, 0, 0, 0, 0)); // exclusive
    return { start, end };
  }

  /** Default to Malaysia UTC+8 when caller doesn't provide tz. */
  private getTzOffsetMinutes(tzOffsetMinutes?: number): number {
    const n = Number(tzOffsetMinutes);
    if (Number.isFinite(n)) return n;
    return 480; // UTC+8
  }

  /** Convert a UTC date into "local wall clock" by offset minutes (no DST rules). */
  private toLocal(utc: Date, offsetMin: number): Date {
    return new Date(utc.getTime() + offsetMin * 60_000);
  }
  /** Convert a local wall-clock date to UTC by subtracting offset. */
  private fromLocal(local: Date, offsetMin: number): Date {
    return new Date(local.getTime() - offsetMin * 60_000);
  }

  /** Start of local day (as a UTC Date) for a given "now" UTC. */
  private startOfLocalDayUTC(nowUTC: Date, offsetMin: number): Date {
    const local = this.toLocal(nowUTC, offsetMin);
    const sodLocal = new Date(
      Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    return this.fromLocal(sodLocal, offsetMin);
  }
  /** Start of *tomorrow* local day (as a UTC Date). */
  private startOfTomorrowLocalUTC(nowUTC: Date, offsetMin: number): Date {
    const sodUTC = this.startOfLocalDayUTC(nowUTC, offsetMin);
    return new Date(sodUTC.getTime() + 24 * 3600 * 1000);
  }

  private buildSearchWhere(
    base: FindOptionsWhere<RegularExpense>,
    q?: string,
  ): FindOptionsWhere<RegularExpense> | FindOptionsWhere<RegularExpense>[] {
    if (!q) return base;
    const like = `%${q}%`;

    return [
      { ...base, title: ILike(like) },
      { ...base, notes: ILike(like) },
      {
        ...base,
        category: Raw((alias) => `${alias}::text ILIKE :like`, { like }) as any,
      },
      {
        ...base,
        channel: Raw((alias) => `${alias}::text ILIKE :like`, { like }) as any,
      },
    ];
  }

  // ---------------------------
  // CREATE (manual-only)
  // ---------------------------
  async createRegularExpenses(
    body: AddRegularExpensesDto,
  ): Promise<RegularExpense> {
    if (!body) {
      throw new HttpException('Invalid body', HttpStatus.BAD_REQUEST);
    }
    if (typeof (body as any).amount !== 'number' || (body as any).amount < 0) {
      throw new HttpException('Amount must be >= 0', HttpStatus.BAD_REQUEST);
    }
    const created = this.expenseRepo.create(body);
    const saved = await this.expenseRepo.save(created);
    return saved;
  }

  // ---------------------------
  // LIST (pure manual rows, no projections)
  // ---------------------------
  async listExpenses(q: ListExpensesDto): Promise<ExpensesDto> {
    const page = Number(q.page ?? 1);
    const limit = Math.min(Number(q.limit ?? 25), 200);
    const skip = (page - 1) * limit;

    const whereBase: FindOptionsWhere<RegularExpense> = {};
    if (q.category) whereBase.category = q.category as any;
    if (q.channel) whereBase.channel = q.channel as any;
    if (q.currency) whereBase.currency = q.currency as any;

    const windowStart = q.start
      ? new Date(q.start)
      : new Date('1970-01-01T00:00:00Z');
    const windowEnd = q.end
      ? new Date(q.end)
      : new Date('2999-12-31T23:59:59Z');

    const whereNormal = this.buildSearchWhere(
      {
        ...whereBase,
        date: Between(windowStart, windowEnd) as any,
      },
      q.q,
    );

    const items = await this.expenseRepo.find({
      where: whereNormal,
      order: { date: 'DESC', createdAt: 'DESC' as any },
      skip,
      take: limit,
    });

    const total = await this.expenseRepo.count({ where: whereNormal as any });

    return plainToInstance(
      ExpensesDto,
      { items, total, page, limit },
      { enableImplicitConversion: true },
    );
  }

  // ---------------------------
  // SUMMARY (bank-aligned, manual-only)
  // ---------------------------
  async getSummary(query: SummaryQueryDto): Promise<SummaryDtoV2> {
    const currency = this.ensure(
      query.currency as CurrencyType,
      'currency is required',
    );
    const monthStr = query.month ?? new Date().toISOString().slice(0, 7); // YYYY-MM
    const { start, end } = this.monthRange(`${monthStr}-01`);

    const tzOffsetMin = this.getTzOffsetMinutes((query as any).tzOffsetMinutes);
    const nowUTC = new Date();

    // Include entries through start-of-tomorrow (LOCAL) if the month is the current month.
    const startOfTomorrowLocalUTC = this.startOfTomorrowLocalUTC(
      nowUTC,
      tzOffsetMin,
    );
    const effectiveEnd =
      start < startOfTomorrowLocalUTC && end > startOfTomorrowLocalUTC
        ? startOfTomorrowLocalUTC
        : end;

    // Income
    const income = await this.expenseRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.amount), 0)', 'v')
      .where('e.currency = :currency', { currency })
      .andWhere('e.type = :type', { type: 'income' })
      .andWhere('e.date >= :start AND e.date < :end', {
        start,
        end: effectiveEnd,
      })
      .getRawOne<{ v: string }>()
      .then((r) => Number(r?.v ?? 0));

    // Expense (exclude raw credit-card swipes; you’ll add the bill payment manually)
    const expense = await this.expenseRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.amount), 0)', 'v')
      .where('e.currency = :currency', { currency })
      .andWhere('e.type = :type', { type: 'expense' })
      .andWhere("(e.channel IS NULL OR e.channel <> 'creditCard')")
      .andWhere("(e.channel IS NULL OR e.channel <> 'tng')")
      .andWhere('e.date >= :start AND e.date < :end', {
        start,
        end: effectiveEnd,
      })
      .getRawOne<{ v: string }>()
      .then((r) => Number(r?.v ?? 0));

    // Carry-forward (you add it manually on the 1st as an income-like line)
    const carryForward = await this.expenseRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.amount), 0)', 'v')
      .where('e.currency = :currency', { currency })
      .andWhere('e.type = :type', { type: 'carryForward' })
      .andWhere('e.date >= :start AND e.date < :end', {
        start,
        end: effectiveEnd,
      })
      .getRawOne<{ v: string }>()
      .then((r) => Number(r?.v ?? 0));

    // Optional: estimate for NEXT month’s CC bill (for planning only)
    const [yStr, mStr] = monthStr.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    const billStart = `${yStr}-${String(m).padStart(2, '0')}-06`;
    const nextMonth = m === 12 ? 1 : m + 1;
    const nextYear = m === 12 ? y + 1 : y;
    const billEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-05`;

    const potentialNextMonthCCBill = await this.expenseRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.amount), 0)', 'v')
      .where('e.currency = :currency', { currency })
      .andWhere('e.type = :type', { type: 'expense' })
      .andWhere('e.channel = :channel', { channel: 'creditCard' })
      .andWhere('e.date >= :start AND e.date < :end', {
        start: billStart,
        end: billEnd,
      })
      .getRawOne<{ v: string }>()
      .then((r) => Number(r?.v ?? 0));

    const savings = income - expense;
    const netPosition = savings + carryForward;

    return {
      income,
      expense,
      savings,
      netPosition,
      potentialNextMonthCCBill,
      // keep the shape compatible; recurring removed
      recurringExpense: 0,
    };
  }

  // ---------------------------
  // GET BY ID
  // ---------------------------
  async getById(id: string): Promise<RegularExpense> {
    const expense = await this.expenseRepo.findOne({ where: { id } });
    if (!expense) {
      throw new HttpException('Not found', HttpStatus.NOT_FOUND);
    }
    return plainToInstance(RegularExpense, expense, {
      enableImplicitConversion: true,
    });
  }

  // ---------------------------
  // UPDATE
  // ---------------------------
  async update(
    id: string,
    patch: Partial<AddRegularExpensesDto>,
  ): Promise<RegularExpense> {
    const existing = await this.expenseRepo.findOne({ where: { id } });
    if (!existing) throw new HttpException('Not found', HttpStatus.NOT_FOUND);

    const merged = this.expenseRepo.merge(existing, patch as any);
    const saved = await this.expenseRepo.save(merged);
    return saved;
  }

  // ---------------------------
  // DELETE
  // ---------------------------
  async remove(id: string): Promise<{ id: string }> {
    const existing = await this.expenseRepo.findOne({ where: { id } });
    if (!existing) throw new HttpException('Not found', HttpStatus.NOT_FOUND);
    await this.expenseRepo.remove(existing);
    return { id };
  }

  // ---------------------------
  // CHARTS (manual-only)
  // ---------------------------
  async getChartDataByChannel(q: chartDataDto): Promise<any> {
    const whereBase: FindOptionsWhere<RegularExpense> = {};
    if (q.currency) whereBase.currency = q.currency as any;

    const windowStart = q.start
      ? new Date(q.start)
      : new Date('1970-01-01T00:00:00Z');
    const windowEnd = q.end
      ? new Date(q.end)
      : new Date('2999-12-31T23:59:59Z');

    const tzOffsetMin = this.getTzOffsetMinutes((q as any).tzOffsetMinutes);
    const nowUTC = new Date();
    const startOfTomorrowLocalUTC = this.startOfTomorrowLocalUTC(
      nowUTC,
      tzOffsetMin,
    );

    const effEnd =
      windowStart < startOfTomorrowLocalUTC &&
      windowEnd > startOfTomorrowLocalUTC
        ? startOfTomorrowLocalUTC
        : windowEnd;

    whereBase.type = ExpenseType.EXPENSE;

    const data = await this.expenseRepo.find({
      where: this.buildSearchWhere(
        {
          ...whereBase,
          date: Between(windowStart, effEnd) as any,
        },
        undefined,
      ),
      order: { date: 'DESC' },
    });

    const totalsMap: Record<string, number> = {};
    for (const item of data) {
      const ch = (item.channel || 'unknown') as any;
      totalsMap[ch] = (totalsMap[ch] ?? 0) + Number(item.amount);
    }

    const totalsArr = Object.entries(totalsMap).map(([channel, total]) => ({
      channel,
      total,
    }));
    totalsArr.sort((a, b) => b.total - a.total);

    const top4 = totalsArr.slice(0, 4);
    const rest = totalsArr.slice(4);
    const othersBar = rest.length
      ? {
          channel: 'others',
          total: rest.reduce((s, r) => s + r.total, 0),
          breakdown: rest.map((r) => ({ channel: r.channel, total: r.total })),
        }
      : { channel: 'others', total: 0, breakdown: [] };

    return [...top4, othersBar];
  }

  async getChartDataByCategory(q: chartDataDto): Promise<any> {
    const whereBase: FindOptionsWhere<RegularExpense> = {};
    if (q.currency) whereBase.currency = q.currency as any;

    const windowStart = q.start
      ? new Date(q.start)
      : new Date('1970-01-01T00:00:00Z');
    const windowEnd = q.end
      ? new Date(q.end)
      : new Date('2999-12-31T23:59:59Z');

    const tzOffsetMin = this.getTzOffsetMinutes((q as any).tzOffsetMinutes);
    const nowUTC = new Date();
    const startOfTomorrowLocalUTC = this.startOfTomorrowLocalUTC(
      nowUTC,
      tzOffsetMin,
    );

    const effEnd =
      windowStart < startOfTomorrowLocalUTC &&
      windowEnd > startOfTomorrowLocalUTC
        ? startOfTomorrowLocalUTC
        : windowEnd;

    whereBase.type = ExpenseType.EXPENSE;

    const data = await this.expenseRepo.find({
      where: this.buildSearchWhere(
        {
          ...whereBase,
          date: Between(windowStart, effEnd) as any,
        },
        undefined,
      ),
      order: { date: 'DESC' },
    });

    const totalsMap: Record<string, number> = {};
    for (const item of data) {
      const cat = (item.category || 'unknown') as any;
      totalsMap[cat] = (totalsMap[cat] ?? 0) + Number(item.amount);
    }

    const totalsArr = Object.entries(totalsMap).map(([category, total]) => ({
      category,
      total,
    }));
    totalsArr.sort((a, b) => b.total - a.total);

    const top4 = totalsArr.slice(0, 4);
    const rest = totalsArr.slice(4);
    const othersBar = rest.length
      ? {
          category: 'others',
          total: rest.reduce((s, r) => s + r.total, 0),
          breakdown: rest.map((r) => ({
            category: r.category,
            total: r.total,
          })),
        }
      : { category: 'others', total: 0, breakdown: [] };

    return [...top4, othersBar];
  }
}
