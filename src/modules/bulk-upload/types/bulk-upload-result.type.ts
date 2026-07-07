export interface BulkUploadRowResult {
  row: number;
  /** The row's Admission Number (student) or Staff Number (staff). */
  identifier?: string;
  status: 'created' | 'skipped' | 'failed';
  reason?: string;
}

export interface BulkUploadSummary {
  totalRows: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  rows: BulkUploadRowResult[];
}
