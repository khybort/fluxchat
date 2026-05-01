import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';

import { getMe } from '@/api/auth';
import { ApiError } from '@/api/client';
import { AppShell } from '@/components/app-shell';
import { Toaster } from '@/components/ui/sonner';
import { AdminShell } from '@/pages/admin-page';
import { FlagsPanel } from '@/pages/admin/flags-panel';
import { UsersPanel } from '@/pages/admin/users-panel';
import { ChatPage } from '@/pages/chat-page';
import { LoginPage } from '@/pages/auth/login-page';
import { RegisterPage } from '@/pages/auth/register-page';
import { useAuthStore } from '@/store/auth-store';

const ProtectedRoute = ({ children }: { children: ReactNode }): React.JSX.Element => {
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);
  const clear = useAuthStore((s) => s.clear);
  const [validating, setValidating] = useState<boolean>(token !== null);

  useEffect(() => {
    if (!token) {
      setValidating(false);
      return;
    }
    let cancelled = false;
    setValidating(true);
    getMe(token)
      .then((res) => {
        if (cancelled) return;
        setUser(res.user);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          clear();
        }
      })
      .finally(() => {
        if (!cancelled) setValidating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, setUser, clear]);

  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (validating) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }
  return <>{children}</>;
};

const PublicOnlyRoute = ({ children }: { children: ReactNode }): React.JSX.Element => {
  const token = useAuthStore((s) => s.token);
  if (token) return <Navigate to="/chat" replace />;
  return <>{children}</>;
};

/**
 * Admin-only route guard. Sits inside ProtectedRoute, so by the time it
 * runs the JWT-validated user is already in the auth store. Non-admins get
 * bounced to /chat (no flash of the admin UI).
 */
const AdminRoute = ({ children }: { children: ReactNode }): React.JSX.Element => {
  const user = useAuthStore((s) => s.user);
  if (!user || user.role !== 'admin') {
    return <Navigate to="/chat" replace />;
  }
  return <>{children}</>;
};

export const App = (): React.JSX.Element => (
  <Router>
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <RegisterPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:chatId" element={<ChatPage />} />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminShell />
            </AdminRoute>
          }
        >
          <Route index element={<Navigate to="/admin/flags" replace />} />
          <Route path="flags" element={<FlagsPanel />} />
          <Route path="users" element={<UsersPanel />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
    <Toaster />
  </Router>
);
