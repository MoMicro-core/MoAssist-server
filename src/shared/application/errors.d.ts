export class ApplicationError extends Error {
  name: string;
  statusCode: number;
  code: string;
  details?: unknown;
  constructor(
    message: string,
    statusCode?: number,
    code?: string,
    details?: unknown,
  );
}

export class BadRequestError extends ApplicationError {
  constructor(message: string, details?: unknown);
}

export class UnauthorizedError extends ApplicationError {
  constructor(message?: string, details?: unknown);
}

export class ForbiddenError extends ApplicationError {
  constructor(message?: string, details?: unknown);
}

export class NotFoundError extends ApplicationError {
  constructor(message?: string, details?: unknown);
}
