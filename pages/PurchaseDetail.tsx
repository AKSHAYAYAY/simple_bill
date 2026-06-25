import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export const PurchaseDetail: React.FC = () => {
  const { purchaseId } = useParams();
  const navigate = useNavigate();
  return <div className="p-6"><button onClick={() => navigate(-1)} className="mb-4 text-blue-600">← Back</button><h1 className="text-2xl font-bold">Purchase Detail</h1><p className="text-gray-500">Purchase #{purchaseId}</p></div>;
};
