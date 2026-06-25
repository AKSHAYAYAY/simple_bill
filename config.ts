
import { InvoiceStatus } from './types';

export const APP_CONFIG = {
  name: "SimpleBill",
  tagline: "The professional SaaS invoicing solution",
  copyright: "© 2024 BizByTech Solutions. All rights reserved.",
  company: {
     name: "BizByTech Solutions",
     address: "Support Hub, Innovation Park",
     city: "Mumbai",
     state: "MH",
     zip: "400001",
  },
  mysqlDefaults: {
    host: "103.191.208.202",
    database: "uvuytecv_simplebill",
    user: "uvuytecv_simplebilladm",
    password: "simple.bill.adm"
  },
  contact: {
    email: "support@bizbytech.in",
    salesEmail: "sales@bizbytech.in",
    phone: "+91 99999 99999", 
    hours: "Mon-Sat 10am-7pm IST"
  },
  branding: {
    footerText: "SaaS Platform Copyright © BizByTech Solutions",
    supportText: "Need assistance? Email support@bizbytech.in"
  },
  license: {
    freePrefix: "SB-FREE-",
    proPrefix: "SB-PRO-",
    entPrefix: "SB-ENT-",
  },
  pricing: [
    {
      name: 'Starter',
      price: 'Free',
      description: 'Perfect for testing and freelancers just starting out.',
      features: [
        'Local Browser Storage',
        'Up to 5 Invoices/mo',
        'Basic PDF Export',
        'Email Support'
      ],
      notIncluded: [
        'Cloud Sync',
        'Custom Branding',
        'Tax Partitioning'
      ],
      buttonText: 'Get Started',
      popular: false
    },
    {
      name: 'Pro',
      price: '$9/mo',
      description: 'For growing businesses needing cloud sync and branding.',
      features: [
        'SaaS Cloud Database',
        'Unlimited Invoices',
        'Custom Logo & Branding',
        'Priority Support',
        'Multi-device Sync'
      ],
      notIncluded: [
        'Dedicated API Access'
      ],
      buttonText: 'Start Free Trial',
      popular: true
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      description: 'For large teams requiring custom integrations.',
      features: [
        'Dedicated Table Prefix',
        'Custom API Integrations',
        'Account Manager',
        'Audit & Login Logs',
        'SLA Support'
      ],
      notIncluded: [],
      buttonText: 'Contact Sales',
      popular: false
    }
  ]
};

export const SEED_DATA = {
    customers: [
        { id: '1', name: 'Acme Corp', email: 'contact@acme.com', address: '123 Acme Way', phone: '555-0101', type: 'Business', gstin: '27AAAAA0000A1Z5' },
        { id: '2', name: 'John Doe', email: 'john@gmail.com', address: '456 Suburb Ln', phone: '555-0102', type: 'Retail', gstin: '' },
    ],
    invoices: [
        { 
            id: '1001', customerId: '1', date: '2023-10-01', dueDate: '2023-10-31', 
            items: [{ id: 'i1', description: 'Consulting', quantity: 10, price: 150, taxRate: 5, discount: 50 }], 
            subtotal: 1450, tax: 72.5, total: 1522.5, status: InvoiceStatus.PAID, notes: 'Paid via Wire',
            overallDiscount: 0, packingCharges: 0, freightCharges: 0
        },
        { 
            id: '1002', customerId: '1', date: '2023-11-01', dueDate: '2023-11-30', 
            items: [{ id: 'i2', description: 'Web Dev', quantity: 20, price: 100, taxRate: 5, discount: 0 }], 
            subtotal: 2000, tax: 100, total: 2150, status: InvoiceStatus.OVERDUE, notes: '',
            overallDiscount: 0, packingCharges: 50, freightCharges: 100
        },
        { 
            id: '1003', customerId: '2', date: '2024-05-15', dueDate: '2024-06-15', 
            items: [{ id: 'i3', description: 'SEO Audit', quantity: 1, price: 500, taxRate: 10, discount: 0 }], 
            subtotal: 500, tax: 50, total: 530, status: InvoiceStatus.SENT, notes: '',
            overallDiscount: 20, packingCharges: 0, freightCharges: 0
        },
    ]
};
