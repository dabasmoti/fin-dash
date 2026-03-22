import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const password = inputRef.current?.value || '';
    if (!password) return;

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        navigate('/', { replace: true });
        return;
      }

      if (res.status === 429) {
        setError('Too many attempts. Please wait 15 minutes.');
      } else {
        setError('Invalid password');
      }
    } catch {
      setError('Connection failed. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">fin-dash</CardTitle>
          <CardDescription>Enter your password to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              ref={inputRef}
              type="text"
              placeholder="Password"
              autoComplete="off"
              autoFocus
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 py-1 text-base text-foreground"
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
