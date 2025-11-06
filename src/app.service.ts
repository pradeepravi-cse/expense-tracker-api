/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, ILike, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';

import { AddRegularExpensesDto } from './lib/dtos/add-regular-expenses.dto';
import { ListExpensesDto } from './lib/dtos/list-expenses.dto';
import { ExpensesDto } from './lib/dtos/list-espense.dto';
import { SummaryDtoV2, SummaryQueryDto } from './lib/dtos/summary.dto';

import { RegularExpense } from './lib/entities/expense.entity';
import {
  CategoryType,
  ChannelType,
  CurrencyType,
  ExpenseType,
} from './lib/utils/general.enum';
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
    return [
      { ...base, title: ILike(`%${q}%`) },
      { ...base, category: ILike(`%${q}%`) as unknown as CategoryType },
      { ...base, notes: ILike(`%${q}%`) },
      { ...base, channel: ILike(`%${q}%`) as unknown as ChannelType },
    ];
  }

  // ---------------------------
  // Recurring expansion helpers
  // ---------------------------

  private clampDay(year: number, monthZeroBased: number, day: number): Date {
    const lastDay = new Date(
      Date.UTC(year, monthZeroBased + 1, 0),
    ).getUTCDate();
    const safeDay = Math.min(Math.max(1, day), lastDay);
    return new Date(Date.UTC(year, monthZeroBased, safeDay, 0, 0, 0, 0));
  }

  private *monthsBetween(
    start: Date,
    endExcl: Date,
  ): Generator<{ y: number; m0: number }> {
    const y = start.getUTCFullYear();
    const m0 = start.getUTCMonth();
    const cursor = new Date(Date.UTC(y, m0, 1));
    while (cursor < endExcl) {
      yield { y: cursor.getUTCFullYear(), m0: cursor.getUTCMonth() };
      cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
    }
  }

  private expandMonthlyOccurrences(
    row: RegularExpense,
    windowStart: Date,
    windowEndExcl: Date,
  ): Array<RegularExpense> {
    const planStart = row.recurringStart
      ? new Date(row.recurringStart)
      : new Date('1970-01-01T00:00:00Z');
    const planEndExcl = row.recurringEnd
      ? new Date(row.recurringEnd)
      : new Date('2999-12-31T23:59:59Z');

    if (planEndExcl <= windowStart || planStart >= windowEndExcl) return [];

    const anchorDay = (row as any).billingMonth
      ? new Date((row as any).billingMonth).getUTCDate()
      : row.recurringStart
        ? new Date(row.recurringStart).getUTCDate()
        : 1;

    const later = planStart > windowStart ? planStart : windowStart;
    const firstMonth = new Date(
      Date.UTC(later.getUTCFullYear(), later.getUTCMonth(), 1),
    );

    const out: RegularExpense[] = [];
    for (const { y, m0 } of this.monthsBetween(firstMonth, windowEndExcl)) {
      const when = this.clampDay(y, m0, anchorDay);
      if (
        when >= windowStart &&
        when < windowEndExcl &&
        when >= planStart &&
        when < planEndExcl
      ) {
        out.push({
          ...row,
          id: `${row.id}__${y}-${String(m0 + 1).padStart(2, '0')}`,
          date: when as any,
          createdAt: (row as any).createdAt,
          updatedAt: (row as any).updatedAt,
        } as RegularExpense);
      }
    }
    return out;
  }

  // ---------------------------
  // CREATE
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
  // LIST (keeps future projections visible for planning)
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

    // 1) normal rows in window
    const whereNormal = this.buildSearchWhere(
      {
        ...whereBase,
        isRecurring: false as any,
        date: Between(windowStart, windowEnd) as any,
      },
      q.q,
    );
    const normalItems = await this.expenseRepo.find({
      where: whereNormal,
      order: { date: 'DESC', createdAt: 'DESC' as any },
    });

    // 2) recurring definitions
    const recurringDefs = await this.expenseRepo.find({
      where: this.buildSearchWhere(
        { ...whereBase, isRecurring: true as any },
        q.q,
      ),
      order: { createdAt: 'ASC' as any },
    });

    // 3) expand recurring (list view shows future)
    const recurringOcc = recurringDefs.flatMap((def) => {
      if ((def as any).recurringCycle !== 'monthly') return [];
      return this.expandMonthlyOccurrences(def, windowStart, windowEnd);
    });

    const merged = [...normalItems, ...recurringOcc].sort((a, b) => {
      const da = new Date(a.date as any).getTime();
      const db = new Date(b.date as any).getTime();
      if (db !== da) return db - da;
      const ca = new Date((a as any).createdAt).getTime();
      const cb = new Date((b as any).createdAt).getTime();
      return cb - ca;
    });

    const total = merged.length;
    const pageItems = merged.slice(skip, skip + limit);

    return plainToInstance(
      ExpensesDto,
      { items: pageItems, total, page, limit },
      { enableImplicitConversion: true },
    );
  }

  // ---------------------------
  // SUMMARY (bank-aligned)
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

    // Hybrid capping (LOCAL time):
    // - Normal rows: include through start-of-tomorrow (local)
    // - Recurring projections: include strictly before today (local)
    const startOfTodayLocalUTC = this.startOfLocalDayUTC(nowUTC, tzOffsetMin);
    const startOfTomorrowLocalUTC = this.startOfTomorrowLocalUTC(
      nowUTC,
      tzOffsetMin,
    );

    const effectiveEndNormal =
      start < startOfTomorrowLocalUTC && end > startOfTomorrowLocalUTC
        ? startOfTomorrowLocalUTC
        : end;
    const effectiveEndRecurring =
      start < startOfTodayLocalUTC && end > startOfTomorrowLocalUTC
        ? startOfTodayLocalUTC
        : end;

    // Normal (non-recurring) income
    const incomeNormal = await this.expenseRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.amount), 0)', 'v')
      .where('e.currency = :currency', { currency })
      .andWhere('e.type = :type', { type: 'income' })
      .andWhere('(e.isRecurring IS NULL OR e.isRecurring = false)')
      .andWhere('e.date >= :start AND e.date < :end', {
        start,
        end: effectiveEndNormal,
      })
      .getRawOne<{ v: string }>()
      .then((r) => Number(r?.v ?? 0));

    // Normal (non-recurring) expense (exclude creditCard swipes; you handle them via bill)
    const expenseNormal = await this.expenseRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.amount), 0)', 'v')
      .where('e.currency = :currency', { currency })
      .andWhere('e.type = :type', { type: 'expense' })
      .andWhere('(e.isRecurring IS NULL OR e.isRecurring = false)')
      .andWhere("(e.channel IS NULL OR e.channel <> 'creditCard')")
      .andWhere('e.date >= :start AND e.date < :end', {
        start,
        end: effectiveEndNormal,
      })
      .getRawOne<{ v: string }>()
      .then((r) => Number(r?.v ?? 0));

    // Carry-forward
    const carryForward = await this.expenseRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.amount), 0)', 'v')
      .where('e.currency = :currency', { currency })
      .andWhere('e.type = :type', { type: 'carryForward' })
      .andWhere('e.date >= :start AND e.date < :end', {
        start,
        end: effectiveEndNormal,
      })
      .getRawOne<{ v: string }>()
      .then((r) => Number(r?.v ?? 0));

    // Recurring occurrences (up to "before today (local)")
    const [recurringDefs, totalRecurringDefs] =
      await this.expenseRepo.findAndCount({
        where: { currency: currency as any, isRecurring: true as any },
      });

    const recurringOcc = recurringDefs.flatMap((def) => {
      if ((def as any).recurringCycle !== 'monthly') return [];
      return this.expandMonthlyOccurrences(def, start, effectiveEndRecurring);
    });

    let incomeRecurring = 0;
    let expenseRecurring = 0;
    for (const occ of recurringOcc) {
      if (occ.type === ExpenseType.INCOME)
        incomeRecurring += Number(occ.amount);
      if (
        occ.type === ExpenseType.EXPENSE &&
        occ.channel !== ('creditCard' as any)
      ) {
        expenseRecurring += Number(occ.amount);
      }
    }

    // Optional: credit-card next bill estimate (unchanged)
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

    const income = incomeNormal + incomeRecurring;
    const expense = expenseNormal + expenseRecurring;
    const savings = income - expense;
    const netPosition = savings + carryForward;

    return {
      income,
      expense,
      savings,
      netPosition,
      potentialNextMonthCCBill,
      recurringExpense: totalRecurringDefs,
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
  // CHARTS (bank-aligned hybrid window)
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
    const startOfTodayLocalUTC = this.startOfLocalDayUTC(nowUTC, tzOffsetMin);
    const startOfTomorrowLocalUTC = this.startOfTomorrowLocalUTC(
      nowUTC,
      tzOffsetMin,
    );

    // Normal up to start-of-tomorrow (local) if window overlaps; recurring up to start-of-today (local)
    const effEndNormal =
      windowStart < startOfTomorrowLocalUTC &&
      windowEnd > startOfTomorrowLocalUTC
        ? startOfTomorrowLocalUTC
        : windowEnd;
    const effEndRecurring =
      windowStart < startOfTodayLocalUTC && windowEnd > startOfTomorrowLocalUTC
        ? startOfTodayLocalUTC
        : windowEnd;

    whereBase.type = ExpenseType.EXPENSE;

    const data = await this.expenseRepo.find({
      where: this.buildSearchWhere(
        {
          ...whereBase,
          isRecurring: false as any,
          date: Between(windowStart, effEndNormal) as any,
        },
        undefined,
      ),
      order: { date: 'DESC' },
    });

    const recurringDefs = await this.expenseRepo.find({
      where: { ...(whereBase as any), isRecurring: true as any },
      order: { createdAt: 'ASC' as any },
    });

    const recurringOcc = recurringDefs.flatMap((def) => {
      if ((def as any).recurringCycle !== 'monthly') return [];
      return this.expandMonthlyOccurrences(def, windowStart, effEndRecurring);
    });

    const all = [...data, ...recurringOcc];

    const totalsMap: Record<string, number> = {};
    for (const item of all) {
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
    const startOfTodayLocalUTC = this.startOfLocalDayUTC(nowUTC, tzOffsetMin);
    const startOfTomorrowLocalUTC = this.startOfTomorrowLocalUTC(
      nowUTC,
      tzOffsetMin,
    );

    const effEndNormal =
      windowStart < startOfTomorrowLocalUTC &&
      windowEnd > startOfTomorrowLocalUTC
        ? startOfTomorrowLocalUTC
        : windowEnd;
    const effEndRecurring =
      windowStart < startOfTodayLocalUTC && windowEnd > startOfTomorrowLocalUTC
        ? startOfTodayLocalUTC
        : windowEnd;

    whereBase.type = ExpenseType.EXPENSE;

    const data = await this.expenseRepo.find({
      where: this.buildSearchWhere(
        {
          ...whereBase,
          isRecurring: false as any,
          date: Between(windowStart, effEndNormal) as any,
        },
        undefined,
      ),
      order: { date: 'DESC' },
    });

    const recurringDefs = await this.expenseRepo.find({
      where: { ...(whereBase as any), isRecurring: true as any },
      order: { createdAt: 'ASC' as any },
    });

    const recurringOcc = recurringDefs.flatMap((def) => {
      if ((def as any).recurringCycle !== 'monthly') return [];
      return this.expandMonthlyOccurrences(def, windowStart, effEndRecurring);
    });

    const all = [...data, ...recurringOcc];

    const totalsMap: Record<string, number> = {};
    for (const item of all) {
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
