import { Module } from '@nestjs/common';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { EarningsService } from './earnings.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [WalletsController],
  providers: [WalletsService, EarningsService],
  exports: [EarningsService],
})
export class WalletsModule {}
