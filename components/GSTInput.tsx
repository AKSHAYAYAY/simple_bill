import React, { useState } from 'react';
import { ErrorPopup } from './ErrorPopup';
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const GST_LENGTH = 15;
export const validateGST = (value: string, required = false) => { if (!value) return required ? 'GST number is required' : null; if (value.length !== GST_LENGTH) return 'GST number must be exactly 15 characters'; if (!GST_REGEX.test(value)) return 'Invalid GST number format'; return null; };
export const GSTInput: React.FC<any> = ({ label, value, onChange, error: externalError, required, disabled, placeholder }) => {
  const [internalError, setInternalError] = useState('');
  const [toastError, setToastError] = useState<string[]>([]);
  const error = externalError || internalError;
  const handleChange = (e: any) => { 
    const raw = (e.target.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (raw.length > GST_LENGTH) {
      setToastError([`GST number cannot be more than ${GST_LENGTH} characters`]);
    }
    const cleaned = raw.slice(0, GST_LENGTH); 
    onChange({ target: { ...e.target, value: cleaned } }); 
    if (!cleaned) setInternalError(''); 
    else if (cleaned.length < GST_LENGTH) setInternalError(`GST number is ${cleaned.length}/${GST_LENGTH} characters`); 
    else if (!GST_REGEX.test(cleaned)) setInternalError('Invalid GST format. Expected: 22AAAAA0000A1Z5'); 
    else setInternalError(''); 
  };
  return (
    <div className="relative">
      <ErrorPopup errors={toastError} onClose={() => setToastError([])} title="Input Limit Reached" />
      {label && <label>{label}{required && '*'}</label>}
      <input value={value || ''} onChange={handleChange} maxLength={GST_LENGTH} placeholder={placeholder || '22AAAAA0000A1Z5'} disabled={disabled} className={`w-full border rounded-xl p-3 font-mono ${error ? 'border-red-500' : 'border-gray-200'}`} />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <span className="text-xs">{(value||'').length}/{GST_LENGTH}</span>
    </div>
  );
};
