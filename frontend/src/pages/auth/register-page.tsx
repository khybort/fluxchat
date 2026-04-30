import { CircleNotchIcon, UserPlusIcon } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { register } from '@/api/auth';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/store/auth-store';

import { AuthLayout } from './auth-layout';

export const RegisterPage = (): React.JSX.Element => {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: { email: string; password: string; name?: string } = { email, password };
      if (name.trim()) payload.name = name.trim();
      const response = await register(payload);
      setSession({ token: response.token, user: response.user });
      toast.success('Account created — let’s start chatting.');
      navigate('/chat', { replace: true });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="A few details and you’re in. No credit card required."
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name (optional)</Label>
          <Input
            id="name"
            type="text"
            placeholder="Ada Lovelace"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? (
            <CircleNotchIcon className="h-4 w-4 animate-spin" weight="bold" />
          ) : (
            <>
              <UserPlusIcon className="h-4 w-4" weight="bold" />
              Create account
            </>
          )}
        </Button>
      </form>
    </AuthLayout>
  );
};
