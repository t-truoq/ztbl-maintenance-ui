export interface Credentials {
  username: string;
  token: string;
}

export type FeType = 'text' | 'date' | 'time' | 'uuid' | 'boolean' | 'decimal' | 'integer' | 'domain';

export interface FieldMeta {
  field_name: string;
  abap_type?: string;
  fe_type: FeType;
  length?: number;
  decimals?: number;
  is_key?: boolean;
  is_mandatory?: boolean;
  label?: string;
  domain_name?: string;
  display_order?: number;
  is_hidden?: boolean;

  /* Legacy field aliases for existing UI helpers */
  FieldName: string;
  FeType: FeType;
  FieldType: string;
  LabelText: string;
  IsKeyField: string;
  MandatoryFlag: string;
  HiddenFlag: string;
  DomainName: string;
  DisplayOrder: number;
  Length: number;
  Decimals: number;
  ReadonlyFlag?: string;
  _raw?: any;
}

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

export interface AuditLogEntry {
  AuditId: string;
  TableName: string;
  FieldName: string;
  ActionType: 'C' | 'U' | 'D';
  OldValue?: string;
  NewValue?: string;
  ChangedBy?: string;
  ChangedAt?: string;
}

export type TableRowData = Record<string, any>;
