import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function CreateRoute() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/route-builder-v2', { replace: true });
  }, [navigate]);
  return null;
}
