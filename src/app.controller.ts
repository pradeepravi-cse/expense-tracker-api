/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { AddRegularExpensesDto } from './lib/dtos/add-regular-expenses.dto';
import { RegularExpense } from './lib/entities/expense.entity';
import { ListExpensesDto } from './lib/dtos/list-expenses.dto';
import { ExpensesDto } from './lib/dtos/list-espense.dto';
import { SummaryDto } from './lib/dtos/summary.dto';
import { chartDataDto } from './lib/dtos/get-chart-data.dto';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('/regular-expenses')
  createRegularExpenses(
    @Body() body: AddRegularExpensesDto,
  ): Promise<RegularExpense> {
    return this.appService.createRegularExpenses(body);
  }
  @Get('/summary')
  getSummary(@Query() q: ListExpensesDto): Promise<SummaryDto> {
    return this.appService.getSummary(q);
  }

  @Get('/expenses')
  getExpenses(@Query() q: ListExpensesDto): Promise<ExpensesDto> {
    return this.appService.listExpenses(q);
  }

  @Get('/expenses/:id')
  getExpenseById(@Param('id') id: string): Promise<RegularExpense> {
    return this.appService.getById(id);
  }

  @Get('/expenses-chart/channel')
  getChannelChart(@Query() q: chartDataDto): Promise<any> {
    return this.appService.getChartDataByChannel(q);
  }

  @Get('/expenses-chart/category')
  getCategoryChart(@Query() q: chartDataDto): Promise<any> {
    return this.appService.getChartDataByCategory(q);
  }
}
