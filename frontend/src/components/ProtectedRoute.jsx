import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // While still loading, show nothing (or a minimal spinner) to avoid flicker.
  if (loading) {
    return null;
  }

  if (!isAuthenticated) {
    // Preserve the intended destination so we can redirect back after login.
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
  }

  return children;
}
