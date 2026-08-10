import { Request } from "express";
import { prisma } from "../lib/prisma";

export type AuditAction =
  | "LOGIN" | "LOGIN_FAILED" | "LOGOUT" | "VIEW_RECORD"
  | "CREATE_NOTE" | "EDIT_NOTE" | "ADD_ADDENDUM" | "VOID_NOTE"
  | "UPLOAD_DOC" | "DOWNLOAD_DOC" | "ARCHIVE_DOC"
  | "CREATE_USER" | "UPDATE_USER" | "DEACTIVATE_USER" | "RESET_PASSWORD"
  | "IMPORT_RUN" | "BACKUP_RUN" | "CREATE_EMPLOYEE" | "UPDATE_EMPLOYEE"
  | "IMPORT_CREATE_EMPLOYEE" | "IMPORT_UPDATE_EMPLOYEE"
  | "IMPORT_CREATE_APE" | "IMPORT_UPDATE_APE"
  | "RECORD_VITALS" | "LOG_MEDICATION"
  | "ARCHIVE_EMPLOYEE" | "RESTORE_EMPLOYEE" | "CREATE_COMPANY" | "UPDATE_COMPANY" | "DELETE_EMPLOYEE" | "UPDATE_BRANDING"
  | "UPDATE_TOOTH_RECORD"
  | "DELETE_NOTE" | "DELETE_VITALS" | "DELETE_MEDICATION" | "DELETE_DOCUMENT" | "DELETE_APE"
  | "DELETE_DRUG_TEST" | "DELETE_PRE_EMPLOYMENT"
  | "RECOVERY_KEY_GENERATED" | "RECOVERY_ADMIN_CREATED" | "REVIEW_NOTE_CATEGORY"
  | "CREATE_CERTIFICATE"
  | "CREATE_DOCUMENT_LABEL" | "RELABEL_DOCUMENT";

interface AuditParams {
  req?: Request;
  userId?: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  employeeId?: string;
  details?: Record<string, unknown>;
}

export async function writeAudit(params: AuditParams) {
  const { req, userId, action, entityType, entityId, employeeId, details } = params;
  await prisma.auditLog.create({
    data: {
      userId: userId ?? null,
      action,
      entityType,
      entityId,
      employeeId,
      ipAddress: req?.ip,
      userAgent: req?.headers["user-agent"],
      detailsJson: details ? JSON.stringify(details) : null,
    },
  });
}
