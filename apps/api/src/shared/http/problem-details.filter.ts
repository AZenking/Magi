/**
 * RFC 9457 Problem Details exception filter (T026).
 *
 * Emits `application/problem+json` for all errors. The stable `code` is the
 * contract the Web branches on (never parse `detail`). Known HTTP exceptions
 * are mapped to stable codes; objects carrying their own `code`/`status` pass
 * through (e.g. from IfMatchRequiredGuard or domain checks).
 *
 * (contracts/common.md, T009 ProblemDetailsSchema)
 */
import {
  type ArgumentsHost,
  type ExceptionFilter,
  Catch,
  BadRequestException,
  HttpException,
  NotFoundException,
  ConflictException,
  PreconditionFailedException,
} from "@nestjs/common";
import { type Request, type Response } from "express";
import { ZodError } from "zod";

const PROBLEM_MEDIA = "application/problem+json";
const PROBLEM_TYPE_PREFIX = "https://magi.local/problems/";

/** Minimal status-text lookup (avoids the removed HttpStatus.getStatusText). */
const STATUS_TEXT: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  404: "Not Found",
  409: "Conflict",
  412: "Precondition Failed",
  422: "Unprocessable Entity",
  428: "Precondition Required",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable",
};

function statusToCode(status: number): string {
  switch (status) {
    case 400:
      return "invalid-command";
    case 401:
      return "authentication-required";
    case 404:
      return "resource-not-found";
    case 409:
      return "invalid-state-transition";
    case 412:
      return "stale-resource";
    case 422:
      return "validation-failed";
    case 428:
      return "precondition-required";
    case 429:
      return "rate-limit-exceeded";
    case 503:
      return "operation-capacity-unavailable";
    default:
      return "invalid-command";
  }
}

function emit(res: Response, status: number, body: Record<string, unknown>, requestId?: string) {
  res
    .status(status)
    .type(PROBLEM_MEDIA)
    .json({
      type: `${PROBLEM_TYPE_PREFIX}${body.code ?? statusToCode(status)}`,
      title: (body.title as string) ?? STATUS_TEXT[status] ?? "Error",
      status,
      detail: body.detail,
      instance: body.instance,
      code: body.code ?? statusToCode(status),
      requestId: requestId ?? body.requestId,
      retryable: body.retryable,
      currentVersion: body.currentVersion,
      changedFields: body.changedFields,
      previewId: body.previewId,
      conflicts: body.conflicts,
    });
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = req.requestId ?? req.header("x-request-id");

    if (exception instanceof ZodError) {
      emit(res, 422, { code: "validation-failed", detail: "Schema validation failed", changedFields: exception.issues.map((i) => i.path.join(".")) }, requestId);
      return;
    }
    if (exception instanceof BadRequestException) {
      const body = (exception.getResponse() as Record<string, unknown>) ?? {};
      emit(res, exception.getStatus(), { ...body, code: body.code ?? "invalid-command" }, requestId);
      return;
    }
    if (exception instanceof NotFoundException) {
      emit(res, 404, { code: "resource-not-found" }, requestId);
      return;
    }
    if (exception instanceof PreconditionFailedException) {
      const body = (exception.getResponse() as Record<string, unknown>) ?? {};
      const status = typeof body.status === "number" ? body.status : 428;
      emit(res, status, { ...body, code: body.code ?? "precondition-required" }, requestId);
      return;
    }
    if (exception instanceof ConflictException) {
      const body = (exception.getResponse() as Record<string, unknown>) ?? {};
      emit(res, 409, { ...body, code: body.code ?? "invalid-state-transition" }, requestId);
      return;
    }
    if (exception instanceof HttpException) {
      const body = (exception.getResponse() as Record<string, unknown>) ?? {};
      emit(res, exception.getStatus(), typeof body === "string" ? { detail: body } : body, requestId);
      return;
    }
    // Unknown error — log the root cause server-side (pino-http only records a
    // generic "failed with status code 500"), but never leak details to clients.
    // Unknown error — log the root cause server-side (pino-http only records a
    // generic "failed with status code 500"), but never leak details to clients.
    // eslint-disable-next-line no-console
    console.error("[ProblemDetailsFilter] unhandled exception:", exception);
    emit(res, 500, { code: "internal-error", detail: "An unexpected error occurred." }, requestId);
  }
}
