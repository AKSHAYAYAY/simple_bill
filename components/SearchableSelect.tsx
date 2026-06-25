
import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown } from 'lucide-react';

interface Option {
  id: string;
  label: string;
  subLabel?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({ 
  options, value, onChange, placeholder = "Select...", className 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.id === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  const filteredOptions = options.filter(opt => 
    opt.label.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (opt.subLabel && opt.subLabel.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <div 
        className="w-full border border-gray-300 rounded-lg shadow-sm p-3 bg-white flex justify-between items-center cursor-pointer focus-within:ring-2 focus-within:ring-blue-500 transition-all text-base"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={`truncate ${selectedOption ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={20} className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-[60] min-w-[320px] left-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl max-h-72 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-3 bg-gray-50 border-b border-gray-100">
            <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    type="text"
                    className="w-full pl-10 pr-4 py-2.5 text-base border-gray-200 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    placeholder="Search options..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    autoFocus
                />
            </div>
          </div>
          <div className="overflow-y-auto max-h-52">
            {filteredOptions.length === 0 ? (
              <div className="p-8 text-sm text-gray-400 text-center italic">No results found matching "{searchTerm}"</div>
            ) : (
              <div className="py-1">
                {filteredOptions.map(opt => (
                  <div
                    key={opt.id}
                    className={`px-4 py-3 hover:bg-blue-50 cursor-pointer transition-colors border-l-4 ${opt.id === value ? 'bg-blue-50 border-blue-500 font-bold' : 'border-transparent'}`}
                    onClick={() => {
                      onChange(opt.id);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                  >
                    <div className="text-gray-900 text-base">{opt.label}</div>
                    {opt.subLabel && <div className="text-xs text-gray-500 mt-0.5">{opt.subLabel}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
