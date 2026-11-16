/** App error with a Firebase-style code ("permission-denied", "functions/not-found", …), so callers' handling stays simple. */
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
