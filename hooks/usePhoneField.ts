import { useState } from 'react';

export function usePhoneField(initial = '') {
  const [value, setValue] = useState((initial || '').replace(/\D/g, '').slice(0, 10));
  const [error, setError] = useState('');

  const onChange = (e: any) => {
    const raw = (e.target.value || '').replace(/\D/g, '');
    if (raw.length > 10) {
      alert("Phone number cannot be more than 10 digits");
    }
    const capped = raw.slice(0, 10);
    setValue(capped);

    if (!capped) setError('');
    else if (capped.length < 10) setError(`Phone number must be 10 digits (${capped.length}/10 entered)`);
    else if (!/^[6-9]/.test(capped)) setError('Indian mobile numbers must start with 6, 7, 8, or 9');
    else setError('');
  };

  const validate = (required = true) => {
    if (required && !value) {
      setError('Phone number is required');
      return false;
    }
    if (value && value.length !== 10) {
      setError(`Phone number must be 10 digits (${value.length} entered)`);
      return false;
    }
    if (value.length === 10 && !/^[6-9]/.test(value)) {
      setError('Indian mobile numbers must start with 6, 7, 8, or 9');
      return false;
    }
    setError('');
    return true;
  };

  const reset = (val = '') => {
    setValue((val || '').replace(/\D/g, '').slice(0, 10));
    setError('');
  };

  return { value, error, onChange, validate, reset };
}
