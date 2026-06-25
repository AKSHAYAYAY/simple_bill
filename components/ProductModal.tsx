import React, { useState, useEffect } from 'react';
import { Product, Category, Unit } from '../types';
import { X, Info, RefreshCw, Check } from 'lucide-react';
import { getSettings } from '../services/dataService';
import { ErrorPopup } from './ErrorPopup';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: Product) => Promise<void>;
  initialProduct?: Product | null;
  categories: Category[];
  units: Unit[];
}

export const ProductModal: React.FC<ProductModalProps> = ({
  isOpen, onClose, onSave, initialProduct, categories, units
}) => {
  const settings = getSettings();
  const isNonGst = settings.gstType === 'NON_GST';

  const [currentProduct, setCurrentProduct] = useState<Product>({
    product_name: '',
    product_code: '',
    barcode: '',
    item_description: '',
    purchase_price: 0,
    profit_percentage: 0,
    selling_price: 0,
    current_stock: 0,
    minimum_stock_alert: settings.lowStockLimit !== undefined ? Number(settings.lowStockLimit) : 10,
    cgst_percentage: isNonGst ? 0 : (settings.defaultCgstRate !== undefined ? Number(settings.defaultCgstRate) : 0),
    sgst_percentage: isNonGst ? 0 : (settings.defaultSgstRate !== undefined ? Number(settings.defaultSgstRate) : 0),
    igst_percentage: isNonGst ? 0 : (settings.defaultIgstRate !== undefined ? Number(settings.defaultIgstRate) : 0),
    hsn_code: '',
    allow_negative_stock: !!settings.allowNegativeStock,
    is_active: true
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (initialProduct) {
      setCurrentProduct({ ...initialProduct });
    } else {
      const activeSettings = getSettings();
      const activeIsNonGst = activeSettings.gstType === 'NON_GST';
      setCurrentProduct({
        product_name: '',
        product_code: '',
        barcode: '',
        item_description: '',
        purchase_price: 0,
        profit_percentage: 0,
        selling_price: 0,
        current_stock: 0,
        minimum_stock_alert: activeSettings.lowStockLimit !== undefined ? Number(activeSettings.lowStockLimit) : 10,
        cgst_percentage: activeIsNonGst ? 0 : (activeSettings.defaultCgstRate !== undefined ? Number(activeSettings.defaultCgstRate) : 0),
        sgst_percentage: activeIsNonGst ? 0 : (activeSettings.defaultSgstRate !== undefined ? Number(activeSettings.defaultSgstRate) : 0),
        igst_percentage: activeIsNonGst ? 0 : (activeSettings.defaultIgstRate !== undefined ? Number(activeSettings.defaultIgstRate) : 0),
        hsn_code: '',
        allow_negative_stock: !!activeSettings.allowNegativeStock,
        is_active: true
      });
    }
    setErrors([]);
  }, [initialProduct, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors: string[] = [];
    if (!currentProduct.product_name) {
      validationErrors.push('Product Name is required');
    }
    if (!currentProduct.selling_price || currentProduct.selling_price <= 0) {
      validationErrors.push('Selling Price must be greater than zero');
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSaving(true);
    setErrors([]);
    try {
      const productToSave = {
        ...currentProduct,
        cgst_percentage: isNonGst ? 0 : currentProduct.cgst_percentage,
        sgst_percentage: isNonGst ? 0 : currentProduct.sgst_percentage,
        igst_percentage: isNonGst ? 0 : currentProduct.igst_percentage,
      };
      await onSave(productToSave);
      // Close handled by parent on success
    } catch (err: any) {
      setErrors([err.message || 'Failed to save product']);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-gray-50 rounded-3xl border border-gray-100 shadow-xl max-w-4xl w-full h-[90vh] flex flex-col animate-in zoom-in-95">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-white rounded-t-3xl shrink-0">
          <div>
            <h3 className="text-xl font-black text-gray-900">
              {currentProduct.product_id ? 'Edit Product' : 'Create New Product'}
            </h3>
            <p className="text-xs text-gray-500 font-bold mt-1">Fill out the details below to define your inventory item.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <ErrorPopup errors={errors} onClose={() => setErrors([])} />

          <form id="productForm" onSubmit={handleSubmit} className="space-y-6">
            
            {/* Basic Info */}
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
              <h4 className="text-lg font-bold text-gray-900 border-b border-gray-50 pb-2">Basic Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Product Name*</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    className="w-full border-gray-200 rounded-xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition-all font-bold text-lg"
                    placeholder="e.g. Premium White Diamond Ring"
                    value={currentProduct.product_name || ''}
                    onChange={e => setCurrentProduct({ ...currentProduct, product_name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Product Code (SKU)</label>
                  <input
                    type="text"
                    className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono"
                    placeholder="Leave blank to auto-generate"
                    value={currentProduct.product_code || ''}
                    onChange={e => setCurrentProduct({ ...currentProduct, product_code: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Barcode</label>
                  <input
                    type="text"
                    className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono"
                    placeholder="e.g. 8901234567"
                    value={currentProduct.barcode || ''}
                    onChange={e => setCurrentProduct({ ...currentProduct, barcode: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Category</label>
                  <select
                    className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none bg-white font-bold"
                    value={currentProduct.category_id || ''}
                    onChange={e => setCurrentProduct({ ...currentProduct, category_id: parseInt(e.target.value) || undefined })}
                  >
                    <option value="">Select Category...</option>
                    {categories.map(c => (
                      <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Stock Unit</label>
                  <select
                    className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none bg-white font-bold"
                    value={currentProduct.unit_id || ''}
                    onChange={e => setCurrentProduct({ ...currentProduct, unit_id: parseInt(e.target.value) || undefined })}
                  >
                    <option value="">Select Unit...</option>
                    {units.map(u => (
                      <option key={u.unit_id} value={u.unit_id}>{u.unit_name} ({u.short_name})</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Item Description</label>
                  <textarea
                    rows={3}
                    className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none text-sm"
                    placeholder="Describe item attributes..."
                    value={currentProduct.item_description || ''}
                    onChange={e => setCurrentProduct({ ...currentProduct, item_description: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Pricing Section */}
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
              <h4 className="text-lg font-bold text-gray-900 border-b border-gray-50 pb-2">Pricing & Taxes</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Purchase Price (Cost)</label>
                  <input
                    type="text" inputMode="decimal"
                    step="0.01"
                    className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono font-bold text-blue-600 bg-blue-50/20"
                    value={currentProduct.purchase_price || 0}
                    onChange={e => {
                      const cost = parseFloat(e.target.value) || 0;
                      const profit = currentProduct.profit_percentage || 0;
                      const selling = cost * (1 + profit / 100);
                      setCurrentProduct({ ...currentProduct, purchase_price: cost, selling_price: Number(selling.toFixed(2)) });
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Profit Margin (%)</label>
                  <input
                    type="text" inputMode="decimal"
                    step="0.1"
                    className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono font-bold text-emerald-600"
                    value={currentProduct.profit_percentage || 0}
                    onChange={e => {
                      const profit = parseFloat(e.target.value) || 0;
                      const cost = currentProduct.purchase_price || 0;
                      const selling = cost * (1 + profit / 100);
                      setCurrentProduct({ ...currentProduct, profit_percentage: profit, selling_price: Number(selling.toFixed(2)) });
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Selling Price (M.R.P.)</label>
                  <input
                    type="text" inputMode="decimal"
                    step="0.01"
                    className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono font-bold bg-gray-50 text-gray-900"
                    value={currentProduct.selling_price || 0}
                    onChange={e => {
                      const selling = parseFloat(e.target.value) || 0;
                      const cost = currentProduct.purchase_price || 0;
                      const profit = cost > 0 ? ((selling - cost) / cost) * 100 : 0;
                      setCurrentProduct({ ...currentProduct, selling_price: selling, profit_percentage: Number(profit.toFixed(1)) });
                    }}
                  />
                </div>

                {!isNonGst && (
                  <>
                    <div>
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">CGST (%)</label>
                      <input
                        type="text" inputMode="decimal"
                        className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono"
                        value={currentProduct.cgst_percentage || 0}
                        onChange={e => setCurrentProduct({ ...currentProduct, cgst_percentage: parseFloat(e.target.value) || 0 })}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">SGST (%)</label>
                      <input
                        type="text" inputMode="decimal"
                        className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono"
                        value={currentProduct.sgst_percentage || 0}
                        onChange={e => setCurrentProduct({ ...currentProduct, sgst_percentage: parseFloat(e.target.value) || 0 })}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">IGST (%)</label>
                      <input
                        type="text" inputMode="decimal"
                        className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono"
                        value={currentProduct.igst_percentage || 0}
                        onChange={e => setCurrentProduct({ ...currentProduct, igst_percentage: parseFloat(e.target.value) || 0 })}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">HSN Code</label>
                      <input
                        type="text"
                        className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono"
                        placeholder="e.g. 7113"
                        value={currentProduct.hsn_code || ''}
                        onChange={e => {
                          const cleaned = e.target.value.replace(/\D/g, '').substring(0, 8);
                          setCurrentProduct({ ...currentProduct, hsn_code: cleaned });
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Inventory Controls */}
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
              <h4 className="text-lg font-bold text-gray-900 border-b border-gray-50 pb-2">Stock & Alerts</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Initial Opening Stock</label>
                  <input
                    type="text"
                    disabled={!!currentProduct.product_id}
                    className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono disabled:bg-gray-50 disabled:text-gray-400"
                    placeholder="e.g. 100"
                    value={currentProduct.current_stock === undefined ? '' : currentProduct.current_stock}
                    onChange={e => {
                      const cleaned = e.target.value.replace(/\D/g, '');
                      setCurrentProduct({ ...currentProduct, current_stock: parseInt(cleaned) || 0 });
                    }}
                  />
                  {currentProduct.product_id && (
                    <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                      <Info size={12} className="text-blue-500" />
                      Opening stock is locked. Use Quick Adjust to modify.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Low Stock Alert Threshold</label>
                  <input
                    type="text"
                    className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono"
                    placeholder="e.g. 10"
                    value={currentProduct.minimum_stock_alert === undefined ? '' : currentProduct.minimum_stock_alert}
                    onChange={e => {
                      const cleaned = e.target.value.replace(/\D/g, '');
                      setCurrentProduct({ ...currentProduct, minimum_stock_alert: parseInt(cleaned) || 0 });
                    }}
                  />
                </div>

                <div className="md:col-span-2 flex items-center gap-3 p-4 bg-amber-50/50 rounded-2xl border border-amber-100">
                  <input
                    type="checkbox"
                    id="negStock"
                    className="h-5 w-5 rounded border-gray-300 text-amber-600 focus:ring-amber-500/20"
                    checked={currentProduct.allow_negative_stock || false}
                    onChange={e => setCurrentProduct({ ...currentProduct, allow_negative_stock: e.target.checked })}
                  />
                  <label htmlFor="negStock" className="text-sm font-bold text-gray-700 select-none">
                    Allow Negative Stock <span className="text-gray-400 font-medium">(Permit checkout when item quantity is 0)</span>
                  </label>
                </div>
              </div>
            </div>

          </form>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-200 bg-white rounded-b-3xl shrink-0 flex justify-end gap-3 shadow-2xl z-20 relative">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="productForm"
            disabled={saving}
            className="px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center gap-2 font-black transition-all disabled:opacity-50"
          >
            {saving ? <RefreshCw className="animate-spin" size={18} /> : <Check size={18} />}
            {currentProduct.product_id ? 'Update Product' : 'Save Product'}
          </button>
        </div>

      </div>
    </div>
  );
};
