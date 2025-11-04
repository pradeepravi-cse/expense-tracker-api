/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { JwtUser } from './keycloak';
import { serverError, ServerErrorMessage } from '../utils/general.enum';

function httpErr(status: number, errorType: string, errorMessage: string) {
  return new HttpException({ errorType, errorMessage }, status);
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(ctx: ExecutionContext) {
    return super.canActivate(ctx);
  }

  override handleRequest<TUser = JwtUser>(err: any, user: any): TUser {
    if (err) {
      throw httpErr(
        HttpStatus.UNAUTHORIZED,
        serverError.UNAUTHORIZED,
        ServerErrorMessage.UNAUTHORIZED,
      );
    }

    if (!user) {
      throw httpErr(
        HttpStatus.UNAUTHORIZED,
        serverError.UNAUTHORIZED,
        ServerErrorMessage.UNAUTHORIZED,
      );
    }

    return user as TUser;
  }
}
