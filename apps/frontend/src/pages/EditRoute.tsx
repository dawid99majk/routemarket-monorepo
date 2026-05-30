import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export default function EditRoute() {
  const navigate = useNavigate();
  const { id } = useParams();
  
  useEffect(() => {
    // V1 wizard was removed. 
    // Redirect to creator dashboard or v2 builder.
    navigate('/creator-dashboard', { replace: true });
  }, [navigate]);
  
  return null;
}