
import React from 'react';
import { Check, X } from 'lucide-react';
import { APP_CONFIG } from '../config';

interface PricingProps {
    onSelectPlan: (plan: string) => void;
}

export const Pricing: React.FC<PricingProps> = ({ onSelectPlan }) => {
  return (
    <div className="bg-gray-50 py-12 sm:px-6 lg:px-8 min-h-[calc(100vh-64px)] flex flex-col justify-center">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-xl text-gray-600 max-w-2xl mx-auto">
            Choose the plan that fits your business needs. All plans include our core invoicing features.
          </p>
        </div>

        <div className="mt-16 space-y-12 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-x-8">
          {APP_CONFIG.pricing.map((plan) => (
            <div 
                key={plan.name} 
                className={`relative p-8 bg-white border rounded-2xl shadow-sm flex flex-col ${plan.popular ? 'border-blue-500 ring-2 ring-blue-500 scale-105 z-10' : 'border-gray-200'}`}
            >
              {plan.popular && (
                  <div className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2">
                      <span className="inline-flex rounded-full bg-blue-600 px-4 py-1 text-sm font-semibold tracking-wide text-white uppercase">
                        Most Popular
                      </span>
                  </div>
              )}
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-gray-900">{plan.name}</h3>
                <p className="mt-4 flex items-baseline text-gray-900">
                  <span className="text-4xl font-extrabold tracking-tight">{plan.price}</span>
                </p>
                <p className="mt-6 text-gray-500">{plan.description}</p>

                <ul className="mt-6 space-y-4">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex">
                      <Check className="flex-shrink-0 w-5 h-5 text-green-500" />
                      <span className="ml-3 text-gray-500">{feature}</span>
                    </li>
                  ))}
                  {plan.notIncluded.map((feature) => (
                    <li key={feature} className="flex text-gray-300">
                      <X className="flex-shrink-0 w-5 h-5" />
                      <span className="ml-3">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => onSelectPlan(plan.name)}
                className={`mt-8 block w-full py-3 px-6 border border-transparent rounded-md text-center font-medium ${
                    plan.popular 
                    ? 'bg-blue-600 text-white hover:bg-blue-700' 
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                {plan.buttonText}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
