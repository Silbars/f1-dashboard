import { Navigate, Outlet } from 'react-router';
import { useMe } from '../lib/useMe';
import { Loading } from './States';

/** Lets the nested routes render only for a logged-in viewer; everyone else goes to the login page. */
export function RequireAuth() {
  const me = useMe();
  if (me.isPending) return <Loading />;
  if (!me.data) return <Navigate to="/login" replace />;
  return <Outlet />;
}
