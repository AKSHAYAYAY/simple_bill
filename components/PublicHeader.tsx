
import React from 'react';
import { Menu, X } from 'lucide-react';
import { APP_CONFIG } from '../config';

interface PublicHeaderProps {
  activePage: string;
  onNavigate: (page: string) => void;
}

export const PublicHeader: React.FC<PublicHeaderProps> = ({ activePage, onNavigate }) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const navItems = [
    { id: 'home', label: 'Home' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'contact', label: 'Contact' },
  ];

  return (
    <nav className="bg-white border-b border-gray-100 fixed w-full top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center cursor-pointer" onClick={() => onNavigate('home')}>
              <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center mr-2">
                <span className="text-white font-bold text-lg">{APP_CONFIG.name.charAt(0)}</span>
              </div>
              <span className="font-bold text-xl text-gray-900">{APP_CONFIG.name}</span>
            </div>
          </div>
          
          {/* Desktop Menu */}
          <div className="hidden md:flex md:items-center md:space-x-8">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`text-sm font-medium transition-colors ${
                  activePage === item.id 
                    ? 'text-blue-600' 
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {item.label}
              </button>
            ))}
            <button 
                onClick={() => onNavigate('home')}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
            >
                Get Started
            </button>
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none"
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden bg-white border-b border-gray-100">
          <div className="pt-2 pb-3 space-y-1 px-4">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  setIsMenuOpen(false);
                }}
                className={`block w-full text-left px-3 py-2 rounded-md text-base font-medium ${
                   activePage === item.id
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {item.label}
              </button>
            ))}
             <button 
                onClick={() => { onNavigate('home'); setIsMenuOpen(false); }}
                className="block w-full mt-4 bg-blue-600 text-white text-center px-3 py-2 rounded-md text-base font-medium hover:bg-blue-700"
            >
                Get Started
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};
