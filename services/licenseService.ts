

import { LicenseInfo } from "../types";
const normalizeLicensePlan = (plan = ''): LicenseInfo['plan'] => {
  const p = String(plan).trim().toUpperCase();
  if (p === 'ENT' || p === 'ENTERPRISE') return 'ENTERPRISE';
  if (p === 'PRO') return 'PRO';
  return 'FREE';
};

const verifyLocalPattern = (key: string): LicenseInfo => {
  const cleanKey = key.trim().toUpperCase();
  if (/^SB-PRO-[A-Z0-9]{6,}$/.test(cleanKey)) {
    return { key: cleanKey, plan: 'PRO', status: 'ACTIVE', expiryDate: '2099-12-31T23:59:59Z', maxUsers: 3 };
  }
  if (/^SB-ENT-[A-Z0-9]{6,}$/.test(cleanKey)) {
    return { key: cleanKey, plan: 'ENTERPRISE', status: 'ACTIVE', expiryDate: '2099-12-31T23:59:59Z', maxUsers: 10 };
  }
  if (/^SB-FREE-[A-Z0-9]{6,}$/.test(cleanKey)) {
    return { key: cleanKey, plan: 'FREE', status: 'ACTIVE', expiryDate: '2099-12-31T23:59:59Z', maxUsers: 1 };
  }
  return { key: cleanKey, plan: 'FREE', status: 'INVALID', expiryDate: null, maxUsers: 1 };
};

export const verifyLicenseKey = async (key: string): Promise<LicenseInfo> => {
  const cleanKey = key.trim().toUpperCase();
  const apiUrl = (import.meta as any).env?.VITE_LICENSE_VERIFY_API || '/api';

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        action: 'verify_license_key',
        data: { license: cleanKey }
      })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (result?.error) throw new Error(result.error);

    if (result?.data?.key) {
      return {
        key: String(result.data.key).toUpperCase(),
        plan: normalizeLicensePlan(result.data.plan),
        status: result.data.status === 'ACTIVE' ? 'ACTIVE' : result.data.status === 'EXPIRED' ? 'EXPIRED' : 'INVALID',
        expiryDate: result.data.expiryDate || '2099-12-31T23:59:59Z',
        maxUsers: result.data.maxUsers !== undefined ? Number(result.data.maxUsers) : undefined
      };
    }
  } catch (error) {
    console.warn('Server license verification unavailable, using local pattern fallback.');
  }

  return verifyLocalPattern(cleanKey);
};

export const checkLicenseStatus = (currentLicense: LicenseInfo): 'ACTIVE' | 'EXPIRED' | 'INVALID' => {
  if (currentLicense.status !== 'ACTIVE') return 'INVALID';
  if (!currentLicense.expiryDate) return 'INVALID';

  const now = new Date();
  const expiry = new Date(currentLicense.expiryDate);

  if (now > expiry) {
    return 'EXPIRED';
  }

  return 'ACTIVE';
};
