import React from 'react';
import * as Icons from 'lucide-react';
import { motion } from 'framer-motion';

interface ServiceCardProps {
  title: string;
  description: string;
  iconName: keyof typeof Icons;
  route: string;
  onClick: (route: string) => void;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({
  title,
  description,
  iconName,
  route,
  onClick
}) => {
  const IconComponent = Icons[iconName] as React.ComponentType<{ size?: number; className?: string }>;

  const cardVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 100, damping: 15 } }
  };

  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ scale: 1.03, y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick(route)}
      className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100/80 hover:shadow-xl hover:border-blue-100 transition-all duration-300 cursor-pointer flex flex-col justify-between group relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-blue-500 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <div>
        <div className="p-3.5 bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 rounded-2xl w-fit mb-5 group-hover:from-blue-600 group-hover:to-indigo-600 group-hover:text-white transition-all duration-300 shadow-inner">
          {IconComponent && <IconComponent size={24} />}
        </div>
        <h4 className="text-lg font-black text-gray-900 mb-1.5 tracking-tight group-hover:text-blue-600 transition-colors">
          {title}
        </h4>
        <p className="text-gray-500 text-sm font-medium leading-relaxed">
          {description}
        </p>
      </div>

      <div className="mt-6 flex items-center text-xs font-bold text-blue-600 gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-[-8px] group-hover:translate-x-0">
        Launch service <Icons.ArrowRight size={14} />
      </div>
    </motion.div>
  );
};
