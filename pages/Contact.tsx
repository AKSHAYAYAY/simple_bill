
import React, { useState } from 'react';
import { Mail, Send, MapPin, Phone } from 'lucide-react';
import { APP_CONFIG } from '../config';
import { submitContactMessage, logClientError } from '../services/dataService';
import { Logger } from '../services/logger';

export const Contact: React.FC = () => {
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) return;

    setStatus('submitting');
    
    // Simulate async API call
    try {
      await submitContactMessage(formData.name, formData.email, formData.message, formData.subject || 'General Inquiry');
      Logger.info('Contact message submitted', { email: formData.email, subject: formData.subject || 'General Inquiry' });
      setStatus('success');
      setFormData({ name: '', email: '', subject: '', message: '' });
    } catch (err) {
      Logger.error('Contact message submission failed', err);
      await logClientError('Contact message submission failed', { error: (err as Error)?.message || 'unknown' }, 'CONTACT_PAGE');
      setStatus('error');
    }
  };

  return (
    <div className="bg-gray-50 min-h-[calc(100vh-64px)] py-12 px-4 sm:px-6 lg:px-8">
       <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-gray-900">Get in touch</h2>
            <p className="mt-4 text-lg text-gray-500">
                Have questions about our enterprise plans or need support? We're here to help.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
             {/* Contact Info */}
             <div className="bg-white rounded-2xl shadow-sm p-8 border border-gray-100">
                <h3 className="text-xl font-bold text-gray-900 mb-6">Contact Information</h3>
                <div className="space-y-6">
                    <div className="flex items-start gap-4">
                        <div className="bg-blue-100 p-3 rounded-lg text-blue-600">
                            <Mail size={24} />
                        </div>
                        <div>
                            <p className="font-medium text-gray-900">Email Us</p>
                            <p className="text-gray-500">{APP_CONFIG.contact.email}</p>
                            <p className="text-gray-500">{APP_CONFIG.contact.salesEmail}</p>
                        </div>
                    </div>
                     <div className="flex items-start gap-4">
                        <div className="bg-green-100 p-3 rounded-lg text-green-600">
                            <Phone size={24} />
                        </div>
                        <div>
                            <p className="font-medium text-gray-900">Call Us</p>
                            <p className="text-gray-500">{APP_CONFIG.contact.phone}</p>
                            <p className="text-xs text-gray-400">{APP_CONFIG.contact.hours}</p>
                        </div>
                    </div>
                     <div className="flex items-start gap-4">
                        <div className="bg-purple-100 p-3 rounded-lg text-purple-600">
                            <MapPin size={24} />
                        </div>
                        <div>
                            <p className="font-medium text-gray-900">Office</p>
                            <p className="text-gray-500">{APP_CONFIG.company.address}</p>
                            <p className="text-gray-500">{APP_CONFIG.company.city}, {APP_CONFIG.company.state} {APP_CONFIG.company.zip}</p>
                        </div>
                    </div>
                </div>
             </div>

             {/* Form */}
             <div className="bg-white rounded-2xl shadow-sm p-8 border border-gray-100">
                 {status === 'success' ? (
                     <div className="h-full flex flex-col items-center justify-center text-center py-12">
                         <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                             <Send className="text-green-600" size={32} />
                         </div>
                         <h3 className="text-2xl font-bold text-gray-900">Message Sent!</h3>
                         <p className="text-gray-500 mt-2">Thank you for reaching out. We'll get back to you within 24 hours.</p>
                         <button 
                            onClick={() => setStatus('idle')}
                            className="mt-6 text-blue-600 font-medium hover:text-blue-700"
                         >
                            Send another message
                         </button>
                     </div>
                 ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                            <input 
                                required
                                type="text"
                                className="w-full border-gray-300 rounded-lg p-3 border focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                placeholder="John Doe"
                                value={formData.name}
                                onChange={e => setFormData({...formData, name: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                            <input 
                                required
                                type="email"
                                className="w-full border-gray-300 rounded-lg p-3 border focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                placeholder="john@example.com"
                                value={formData.email}
                                onChange={e => setFormData({...formData, email: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                            <input
                                type="text"
                                className="w-full border-gray-300 rounded-lg p-3 border focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                placeholder="Support / Demo / Pricing"
                                value={formData.subject}
                                onChange={e => setFormData({...formData, subject: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                            <textarea 
                                required
                                rows={4}
                                className="w-full border-gray-300 rounded-lg p-3 border focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                placeholder="How can we help you?"
                                value={formData.message}
                                onChange={e => setFormData({...formData, message: e.target.value})}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={status === 'submitting'}
                            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {status === 'submitting' ? (
                                <span className="animate-pulse">Sending...</span>
                            ) : (
                                <>
                                    <Send size={18} /> Send Message
                                </>
                            )}
                        </button>
                    </form>
                 )}
             </div>
          </div>
       </div>
    </div>
  );
};
