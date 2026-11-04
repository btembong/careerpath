import { ArgumentsHost, Catch, HttpException, Injectable } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request } from 'express';
import { ErrorsService } from './errors.service';

/** Records server errors (500s and crashes) for Admin → Errors, then answers exactly as Nest normally would */
@Catch()
@Injectable()
export class RecordErrorsFilter extends BaseExceptionFilter {
  constructor(private readonly errors: ErrorsService) { super(); }

  catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500 && host.getType() === 'http') {
      const req = host.switchToHttp().getRequest<Request & { user?: { id?: string }; route?: { path?: string } }>();
      const e = exception as Error;
      this.errors.record({
        source: 'API',
        message: e?.message ?? String(exception),
        where: `${req.method} ${req.route?.path ?? req.path}`,
        stack: e?.stack, userId: req.user?.id ?? null,
      }).catch(() => {});
    }
    super.catch(exception, host);
  }
}
