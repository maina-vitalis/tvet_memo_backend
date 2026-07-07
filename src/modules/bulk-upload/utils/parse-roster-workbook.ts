import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';

export interface ParsedRosterRow {
  rowNumber: number;
  /** Student identifier — presence of this makes the row a TRAINEE. */
  admissionNumber?: string;
  /** Staff identifier — presence of this (without admissionNumber) makes the row staff. */
  staffNumber?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phoneNumber?: string;
  departmentName?: string;
  /** Raw text from the "Role" column — only meaningful for staff rows. */
  roleRaw?: string;
}

export interface RowError {
  row: number;
  identifier?: string;
  reason: string;
}

/** Canonical field -> accepted header spellings (normalized: lowercase, trimmed, `_`/`-` -> space). */
const HEADER_ALIASES: Record<string, string[]> = {
  admissionNumber: [
    'admission number',
    'admission no',
    'admissionno',
    'adm no',
    'admno',
    'registration number',
    'reg number',
    'regno',
  ],
  staffNumber: [
    'staff number',
    'staff no',
    'staffno',
    'employee number',
    'employee no',
    'empno',
    'personnel number',
    'payroll number',
  ],
  firstName: ['first name', 'firstname', 'given name'],
  lastName: ['last name', 'lastname', 'surname', 'family name'],
  fullName: ['name', 'full name', 'student name', 'fullname'],
  email: ['email', 'email address', 'e mail'],
  phoneNumber: [
    'phone',
    'phone number',
    'mobile',
    'mobile number',
    'contact',
    'contact number',
  ],
  departmentName: ['department', 'dept', 'course'],
  roleRaw: ['role', 'staff role', 'position', 'designation', 'job title'],
};

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildHeaderMap(
  sampleRow: Record<string, unknown>,
): Record<string, string> {
  const map: Record<string, string> = {};

  for (const key of Object.keys(sampleRow)) {
    const normalized = normalizeHeader(key);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (!map[field] && aliases.includes(normalized)) {
        map[field] = key;
      }
    }
  }

  return map;
}

function cellToString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

function readField(raw: Record<string, unknown>, key?: string): string {
  if (!key) return '';
  return cellToString(raw[key]);
}

/**
 * Parses an uploaded roster (.xlsx/.xls) into normalized rows. A row is a
 * student if it has an Admission Number, or staff if it has a Staff Number
 * (staff rows also carry a Role so the caller can validate/assign it).
 *
 * Rows missing a required field are returned as `errors` (row number
 * preserved, counting the header as row 1) instead of throwing — one bad
 * row must not abort the whole file.
 */
export function parseRosterWorkbook(buffer: Buffer): {
  rows: ParsedRosterRow[];
  errors: RowError[];
} {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new BadRequestException('The uploaded file has no sheets');
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });

  if (rawRows.length === 0) {
    throw new BadRequestException('The uploaded file has no data rows');
  }

  const headerMap = buildHeaderMap(rawRows[0]);

  if (!headerMap.admissionNumber && !headerMap.staffNumber) {
    const foundHeaders = Object.keys(rawRows[0]).join(', ') || '(none)';
    throw new BadRequestException(
      `Could not find an "Admission Number" or "Staff Number" column in the uploaded file. Columns found: ${foundHeaders}`,
    );
  }

  const rows: ParsedRosterRow[] = [];
  const errors: RowError[] = [];

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2; // header occupies row 1
    const isBlank = Object.values(raw).every((v) => cellToString(v) === '');
    if (isBlank) return;

    const admissionNumber =
      readField(raw, headerMap.admissionNumber) || undefined;
    const staffNumber = readField(raw, headerMap.staffNumber) || undefined;
    let firstName = readField(raw, headerMap.firstName);
    let lastName = readField(raw, headerMap.lastName);
    const email = readField(raw, headerMap.email) || undefined;
    const phoneNumber = readField(raw, headerMap.phoneNumber) || undefined;
    const departmentName =
      readField(raw, headerMap.departmentName) || undefined;
    const roleRaw = readField(raw, headerMap.roleRaw) || undefined;

    if ((!firstName || !lastName) && headerMap.fullName) {
      const fullName = readField(raw, headerMap.fullName);
      const parts = fullName.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        firstName = firstName || parts[0];
        lastName = lastName || parts.slice(1).join(' ');
      } else if (parts.length === 1) {
        firstName = firstName || parts[0];
      }
    }

    const identifier = admissionNumber ?? staffNumber;

    if (!identifier) {
      errors.push({
        row: rowNumber,
        reason: 'Missing admission number or staff number',
      });
      return;
    }

    if (!firstName || !lastName) {
      errors.push({
        row: rowNumber,
        identifier,
        reason: 'Missing first or last name',
      });
      return;
    }

    rows.push({
      rowNumber,
      admissionNumber,
      staffNumber,
      firstName,
      lastName,
      email: email?.toLowerCase(),
      phoneNumber,
      departmentName,
      roleRaw,
    });
  });

  return { rows, errors };
}
