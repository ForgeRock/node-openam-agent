export class ShieldEvaluationError extends Error {
  constructor(public statusCode, public message, public details?: string) {
    super(message);
  }
}