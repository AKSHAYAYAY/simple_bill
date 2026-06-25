import React, { useState } from 'react';
import { ErrorPopup } from './ErrorPopup';

export const PhoneInput: React.FC<{
  label?: string;
  value: string;
  onChange: (e: any) => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  maxLength?: number;
}> = ({ label, value, onChange, error, required, placeholder, className, maxLength = 10 }) => {
  const [toastError, setToastError] = useState<string[]>([]);

  const clean = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length > maxLength) {
      setToastError([`Phone number cannot be more than ${maxLength} digits`]);
    }
    return digits.slice(0, maxLength);
  };

  return (
    <div className={`field-group ${error ? 'has-error' : ''} ${className || ''}`}>
      <ErrorPopup errors={toastError} onClose={() => setToastError([])} title="Input Limit Reached" />
      {label && <label className="field-label">{label}{required && <span className="required-star">*</span>}</label>}
      <div className="input-wrapper phone-input-wrapper flex items-center gap-2">
        <span className="phone-prefix text-sm font-bold text-gray-500">+91</span>
        <input
          type="tel"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange({ target: { ...e.target, value: clean(e.target.value) } })}
          onKeyDown={(e) => {
            const allowed = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
            if (!allowed.includes(e.key) && !/^\d$/.test(e.key)) e.preventDefault();
          }}
          onPaste={(e) => {
            e.preventDefault();
            onChange({ target: { value: clean(e.clipboardData.getData('text')) } });
          }}
          placeholder={placeholder || 'Phone number'}
          aria-invalid={!!error}
          className={`phone-input w-full border rounded-xl p-3 ${error ? 'input-error border-red-500' : 'border-gray-200'}`}
        />
        {maxLength && <span className={`digit-counter text-xs ${value.length === maxLength ? 'text-green-600' : 'text-gray-500'}`}>{value.length}/{maxLength}</span>}
      </div>
      {error && <span className="field-error text-red-500 text-xs" role="alert">{error}</span>}
    </div>
  );
};
