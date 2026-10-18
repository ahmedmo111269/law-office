import { AppError, type AppErrorCode } from '../errors.ts';

/**
 * Arabic messages keyed by the stable data-layer error code. UI code must not
 * surface raw English data-layer messages; they are diagnostic, not user copy.
 */
const MESSAGES: Readonly<Record<AppErrorCode, string>> = {
  VALIDATION_FAILED: 'راجع البيانات المدخلة. هناك حقل مطلوب أو قيمة غير صالحة.',
  NOT_FOUND: 'لم يعد هذا السجل موجودًا. ربما حُذف أو تغيّر من نافذة أخرى.',
  ALREADY_EXISTS: 'هذا السجل موجود بالفعل، ولا يمكن تكراره.',
  CONFLICT: 'تعارض التغيير مع بيانات حالية. راجع السجل ثم حاول مرة أخرى.',
  FOREIGN_KEY_VIOLATION: 'السجل المرتبط غير موجود أو حُذف. اختر سجلًا آخر.',
  UNIQUE_VIOLATION: 'توجد قيمة مكررة في حقل يجب أن يكون فريدًا.',
  INVALID_STATE: 'لا يمكن تنفيذ هذه العملية على السجل في حالته الحالية.',
  IMMUTABLE_RECORD: 'هذا السجل محفوظ بطريقة لا تسمح بتعديله. استخدم قيدًا عكسيًا عند الحاجة.',
  MIGRATION_FAILED: 'تعذر ترقية بنية قاعدة البيانات. لم تُفقد البيانات، لكن يلزم مراجعة الحالة.',
  MIGRATION_CHECKSUM_MISMATCH: 'تم اكتشاف تغيير غير متوقع في سجل الترقيات. أُوقفت العملية حمايةً للبيانات.',
  SCHEMA_TOO_NEW: 'قاعدة البيانات أُنشئت بإصدار أحدث من التطبيق. حدّث التطبيق قبل الفتح.',
  BACKUP_FAILED: 'تعذر إنشاء النسخة الاحتياطية. لم تتغير بياناتك.',
  BACKUP_CORRUPT: 'ملف النسخة الاحتياطية تالف أو غير مكتمل.',
  BACKUP_INCOMPATIBLE: 'النسخة الاحتياطية لا تتوافق مع إصدار قاعدة البيانات الحالي.',
  RESTORE_REQUIRES_EMPTY_DATABASE: 'الاستعادة تحتاج قاعدة بيانات فارغة في هذا الإصدار.',
  RESTORE_FAILED: 'تعذرت الاستعادة. احتفظنا بالبيانات الحالية كما هي.',
  UNSUPPORTED_ENGINE: 'هذا المتصفح لا يوفر التخزين المحلي المطلوب لتشغيل البرنامج.',
  TRANSACTION_FAILED: 'تعذر إتمام العملية على التخزين المحلي. لم يُحفظ التغيير.',
  CHECK_CONSTRAINT: 'قيمة غير مسموح بها في أحد الحقول. راجع البيانات المدخلة.',
  DEPENDENT_RECORDS_EXIST: 'لا يمكن حذف السجل لوجود سجلات مرتبطة به. احذفها أو أبقِ السجل.',
  ALREADY_DELETED: 'السجل محذوف بالفعل.',
  NOT_DELETED: 'السجل غير محذوف.',
  SEARCH_UNAVAILABLE: 'تعذر البحث في الفهرس المحلي. يمكنك إعادة بناء الفهرس من الإعدادات.',
};

export function messageForCode(code: string | undefined): string {
  if (!code) return 'حدث خطأ غير متوقع. لم يتغير أي شيء.';
  return MESSAGES[code as AppErrorCode] ?? 'حدث خطأ غير متوقع. لم يتغير أي شيء.';
}

export interface UiError {
  readonly code: string;
  readonly message: string;
  readonly detail: string;
}

export function toUiError(error: unknown): UiError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: messageForCode(error.code),
      detail: error.message,
    };
  }
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return {
      code: 'TRANSACTION_FAILED',
      message: 'مساحة التخزين في المتصفح ممتلئة. لم يُحفظ التغيير.',
      detail: error.message,
    };
  }
  if (error instanceof Error) {
    return {
      code: 'UNEXPECTED',
      message: 'حدث خطأ غير متوقع. لم يتغير أي شيء.',
      detail: error.message,
    };
  }
  return { code: 'UNEXPECTED', message: 'حدث خطأ غير متوقع.', detail: String(error) };
}

/** A short, non-technical hint used under a field. */
export function fieldMessage(error: unknown, field?: string): string {
  const ui = toUiError(error);
  if (ui.code === 'VALIDATION_FAILED' && field) return `تحقق من قيمة «${field}».`;
  return ui.message;
}
