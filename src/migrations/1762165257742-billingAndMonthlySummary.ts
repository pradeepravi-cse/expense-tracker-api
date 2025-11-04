import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnumifyRegularExpensesFull_20251103 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create named enums once (idempotent guard)
    await queryRunner.query(`DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='expense_type_enum') THEN
        CREATE TYPE expense_type_enum AS ENUM ('income','expense');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='currency_type_enum') THEN
        CREATE TYPE currency_type_enum AS ENUM ('MYR','INR');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='channel_type_enum') THEN
        CREATE TYPE channel_type_enum AS ENUM ('cash','creditCard','debitCard','onlineBanking','tng','grabPay','upi');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='category_type_enum') THEN
        CREATE TYPE category_type_enum AS ENUM (
          'rent','groceries','waterbill','electricitybill','internet','mobileBill',
          'waterPurifierBill','creditCardBill','eatingout','entertainment','transportation',
          'healthcare','education','shopping','cricket','transfer','piggyBankSavings',
          'others','salary','savings','maidSalary'
        );
      END IF;
    END$$;`);

    // Cast using USING clauses
    await queryRunner.query(`
      ALTER TABLE "regularExpenses"
      ALTER COLUMN "type"     TYPE expense_type_enum  USING LOWER("type")::expense_type_enum,
      ALTER COLUMN "currency" TYPE currency_type_enum USING "currency"::currency_type_enum,
      ALTER COLUMN "channel"  TYPE channel_type_enum  USING "channel"::channel_type_enum,
      ALTER COLUMN "category" TYPE category_type_enum USING "category"::category_type_enum
    `);

    // Enforce NOT NULL
    await queryRunner.query(`
      ALTER TABLE "regularExpenses"
      ALTER COLUMN "type" SET NOT NULL,
      ALTER COLUMN "currency" SET NOT NULL,
      ALTER COLUMN "channel" SET NOT NULL,
      ALTER COLUMN "category" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "regularExpenses"
      ALTER COLUMN "type"     TYPE varchar USING "type"::text,
      ALTER COLUMN "currency" TYPE varchar USING "currency"::text,
      ALTER COLUMN "channel"  TYPE varchar USING "channel"::text,
      ALTER COLUMN "category" TYPE varchar USING "category"::text
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS expense_type_enum;
      DROP TYPE IF EXISTS currency_type_enum;
      DROP TYPE IF EXISTS channel_type_enum;
      DROP TYPE IF EXISTS category_type_enum;
    `);
  }
}
