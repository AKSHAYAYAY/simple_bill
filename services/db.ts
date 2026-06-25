
import { Customer, Invoice, InvoiceStatus } from '../types';
import { SEED_DATA } from '../config';

const DB_NAME = 'SimpleBillDB';
const DB_VERSION = 1;

export const initDB = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
        console.error("IDB Error", request.error);
        reject(request.error);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('customers')) {
        const custStore = db.createObjectStore('customers', { keyPath: 'id' });
        // Seed initial data
        // @ts-ignore
        SEED_DATA.customers.forEach(c => custStore.add(c));
      }
      if (!db.objectStoreNames.contains('invoices')) {
        const invStore = db.createObjectStore('invoices', { keyPath: 'id' });
        // Seed initial data
        // @ts-ignore
        SEED_DATA.invoices.forEach(i => invStore.add(i));
      }
    };

    request.onsuccess = () => {
        resolve();
    };
  });
};

const getDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

export const db = {
    customers: {
        getAll: async (): Promise<Customer[]> => {
            const db = await getDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('customers', 'readonly');
                const store = tx.objectStore('customers');
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },
        save: async (customer: Customer): Promise<void> => {
            const db = await getDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('customers', 'readwrite');
                const store = tx.objectStore('customers');
                const request = store.put(customer); // put handles add or update
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }
    },
    invoices: {
        getAll: async (): Promise<Invoice[]> => {
             const db = await getDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('invoices', 'readonly');
                const store = tx.objectStore('invoices');
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },
        save: async (invoice: Invoice): Promise<void> => {
            const db = await getDB();
             return new Promise((resolve, reject) => {
                const tx = db.transaction('invoices', 'readwrite');
                const store = tx.objectStore('invoices');
                const request = store.put(invoice);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },
        softDelete: async (id: string): Promise<void> => {
            const db = await getDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('invoices', 'readwrite');
                const store = tx.objectStore('invoices');
                const getReq = store.get(id);
                getReq.onsuccess = () => {
                    const invoice = getReq.result;
                    if (invoice) {
                        invoice.status = InvoiceStatus.DELETED;
                        store.put(invoice).onsuccess = () => resolve();
                    } else {
                        resolve();
                    }
                };
                getReq.onerror = () => reject(getReq.error);
            });
        }
    }
}
