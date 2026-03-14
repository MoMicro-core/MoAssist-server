'use strict';

class ApplicationError extends Error {
  constructor(message, statusCode = 500, code = 'application_error', details) {
    super(message);
    this.name = 'ApplicationError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

class BadRequestError extends ApplicationError {
  constructor(message, details) {
    super(message, 400, 'bad_request', details);
  }
}

class UnauthorizedError extends ApplicationError {
  constructor(message = 'Unauthorized', details) {
    super(message, 401, 'unauthorized', details);
  }
}

class ForbiddenError extends ApplicationError {
  constructor(message = 'Forbidden', details) {
    super(message, 403, 'forbidden', details);
  }
}

class NotFoundError extends ApplicationError {
  constructor(message = 'Not found', details) {
    super(message, 404, 'not_found', details);
  }
}

module.exports = {
  ApplicationError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
};
