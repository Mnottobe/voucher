export interface VoucherEntryAuxiliary {
  auxiliaryCategory: number;
  auxiliaryId: string;
  auxiliaryCode?: string;
  auxiliaryName?: string;
}

export interface VoucherEntry {
  id: string;
  entryNumber: number;
  entrySummary: string;
  subjectId: string;
  subjectCode?: string;
  subjectName?: string;
  /** 层级全称：一级-二级-三级，例如「银行存款-工商银行」 */
  subjectFullName?: string;
  auxiliaries: VoucherEntryAuxiliary[];
  debitAmount: number | string | null;
  creditAmount: number | string | null;
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  currencyCode?: CurrencyCode | null;
  originalAmount?: number | string | null;
  exchangeRate?: number | string | null;
}

export interface VoucherForm {
  id: string;
  voucherNumber: number;
  period?: number | string;
  attachmentCount: number;
  voucherSource: number | string;
  createdByName?: string;
  voucherDate?: number | string;
  createdBy?: string;
  editStatus?: number;
  reversedVoucherId?: string;
  originalVoucherId?: string;
  voucherEntryList: VoucherEntry[];
}

export interface VoucherTemplate {
  id: string;
  templateName: string;
  voucherEntryList: VoucherEntry[];
}

export type CurrencyCode = 'CNY' | 'USD' | 'HKD' | 'JPY' | 'EUR' | 'GBP';
export interface SubjectAuxiliaryConfig { auxiliaryCategory: number; required: boolean; }

export interface Subject {
  id: string;
  code: string;
  name: string;
  /** 是否有下级科目（1=有）。非末级科目不能记账，只在下拉里排除，展示态仍要能查到它 */
  hasChildren?: number;
  /** 层级全称：一级-二级-三级，例如「银行存款-工商银行」；科目一律按它显示 */
  fullName?: string;
  auxiliaryCategory?: number;
  auxiliaries?: SubjectAuxiliaryConfig[];
  closingBalance?: number;
  quantityAccounting?: boolean;
  quantityUnit?: string;
  foreignCurrencyEnabled?: boolean;
  foreignCurrencyCodes?: CurrencyCode[];
}

