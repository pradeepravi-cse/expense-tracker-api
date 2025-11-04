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
import { MonthlySummary } from './lib/entities/monthly-summary.entity';
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

    @InjectRepository(MonthlySummary)
    private readonly monthlySummaryRepo: Repository<MonthlySummary>,
  ) {}

  // ---------------------------
  // Helpers
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
      // "YYYY-MM"
      const [ys, ms] = month.split('-');
      y = Number(ys);
      mZeroBased = Number(ms) - 1;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(month)) {
      // "YYYY-MM-DD" -> use that month
      const [ys, ms] = month.split('-'); // day is irrelevant for month range
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

    // Use UTC so comparisons don’t wobble across timezones
    const start = new Date(Date.UTC(y, mZeroBased, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, mZeroBased + 1, 1, 0, 0, 0, 0)); // exclusive

    return { start, end };
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

  /** Clamp a desired day (1–31) to the last valid day of a given month (UTC). */
  private clampDay(year: number, monthZeroBased: number, day: number): Date {
    const lastDay = new Date(
      Date.UTC(year, monthZeroBased + 1, 0),
    ).getUTCDate();
    const safeDay = Math.min(Math.max(1, day), lastDay);
    return new Date(Date.UTC(year, monthZeroBased, safeDay, 0, 0, 0, 0));
  }

  /** Iterate months (UTC) between start (inclusive) and end (exclusive), returning {y, m0}. */
  private *monthsBetween(
    start: Date,
    endExcl: Date,
  ): Generator<{ y: number; m0: number }> {
    const y = start.getUTCFullYear();
    const m0 = start.getUTCMonth();
    // Normalize to first of month
    const cursor = new Date(Date.UTC(y, m0, 1));
    while (cursor < endExcl) {
      yield { y: cursor.getUTCFullYear(), m0: cursor.getUTCMonth() };
      // advance by one month
      cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
    }
  }

  /**
   * Expand a monthly recurring definition into concrete monthly occurrences within [windowStart, windowEnd).
   * - Uses billingMonth's DAY as the anchor when present, else recurringStart's day, else 1.
   * - Clamps to last day for short months (e.g., Feb).
   * - Returns synthetic rows with unique IDs and occurrence date filled in.
   */
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

    // No intersection with the query window
    if (planEndExcl <= windowStart || planStart >= windowEndExcl) return [];

    const anchorDay = (row as any).billingMonth
      ? new Date((row as any).billingMonth).getUTCDate()
      : row.recurringStart
        ? new Date(row.recurringStart).getUTCDate()
        : 1;

    // Start iterating from the later of planStart/windowStart, normalized to month
    const firstMonth = new Date(
      Date.UTC(
        (planStart > windowStart ? planStart : windowStart).getUTCFullYear(),
        (planStart > windowStart ? planStart : windowStart).getUTCMonth(),
        1,
      ),
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
          id: `${row.id}__${y}-${String(m0 + 1).padStart(2, '0')}`, // synthetic occurrence id
          // IMPORTANT: override the date to the occurrence date
          date: when as any,
          // keep created/updated timestamps from the definition (or adjust to taste)
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

    // Optional: reject negative amounts
    if (typeof (body as any).amount !== 'number' || (body as any).amount < 0) {
      throw new HttpException('Amount must be >= 0', HttpStatus.BAD_REQUEST);
    }

    const created = this.expenseRepo.create(body as any);
    const saved = await this.expenseRepo.save(created);
    return saved[0];
  }

  // ---------------------------
  // LIST (with recurring expansion + then paginate)
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

    // 1) normal rows (not recurring) filtered by date
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

    // 2) recurring definitions that intersect the window (regardless of row.date)
    const recurringDefs = await this.expenseRepo.find({
      where: this.buildSearchWhere(
        { ...whereBase, isRecurring: true as any },
        q.q,
      ),
      order: { createdAt: 'ASC' as any },
    });

    // 3) expand recurring to concrete occurrences within window
    const recurringOcc = recurringDefs.flatMap((def) => {
      if ((def as any).recurringCycle !== 'monthly') return []; // extend for other cycles
      return this.expandMonthlyOccurrences(def, windowStart, windowEnd);
    });

    // 4) merge, sort, then paginate
    const merged = [...normalItems, ...recurringOcc].sort((a, b) => {
      const da = new Date(a.date as any).getTime();
      const db = new Date(b.date as any).getTime();
      if (db !== da) return db - da; // DESC by date
      const ca = new Date((a as any).createdAt).getTime();
      const cb = new Date((b as any).createdAt).getTime();
      return cb - ca; // tie-breaker
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
  // SUMMARY (includes expanded recurring)
  // ---------------------------
  async getSummary(query: SummaryQueryDto): Promise<SummaryDtoV2> {
    const currency = this.ensure(
      query.currency as CurrencyType,
      'currency is required',
    );
    // Month handling (defaults to current month in server TZ)
    const monthStr = query.month ?? new Date().toISOString().slice(0, 7); // YYYY-MM
    const { start, end } = this.monthRange(`${monthStr}-01`);

    // Normal (non-recurring) income
    const incomeNormal = await this.expenseRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.amount), 0)', 'v')
      .where('e.currency = :currency', { currency })
      .andWhere('e.type = :type', { type: 'income' })
      .andWhere('(e.isRecurring IS NULL OR e.isRecurring = false)')
      .andWhere('e.date >= :start AND e.date < :end', { start, end })
      .getRawOne<{ v: string }>()
      .then((r) => Number(r?.v ?? 0));

    // Normal (non-recurring) expense (excl creditCard immediate spend; you keep CC bill logic separate)
    const expenseNormal = await this.expenseRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.amount), 0)', 'v')
      .where('e.currency = :currency', { currency })
      .andWhere('e.type = :type', { type: 'expense' })
      .andWhere('(e.isRecurring IS NULL OR e.isRecurring = false)')
      .andWhere("(e.channel IS NULL OR e.channel <> 'creditCard')")
      .andWhere('e.date >= :start AND e.date < :end', { start, end })
      .getRawOne<{ v: string }>()
      .then((r) => Number(r?.v ?? 0));

    // Carry-forward stays as-is
    const carryForward = await this.expenseRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.amount), 0)', 'v')
      .where('e.currency = :currency', { currency })
      .andWhere('e.type = :type', { type: 'carryForward' })
      .andWhere('e.date >= :start AND e.date < :end', { start, end })
      .getRawOne<{ v: string }>()
      .then((r) => Number(r?.v ?? 0));

    // Expand recurring occurrences in-memory and sum
    const recurringDefs = await this.expenseRepo.find({
      where: { currency: currency as any, isRecurring: true as any },
    });

    const recurringOcc = recurringDefs.flatMap((def) => {
      if ((def as any).recurringCycle !== 'monthly') return [];
      return this.expandMonthlyOccurrences(def, start, end);
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

    // Optional: keep your credit-card next bill estimate
    const potentialNextMonthCCBill = await this.expenseRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.amount), 0)', 'v')
      .where('e.currency = :currency', { currency })
      .andWhere('e.type = :type', { type: 'expense' })
      .andWhere('e.channel = :channel', { channel: 'creditCard' })
      .andWhere('e.date >= :start AND e.date < :end', {
        start: `${monthStr}-5`,
        end,
      })
      .getRawOne<{ v: string }>()
      .then((r) => Number(r?.v ?? 0));

    const income = incomeNormal + incomeRecurring;
    const expense = expenseNormal + expenseRecurring;
    const savings = income - expense;
    const netPosition = savings + carryForward;

    return { income, expense, savings, netPosition, potentialNextMonthCCBill };
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
  // CHARTS (with recurring expansion)
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

    whereBase.type = ExpenseType.EXPENSE;

    // normal data
    const data = await this.expenseRepo.find({
      where: this.buildSearchWhere(
        {
          ...whereBase,
          isRecurring: false as any,
          date: Between(windowStart, windowEnd) as any,
        },
        undefined,
      ),
      order: { date: 'DESC' },
    });

    // recurring occurrences
    const recurringDefs = await this.expenseRepo.find({
      where: { ...(whereBase as any), isRecurring: true as any },
      order: { createdAt: 'ASC' as any },
    });

    const recurringOcc = recurringDefs.flatMap((def) => {
      if ((def as any).recurringCycle !== 'monthly') return [];
      return this.expandMonthlyOccurrences(def, windowStart, windowEnd);
    });

    const all = [...data, ...recurringOcc];

    const totalsMap: Record<string, number> = {};
    for (const item of all) {
      const ch = (item.channel || 'unknown') as any;
      if (!totalsMap[ch]) totalsMap[ch] = 0;
      totalsMap[ch] += Number(item.amount);
    }

    const totalsArr = Object.entries(totalsMap).map(([channel, total]) => ({
      channel,
      total,
    }));

    totalsArr.sort((a, b) => b.total - a.total);

    const top4 = totalsArr.slice(0, 4);
    const rest = totalsArr.slice(4);

    let othersBar: any = null;
    if (rest.length > 0) {
      const othersTotal = rest.reduce((sum, r) => sum + r.total, 0);
      const othersBreakdown = rest.map((r) => ({
        channel: r.channel,
        total: r.total,
      }));
      othersBar = {
        channel: 'others',
        total: othersTotal,
        breakdown: othersBreakdown,
      };
    } else {
      othersBar = { channel: 'others', total: 0, breakdown: [] };
    }

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

    whereBase.type = ExpenseType.EXPENSE;

    // normal data
    const data = await this.expenseRepo.find({
      where: this.buildSearchWhere(
        {
          ...whereBase,
          isRecurring: false as any,
          date: Between(windowStart, windowEnd) as any,
        },
        undefined,
      ),
      order: { date: 'DESC' },
    });

    // recurring occurrences
    const recurringDefs = await this.expenseRepo.find({
      where: { ...(whereBase as any), isRecurring: true as any },
      order: { createdAt: 'ASC' as any },
    });

    const recurringOcc = recurringDefs.flatMap((def) => {
      if ((def as any).recurringCycle !== 'monthly') return [];
      return this.expandMonthlyOccurrences(def, windowStart, windowEnd);
    });

    const all = [...data, ...recurringOcc];

    const totalsMap: Record<string, number> = {};
    for (const item of all) {
      const cat = (item.category || 'unknown') as any;
      if (!totalsMap[cat]) totalsMap[cat] = 0;
      totalsMap[cat] += Number(item.amount);
    }

    const totalsArr = Object.entries(totalsMap).map(([category, total]) => ({
      category,
      total,
    }));

    totalsArr.sort((a, b) => b.total - a.total);

    const top4 = totalsArr.slice(0, 4);
    const rest = totalsArr.slice(4);

    let othersBar: any = null;
    if (rest.length > 0) {
      const othersTotal = rest.reduce((sum, r) => sum + r.total, 0);
      const othersBreakdown = rest.map((r) => ({
        category: r.category,
        total: r.total,
      }));
      othersBar = {
        category: 'others',
        total: othersTotal,
        breakdown: othersBreakdown,
      };
    } else {
      othersBar = { category: 'others', total: 0, breakdown: [] };
    }

    return [...top4, othersBar];
  }
}
