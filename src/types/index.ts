export interface Credentials {
  username: string;
  token: string;
}

export type FeType = 'text' | 'date' | 'time' | 'uuid' | 'boolean' | 'decimal' | 'integer' | 'domain' | 'fk_select';

export interface FieldMeta {
  field_name: string;
  abap_type?: string;
  fe_type: FeType;
  length?: number;
  decimals?: number;
  is_key?: boolean;
  is_mandatory?: boolean;
  is_readonly?: boolean;
  label?: string;
  domain_name?: string;
  display_order?: number;
  is_hidden?: boolean;
  is_fk_key?: boolean;
  fk_ref_table?: string;

  /* Legacy field aliases for existing UI helpers */
  FieldName: string;
  FeType: FeType;
  FieldType: string;
  LabelText: string;
  IsKeyField: string;
  MandatoryFlag: string;
  HiddenFlag: string;
  DomainName: string;
  RollName?: string;
  rollname?: string;
  DisplayOrder: number;
  Length: number;
  Decimals: number;
  ReadonlyFlag?: string;
  IsFkKey?: string;
  FkRefTable?: string;
  _raw?: any;
}

export interface AiFieldDescription {
  fieldName: string;
  description: string;
  constraints: string;
}

export type AiDescriptionMap = Record<string, AiFieldDescription>;

export interface SessionUser {
  username: string;
}

export interface TableConfig {
  TableName: string;
  Description: string;
  ConfigUuid: string;
  ActiveFlag: string;
  ApprovalRequired: string;
  IsActiveEntity?: boolean;
}

/** Minimal approval state exposed to the maintenance table for row-level locking. */
export interface PendingApprovalRecord {
  TableName: string;
  RecordKey: string;
  Status: string;
  ActionType: string;
}

export interface AuditItemEntry {
  AuditId?: string;
  ItemNo?: number;
  TableName?: string;
  RecordKey?: string;
  FieldName?: string;
  OldValue?: string;
  NewValue?: string;
  ActionType?: 'C' | 'U' | 'D' | 'R' | string;
}

export interface AuditLogEntry {
  AuditId: string;
  /** UI-only alias used to keep a rollback operation under its original Audit ID. */
  DisplayAuditId?: string;
  TableName: string;
  RecordKey: string;
  FieldName: string;
  ActionType: 'C' | 'U' | 'D' | 'R' | string;
  OldValue?: string;
  NewValue?: string;
  ChangedBy?: string;
  ChangedAt?: string;
  RollbackAuditId?: string;
  _OperationControl?: {
    rollback?: boolean | string;
  };
  _Items?: { value?: AuditItemEntry[] } | AuditItemEntry[];
}

export type TableRowData = Record<string, any>;
