import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function CreateRoute() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/creator-ai-studio', { replace: true });
  }, [navigate]);
  return null;
}
