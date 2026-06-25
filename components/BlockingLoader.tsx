import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export const BlockingLoader: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('Please wait...');

  useEffect(() => {
    const handleShow = (e: Event) => {
      const customEvent = e as CustomEvent<{ message?: string }>;
      setMessage(customEvent.detail?.message || 'Please wait...');
      setVisible(true);
    };

    const handleHide = () => {
      setVisible(false);
    };

    window.addEventListener('simplebill:show-loader', handleShow);
    window.addEventListener('simplebill:hide-loader', handleHide);

    return () => {
      window.removeEventListener('simplebill:show-loader', handleShow);
      window.removeEventListener('simplebill:hide-loader', handleHide);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-md transition-all duration-300">
      <div className="bg-white/80 p-8 rounded-3xl border border-white/20 shadow-2xl flex flex-col items-center justify-center max-w-sm w-full mx-4 text-center animate-in zoom-in-95 duration-200">
        <div className="relative flex items-center justify-center mb-4">
          <div className="w-16 h-16 rounded-full border-4 border-blue-100 absolute"></div>
          <Loader2 className="animate-spin text-blue-600 relative" size={40} strokeWidth={2.5} />
        </div>
        <p className="text-slate-900 font-extrabold text-lg tracking-tight mb-1">{message}</p>
        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">SimpleBill Security Guard</p>
      </div>
    </div>
  );
};
export default BlockingLoader;
