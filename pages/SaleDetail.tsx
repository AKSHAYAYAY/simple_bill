import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export const SaleDetail: React.FC = () => {
  const { saleId } = useParams();
  const navigate = useNavigate();
  return <div className="p-6"><button onClick={() => navigate(-1)} className="mb-4 text-blue-600">← Back</button><h1 className="text-2xl font-bold">Sale Detail</h1><p className="text-gray-500">Sale #{saleId}</p></div>;
};
