import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const config = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'MyNewPassword123!',
  database: 'uvuytecv_biz_1_db' // Target tenant DB
};

async function seed() {
  console.log('Connecting to database:', config.database);
  let connection;
  try {
    connection = await mysql.createConnection(config);
    console.log('Connected to MySQL successfully.');

    // 1. Seed Categories
    console.log('\n--- Seeding Categories ---');
    const categories = [
      { name: 'Gold Jewelry', desc: 'Fine ornaments crafted in 22kt and 18kt Hallmark Gold.' },
      { name: 'Silver Ornaments', desc: 'Sterling silver jewelry, utensils, and articles.' },
      { name: 'Diamond Solitaires', desc: 'Certified diamonds, rings, and high-end bridal sets.' },
      { name: 'Platinum Collection', desc: 'Modern minimalist platinum bands and jewelry.' },
      { name: 'Precious Gemstones', desc: 'Natural Rubies, Emeralds, Sapphires, and pearls.' }
    ];

    const categoryMap = new Map();
    for (const cat of categories) {
      const [existing] = await connection.execute(
        'SELECT category_id FROM categories WHERE category_name = ? AND business_id = 1',
        [cat.name]
      );
      let catId;
      if (existing.length === 0) {
        const [result] = await connection.execute(
          'INSERT INTO categories (business_id, category_name, description, is_active) VALUES (?, ?, ?, ?)',
          [1, cat.name, cat.desc, 1]
        );
        catId = result.insertId;
        console.log(`+ Added Category: ${cat.name} (ID: ${catId})`);
      } else {
        catId = existing[0].category_id;
        console.log(`Category exists: ${cat.name} (ID: ${catId})`);
      }
      categoryMap.set(cat.name, catId);
    }

    // 2. Seed Units
    console.log('\n--- Seeding Units ---');
    const units = [
      { name: 'Grams', short: 'g' },
      { name: 'Pieces', short: 'pcs' },
      { name: 'Carat', short: 'ct' },
      { name: 'Kilograms', short: 'kg' },
      { name: 'Box', short: 'box' }
    ];

    const unitMap = new Map();
    for (const unit of units) {
      const [existing] = await connection.execute(
        'SELECT unit_id FROM units WHERE short_name = ? AND business_id = 1',
        [unit.short]
      );
      let unitId;
      if (existing.length === 0) {
        const [result] = await connection.execute(
          'INSERT INTO units (business_id, unit_name, short_name) VALUES (?, ?, ?)',
          [1, unit.name, unit.short]
        );
        unitId = result.insertId;
        console.log(`+ Added Unit: ${unit.name} (${unit.short}) (ID: ${unitId})`);
      } else {
        unitId = existing[0].unit_id;
        console.log(`Unit exists: ${unit.short} (ID: ${unitId})`);
      }
      unitMap.set(unit.short, unitId);
    }

    // 3. Seed Customers
    console.log('\n--- Seeding Customers ---');
    const customers = [
      {
        name: 'Aarav Sharma',
        type: 'Retail Customer',
        phone: '9876543210',
        email: 'aarav.sharma@gmail.com',
        address: 'H-45, Rajouri Garden, New Delhi',
        gst: null,
        company: null
      },
      {
        name: 'Priya Gems & Co.',
        type: 'Wholesale Customer',
        phone: '9823456789',
        email: 'info@priyagems.com',
        address: 'G-12, Zaveri Bazaar, Mumbai',
        gst: '27AAAAA1111A1Z1',
        company: 'Priya Gems Ltd.'
      },
      {
        name: 'Rohan Mehta',
        type: 'Retail Customer',
        phone: '9911223344',
        email: 'rohan.mehta@outlook.com',
        address: 'Apt 402, Prestige Palms, Bangalore',
        gst: null,
        company: null
      },
      {
        name: 'Landmark Retail Pvt Ltd',
        type: 'Wholesale Customer',
        phone: '9811002233',
        email: 'purchasing@landmark.in',
        address: 'B-404, Ring Road Diamond Market, Surat',
        gst: '24BBBBB2222B2Z2',
        company: 'Landmark Retail Pvt Ltd.'
      },
      {
        name: 'Devendra Kumar',
        type: 'Retail Customer',
        phone: '9988776655',
        email: 'dev.kumar@yahoo.com',
        address: 'Sec-15, Noida, Uttar Pradesh',
        gst: null,
        company: null
      }
    ];

    const customerMap = new Map();
    for (const cust of customers) {
      const [existing] = await connection.execute(
        'SELECT customer_id FROM customers WHERE customer_name = ? AND business_id = 1',
        [cust.name]
      );
      let custId;
      if (existing.length === 0) {
        const [result] = await connection.execute(
          `INSERT INTO customers (
            business_id, customer_name, company_name, gst_number, customer_type, phone,
            email, address, opening_balance, opening_balance_type, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            1, cust.name, cust.company, cust.gst, cust.type, cust.phone,
            cust.email, cust.address, 0.00, 'Receivable', 1
          ]
        );
        custId = result.insertId;
        console.log(`+ Added Customer: ${cust.name} (ID: ${custId})`);
      } else {
        custId = existing[0].customer_id;
        console.log(`Customer exists: ${cust.name} (ID: ${custId})`);
      }
      customerMap.set(cust.name, custId);
    }

    // 4. Seed Suppliers
    console.log('\n--- Seeding Suppliers ---');
    const suppliers = [
      {
        name: 'Zaveri Bullion Trader',
        company: 'Zaveri Bullions Pvt Ltd',
        gst: '27CCCCCC3333C3Z3',
        phone: '9123456780',
        email: 'supply@zaveribullion.com',
        address: 'Zaveri Bazar, Mumbai',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400002'
      },
      {
        name: 'Royal Diamond Importers',
        company: 'Royal Diamonds LLC',
        gst: '24DDDDD4444D4Z4',
        phone: '9888877777',
        email: 'import@royaldiamonds.com',
        address: 'Diamond Bourse, Bandra Kurla Complex',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400051'
      },
      {
        name: 'Sterling Silver Refiners',
        company: 'Sterling Refiners Ltd',
        gst: '07EEEEE5555E5Z5',
        phone: '9777766666',
        email: 'info@sterlingsilver.in',
        address: 'Chandni Chowk, Old Delhi',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110006'
      },
      {
        name: 'Platinum Craft Works',
        company: 'Platinum Craft Co.',
        gst: '29FFFFF6666F6Z6',
        phone: '9666655555',
        email: 'support@platinumcraft.com',
        address: 'Whitefield Industrial Area',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560066'
      },
      {
        name: 'Jaipur Gemstone Wholesalers',
        company: 'Jaipur Gemstones Inc',
        gst: '08GGGGG7777G7Z7',
        phone: '9555544444',
        email: 'gems@jaipurgemstone.com',
        address: 'Johari Bazar, Jaipur',
        city: 'Jaipur',
        state: 'Rajasthan',
        pincode: '302003'
      }
    ];

    const supplierMap = new Map();
    for (const supp of suppliers) {
      const [existing] = await connection.execute(
        'SELECT supplier_id FROM suppliers WHERE supplier_name = ? AND business_id = 1',
        [supp.name]
      );
      let suppId;
      if (existing.length === 0) {
        const [result] = await connection.execute(
          `INSERT INTO suppliers (
            business_id, supplier_name, company_name, gst_number, phone, email,
            address, city, state, pincode, opening_balance, opening_balance_type, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            1, supp.name, supp.company, supp.gst, supp.phone, supp.email,
            supp.address, supp.city, supp.state, supp.pincode, 0.00, 'Payable', 1
          ]
        );
        suppId = result.insertId;
        console.log(`+ Added Supplier: ${supp.name} (ID: ${suppId})`);
      } else {
        suppId = existing[0].supplier_id;
        console.log(`Supplier exists: ${supp.name} (ID: ${suppId})`);
      }
      supplierMap.set(supp.name, suppId);
    }

    // 5. Seed Products
    console.log('\n--- Seeding Products ---');
    const products = [
      {
        name: '22kt Gold Ring',
        code: 'G-RING-001',
        catName: 'Gold Jewelry',
        unitShort: 'g',
        purchase: 5200.00,
        profit: 15.00,
        selling: 5980.00,
        stock: 120.00,
        hsn: '7113'
      },
      {
        name: 'Sterling Silver Chain',
        code: 'S-CHAIN-002',
        catName: 'Silver Ornaments',
        unitShort: 'pcs',
        purchase: 1200.00,
        profit: 25.00,
        selling: 1500.00,
        stock: 50.00,
        hsn: '7114'
      },
      {
        name: '1ct Solitaire Engagement Ring',
        code: 'D-SOL-003',
        catName: 'Diamond Solitaires',
        unitShort: 'pcs',
        purchase: 95000.00,
        profit: 20.00,
        selling: 114000.00,
        stock: 10.00,
        hsn: '7113'
      },
      {
        name: 'Platinum Love Band',
        code: 'P-BAND-004',
        catName: 'Platinum Collection',
        unitShort: 'pcs',
        purchase: 25000.00,
        profit: 18.00,
        selling: 29500.00,
        stock: 15.00,
        hsn: '7113'
      },
      {
        name: 'Natural Blue Sapphire Gem',
        code: 'GEM-SAP-005',
        catName: 'Precious Gemstones',
        unitShort: 'ct',
        purchase: 8500.00,
        profit: 30.00,
        selling: 11050.00,
        stock: 35.00,
        hsn: '7103'
      }
    ];

    const productMap = new Map();
    for (const prod of products) {
      const [existing] = await connection.execute(
        'SELECT product_id FROM products WHERE product_code = ? AND business_id = 1',
        [prod.code]
      );
      let prodId;
      const catId = categoryMap.get(prod.catName) || null;
      const unitId = unitMap.get(prod.unitShort) || null;

      if (existing.length === 0) {
        const [result] = await connection.execute(
          `INSERT INTO products (
            business_id, category_id, unit_id, product_name, product_code, barcode,
            item_description, purchase_price, profit_percentage, selling_price,
            current_stock, minimum_stock_alert, cgst_percentage, sgst_percentage,
            igst_percentage, hsn_code, allow_negative_stock, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            1, catId, unitId, prod.name, prod.code, prod.code,
            `Imported premium ${prod.name}`, prod.purchase, prod.profit, prod.selling,
            prod.stock, 5.00, 1.50, 1.50, 0.00, prod.hsn, 0, 1
          ]
        );
        prodId = result.insertId;
        console.log(`+ Added Product: ${prod.name} (ID: ${prodId})`);
      } else {
        prodId = existing[0].product_id;
        console.log(`Product exists: ${prod.name} (ID: ${prodId})`);
      }
      productMap.set(prod.code, prodId);
    }

    // 6. Seed Purchases & Purchase Items
    console.log('\n--- Seeding Purchases ---');
    const samplePurchases = [
      {
        ref: 'PUR-001',
        suppName: 'Zaveri Bullion Trader',
        date: '2026-05-01',
        items: [
          { prodCode: 'G-RING-001', qty: 20, price: 5200.00 }
        ]
      },
      {
        ref: 'PUR-002',
        suppName: 'Royal Diamond Importers',
        date: '2026-05-03',
        items: [
          { prodCode: 'D-SOL-003', qty: 5, price: 95000.00 }
        ]
      },
      {
        ref: 'PUR-003',
        suppName: 'Sterling Silver Refiners',
        date: '2026-05-05',
        items: [
          { prodCode: 'S-CHAIN-002', qty: 30, price: 1200.00 }
        ]
      },
      {
        ref: 'PUR-004',
        suppName: 'Platinum Craft Works',
        date: '2026-05-07',
        items: [
          { prodCode: 'P-BAND-004', qty: 8, price: 25000.00 }
        ]
      },
      {
        ref: 'PUR-005',
        suppName: 'Jaipur Gemstone Wholesalers',
        date: '2026-05-09',
        items: [
          { prodCode: 'GEM-SAP-005', qty: 15, price: 8500.00 }
        ]
      }
    ];

    for (const pur of samplePurchases) {
      const [existing] = await connection.execute(
        'SELECT purchase_id FROM purchases WHERE purchase_invoice_no = ? AND business_id = 1',
        [pur.ref]
      );
      if (existing.length === 0) {
        const suppId = supplierMap.get(pur.suppName);
        let subtotal = 0;

        for (const item of pur.items) {
          subtotal += item.qty * item.price;
        }
        const cgst = subtotal * 0.015;
        const sgst = subtotal * 0.015;
        const grandTotal = subtotal + cgst + sgst;

        const [pResult] = await connection.execute(
          `INSERT INTO purchases (
            business_id, supplier_id, purchase_invoice_no, supplier_invoice_no, purchase_date,
            payment_mode, transport_cost, loading_cost, other_charges, subtotal,
            total_cgst, total_sgst, total_igst, grand_total, amount_paid, payment_status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            1, suppId, pur.ref, pur.ref, pur.date,
            'Cash', 0.00, 0.00, 0.00, subtotal,
            cgst, sgst, 0.00, grandTotal, grandTotal, 'Paid', 'Bulk stock ingestion seed'
          ]
        );
        const purchaseId = pResult.insertId;
        console.log(`+ Added Purchase: ${pur.ref} (ID: ${purchaseId})`);

        for (const item of pur.items) {
          const prodId = productMap.get(item.prodCode);
          await connection.execute(
            `INSERT INTO purchase_items (
              purchase_id, product_id, quantity, free_quantity, purchase_price, selling_price,
              profit_percentage, discount_percentage, discount_amount, cgst_percentage,
              sgst_percentage, igst_percentage, total_tax, total_amount
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              purchaseId, prodId, item.qty, 0.00, item.price, item.price * 1.15,
              15.00, 0.00, 0.00, 1.50,
              1.50, 0.00, (item.qty * item.price * 0.03), (item.qty * item.price * 1.03)
            ]
          );
        }
      } else {
        console.log(`Purchase exists: ${pur.ref}`);
      }
    }

    // 7. Seed Sales & Sale Items
    console.log('\n--- Seeding Sales (Invoices) ---');
    const sampleSales = [
      {
        inv: 'INV-1001',
        custName: 'Aarav Sharma',
        date: '2026-05-10',
        items: [
          { prodCode: 'G-RING-001', qty: 2, price: 5980.00 }
        ]
      },
      {
        inv: 'INV-1002',
        custName: 'Priya Gems & Co.',
        date: '2026-05-11',
        items: [
          { prodCode: 'D-SOL-003', qty: 1, price: 114000.00 }
        ]
      },
      {
        inv: 'INV-1003',
        custName: 'Rohan Mehta',
        date: '2026-05-12',
        items: [
          { prodCode: 'S-CHAIN-002', qty: 5, price: 1500.00 },
          { prodCode: 'P-BAND-004', qty: 1, price: 29500.00 }
        ]
      },
      {
        inv: 'INV-1004',
        custName: 'Landmark Retail Pvt Ltd',
        date: '2026-05-13',
        items: [
          { prodCode: 'P-BAND-004', qty: 2, price: 29500.00 }
        ]
      },
      {
        inv: 'INV-1005',
        custName: 'Devendra Kumar',
        date: '2026-05-14',
        items: [
          { prodCode: 'GEM-SAP-005', qty: 3, price: 11050.00 }
        ]
      }
    ];

    for (const sale of sampleSales) {
      const [existing] = await connection.execute(
        'SELECT sale_id FROM sales WHERE invoice_no = ? AND business_id = 1',
        [sale.inv]
      );
      if (existing.length === 0) {
        const custId = customerMap.get(sale.custName);
        let subtotal = 0;

        for (const item of sale.items) {
          subtotal += item.qty * item.price;
        }
        const cgst = subtotal * 0.015;
        const sgst = subtotal * 0.015;
        const grandTotal = subtotal + cgst + sgst;

        const [sResult] = await connection.execute(
          `INSERT INTO sales (
            business_id, customer_id, invoice_no, invoice_date, sale_type, payment_mode,
            subtotal, total_cgst, total_sgst, total_igst, discount_amount, round_off,
            grand_total, amount_received, payment_status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            1, custId, sale.inv, sale.date, 'Normal Sale', 'Cash',
            subtotal, cgst, sgst, 0.00, 0.00, 0.00,
            grandTotal, grandTotal, 'Paid', 'Retail sale seed'
          ]
        );
        const saleId = sResult.insertId;
        console.log(`+ Added Sale: ${sale.inv} (ID: ${saleId})`);

        for (const item of sale.items) {
          const prodId = productMap.get(item.prodCode);
          await connection.execute(
            `INSERT INTO sale_items (
              sale_id, product_id, quantity, selling_price, cgst_percentage, sgst_percentage,
              igst_percentage, discount_percentage, total_tax, total_amount
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              saleId, prodId, item.qty, item.price, 1.50, 1.50,
              0.00, 0.00, (item.qty * item.price * 0.03), (item.qty * item.price * 1.03)
            ]
          );
        }
      } else {
        console.log(`Sale exists: ${sale.inv}`);
      }
    }

    // 8. Seed Payments In
    console.log('\n--- Seeding Payments In ---');
    const paymentsIn = [
      { custName: 'Aarav Sharma', amount: 10000.00, date: '2026-05-10', mode: 'Cash', notes: 'Invoice INV-1001 full payment' },
      { custName: 'Priya Gems & Co.', amount: 50000.00, date: '2026-05-11', mode: 'Bank Transfer', notes: 'Advance for diamond ring' },
      { custName: 'Rohan Mehta', amount: 25000.00, date: '2026-05-12', mode: 'Cash', notes: 'Partial pay for INV-1003' },
      { custName: 'Landmark Retail Pvt Ltd', amount: 80000.00, date: '2026-05-13', mode: 'Bank Transfer', notes: 'Direct bank transfer reference' },
      { custName: 'Devendra Kumar', amount: 30000.00, date: '2026-05-14', mode: 'Cash', notes: 'Gems purchase cash payment' }
    ];

    for (const pay of paymentsIn) {
      const custId = customerMap.get(pay.custName);
      const [existing] = await connection.execute(
        'SELECT payment_in_id FROM payment_in WHERE customer_id = ? AND amount = ? AND payment_date = ?',
        [custId, pay.amount, pay.date]
      );
      if (existing.length === 0) {
        await connection.execute(
          `INSERT INTO payment_in (business_id, customer_id, payment_date, amount, payment_mode, reference_no, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [1, custId, pay.date, pay.amount, pay.mode, `REF-IN-${Math.floor(1000 + Math.random() * 9000)}`, pay.notes]
        );
        console.log(`+ Added Payment In: ${pay.amount} from ${pay.custName}`);
      } else {
        console.log(`Payment In exists: ${pay.amount} from ${pay.custName}`);
      }
    }

    // 9. Seed Payments Out
    console.log('\n--- Seeding Payments Out ---');
    const paymentsOut = [
      { suppName: 'Zaveri Bullion Trader', amount: 100000.00, date: '2026-05-01', mode: 'Cash', notes: 'Full pay ref PUR-001' },
      { suppName: 'Royal Diamond Importers', amount: 150000.00, date: '2026-05-03', mode: 'Bank Transfer', notes: 'Solitaire buy advance payment' },
      { suppName: 'Sterling Silver Refiners', amount: 20000.00, date: '2026-05-05', mode: 'Cash', notes: 'Silver shipment bulk payout' },
      { suppName: 'Platinum Craft Works', amount: 40000.00, date: '2026-05-07', mode: 'Bank Transfer', notes: 'Purchase reference PUR-004' },
      { suppName: 'Jaipur Gemstone Wholesalers', amount: 35000.00, date: '2026-05-09', mode: 'Cash', notes: 'Sapphire raw gems payload payout' }
    ];

    for (const pay of paymentsOut) {
      const suppId = supplierMap.get(pay.suppName);
      const [existing] = await connection.execute(
        'SELECT payment_out_id FROM payment_out WHERE supplier_id = ? AND amount = ? AND payment_date = ?',
        [suppId, pay.amount, pay.date]
      );
      if (existing.length === 0) {
        await connection.execute(
          `INSERT INTO payment_out (business_id, supplier_id, payment_date, amount, payment_mode, reference_no, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [1, suppId, pay.date, pay.amount, pay.mode, `REF-OUT-${Math.floor(1000 + Math.random() * 9000)}`, pay.notes]
        );
        console.log(`+ Added Payment Out: ${pay.amount} to ${pay.suppName}`);
      } else {
        console.log(`Payment Out exists: ${pay.amount} to ${pay.suppName}`);
      }
    }

    console.log('\nSeeding completed successfully!');
  } catch (error) {
    console.error('Error during seeding:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

seed();
