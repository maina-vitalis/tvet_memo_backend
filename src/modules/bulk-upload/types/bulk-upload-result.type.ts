export interface BulkUploadRowResult {
  row: number;
  /** The row's admission number. */
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
