export enum serverError {
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  GATEWAY_TIMEOUT = 'GATEWAY_TIMEOUT',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  BADREQUEST = 'BAD_REQUEST',
  NOTFOUND = 'NOT_FOUND',
}

export enum ServerErrorMessage {
  INTERNAL_SERVER_ERROR = 'An unexpected error occurred on the server. Please try again later.',
  GATEWAY_TIMEOUT = 'The request timed out. Please try again in a few moments.',
  UNAUTHORIZED = 'Authentication required inorder to access this API',
  FORBIDDEN = 'You are not authorized to access this API',
  BADREQUEST = 'The request could not be understood or was missing required parameters.',
  NOTFOUND = 'The requested resource could not be found.',
}

export enum ExpenseType {
  INCOME = 'income',
  EXPENSE = 'expense',
  CARRY_FORWARD = 'carryForward',
}

export enum CurrencyType {
  MYR = 'MYR',
  INR = 'INR',
}

export enum ChannelType {
  CASH = 'cash',
  CREDIT_CARD = 'creditCard',
  DEBIT_CARD = 'debitCard',
  ONLINE_BANKING = 'onlineBanking',
  TNG = 'tng',
  GRAB_PAY = 'grabPay',
  UPI = 'upi',
  CARRY_FORWARD = 'carryForward',
}

export enum CategoryType {
  RENT = 'rent',
  GROCERIES = 'groceries',
  WATER_BILL = 'waterbill',
  ELECTRICITY_BILL = 'electricitybill',
  INTERNET = 'internet',
  MOBILE_BILL = 'mobileBill',
  WATER_PURIFIER_BILL = 'waterPurifierBill',
  CREDIT_CARD_BILL = 'creditCardBill',
  EATING_OUT = 'eatingout',
  ENTERTAINMENT = 'entertainment',
  TRANSPORTATION = 'transportation',
  HEALTHCARE = 'healthcare',
  EDUCATION = 'education',
  SHOPPING = 'shopping',
  CRICKET = 'cricket',
  TRANSFER = 'transfer',
  PIGGY_BANK_SAVINGS = 'piggyBankSavings',
  OTHERS = 'others',
  SALARY = 'salary',
  SAVINGS = 'savings',
  MAID_SALARY = 'maidSalary',
  CARRY_FORWARD = 'carryForward',
}
