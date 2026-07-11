import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function notFound(message = "Resource not found") {
  return new HttpError(404, message);
}

export function badRequest(message: string) {
  return new HttpError(400, message);
}

export function forbidden(message = "You do not have access to this resource") {
  return new HttpError(403, message);
}

export function unauthorized(message = "Authentication required") {
  return new HttpError(401, message);
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: error.errors.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  const message =
    error instanceof Error ? error.message : "Unexpected server error";
  if (process.env.NODE_ENV !== "test") {
    console.error(error);
  }
  res.status(500).json({ error: message });
}
