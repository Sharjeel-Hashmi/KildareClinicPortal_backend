// Wraps async route handlers so thrown errors reach the error middleware
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export const pick = (obj = {}, keys = []) =>
  keys.reduce((acc, key) => {
    if (obj[key] !== undefined) acc[key] = obj[key];
    return acc;
  }, {});

export const escapeRegex = (str = '') => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
