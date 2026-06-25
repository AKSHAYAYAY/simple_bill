
export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  details?: any;
}

const LOG_STORAGE_KEY = 'simplebill_logs';
const MAX_LOGS = 100;

const SENSITIVE_KEYS = ['password', 'token', 'secret', 'apiKey', 'authorization', 'mysql', 'db'];

const redactSensitive = (payload: any): any => {
  if (payload == null) return payload;
  if (typeof payload === 'string') {
    if (payload.length > 4000) return payload.slice(0, 4000) + '...';
    return payload;
  }
  if (Array.isArray(payload)) return payload.map(redactSensitive);
  if (typeof payload === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(payload)) {
      const lower = k.toLowerCase();
      if (SENSITIVE_KEYS.some((s) => lower.includes(s))) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactSensitive(v);
      }
    }
    return out;
  }
  return payload;
};

class LogService {
  private logs: LogEntry[] = [];

  constructor() {
    this.loadLogs();
  }

  private loadLogs() {
    try {
      const stored = localStorage.getItem(LOG_STORAGE_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load logs', e);
    }
  }

  private saveLogs() {
    try {
      // Keep only the last MAX_LOGS
      if (this.logs.length > MAX_LOGS) {
        this.logs = this.logs.slice(this.logs.length - MAX_LOGS);
      }
      localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(this.logs));
    } catch (e) {
      console.error('Failed to save logs', e);
    }
  }

  public log(level: LogLevel, message: string, details?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      details: details ? redactSensitive(details instanceof Error ? { message: details.message, stack: details.stack } : details) : undefined
    };

    // Console output for dev
    const style = level === 'ERROR' ? 'color: red' : level === 'WARN' ? 'color: orange' : 'color: blue';
    console.log(`%c[${level}] ${message}`, style, details || '');

    this.logs.push(entry);
    this.saveLogs();
  }

  public info(message: string, details?: any) {
    this.log('INFO', message, details);
  }

  public warn(message: string, details?: any) {
    this.log('WARN', message, details);
  }

  public error(message: string, details?: any) {
    this.log('ERROR', message, details);
  }

  public getLogs(): LogEntry[] {
    return [...this.logs].reverse(); // Newest first
  }

  public clearLogs() {
    this.logs = [];
    localStorage.removeItem(LOG_STORAGE_KEY);
  }
}

export const Logger = new LogService();
