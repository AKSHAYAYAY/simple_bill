import React, { useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';

interface ErrorPopupProps {
  errors: string[];
  onClose: () => void;
  title?: string;
}

export const ErrorPopup: React.FC<ErrorPopupProps> = ({ errors, onClose, title = "Please fix the following:" }) => {
  useEffect(() => {
    if (errors.length > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [errors, onClose]);

  if (!errors || errors.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className="bg-white border-l-4 border-red-500 rounded-xl shadow-2xl overflow-hidden max-w-sm w-full relative group">
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <AlertCircle className="h-5 w-5 text-red-500" />
            </div>
            <div className="flex-1 w-full">
              <h3 className="text-sm font-black text-gray-900">{title}</h3>
              <div className="mt-1">
                <ul className="text-xs text-gray-600 font-medium space-y-1 list-disc pl-4">
                  {errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="absolute top-2 right-2 p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-900 transition-colors opacity-0 group-hover:opacity-100"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
