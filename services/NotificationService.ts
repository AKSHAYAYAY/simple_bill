type NotificationKind = 'success' | 'error' | 'duplicate' | 'loading';

const DUPLICATE_HINT = 'This record already exists. Please check unique fields such as phone, GSTIN, invoice number, or code.';

const normalizeMessage = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error || '');
  if (/ER_DUP_ENTRY|Duplicate entry|unique constraint|SQLITE_CONSTRAINT/i.test(raw)) {
    return DUPLICATE_HINT;
  }
  return raw || 'Something went wrong. Please try again.';
};

export const NotificationService = {
  success(message: string) {
    window.dispatchEvent(new CustomEvent('simplebill:notification', { detail: { kind: 'success' as NotificationKind, message } }));
  },
  error(error: unknown) {
    const message = normalizeMessage(error);
    window.dispatchEvent(new CustomEvent('simplebill:notification', { detail: { kind: 'error' as NotificationKind, message } }));
    return message;
  },
  duplicate(error?: unknown) {
    const message = normalizeMessage(error || DUPLICATE_HINT);
    window.dispatchEvent(new CustomEvent('simplebill:notification', { detail: { kind: 'duplicate' as NotificationKind, message } }));
    return message;
  },
  loading(message = 'Loading...') {
    window.dispatchEvent(new CustomEvent('simplebill:notification', { detail: { kind: 'loading' as NotificationKind, message } }));
  },
  confirm(message: string) {
    return window.confirm(message);
  },
  friendlyMessage: normalizeMessage
};
