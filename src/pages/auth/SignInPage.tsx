import { Eye, EyeOff, Lock, Mail, ChevronLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../state/auth/AuthProvider';

function cn(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(' ');
}

export default function SignInPage() {
  const nav = useNavigate();
  const location = useLocation() as any;
  const { signIn, user, loading, isSupabase } = useAuth();
  const redirectTo = useMemo(() => location?.state?.from || '/members', [location]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await signIn({ email, password });
      nav(redirectTo, { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Could not sign in');
    }
  }

  // If already signed in, bounce to members
  if (user && !loading) {
    return <Navigate to="/members" replace />;
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  return (
    <div className="auth-screen">
      <motion.div 
        className="auth-top"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <motion.button 
          type="button" 
          className="auth-back" 
          onClick={() => nav('/')}
          aria-label="Back to home"
          whileHover={{ scale: 1.05, x: -4 }}
          whileTap={{ scale: 0.95 }}
        >
          <ChevronLeft size={18} />
          <span>Home</span>
        </motion.button>
      </motion.div>

      <motion.div 
        className="auth-card"
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        variants={containerVariants}
      >
        <motion.div 
          className="auth-badge"
          variants={itemVariants}
        >
          COACH ACCESS
        </motion.div>
        
        <motion.div variants={itemVariants}>
          <div className="auth-title">Sign in</div>
          <div className="auth-sub">
            Coaches only — this links your account to your team so only you can submit results.
          </div>
        </motion.div>

        {!isSupabase ? (
          <motion.div 
            className="auth-note"
            variants={itemVariants}
          >
            <strong>Local mode:</strong> Supabase env vars aren't set, so sign-in is stored on this device only.
          </motion.div>
        ) : null}

        <motion.form 
          onSubmit={onSubmit} 
          className="auth-form"
          variants={itemVariants}
        >
          <motion.label 
            className="auth-field"
            whileHover={{ scale: 1.01 }}
          >
            <span className="auth-label">Email</span>
            <motion.div 
              className="auth-inputWrap"
              whileFocus={{ borderColor: 'rgba(245,196,0,0.4)' }}
            >
              <Mail size={16} className="auth-icon" />
              <input
                className="auth-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="coach@email.com"
                autoComplete="email"
                required
              />
            </motion.div>
          </motion.label>

          <motion.label 
            className="auth-field"
            whileHover={{ scale: 1.01 }}
          >
            <span className="auth-label">Password</span>
            <motion.div 
              className="auth-inputWrap"
              whileFocus={{ borderColor: 'rgba(245,196,0,0.4)' }}
            >
              <Lock size={16} className="auth-icon" />
              <input
                className="auth-input"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <motion.button
                type="button"
                className={cn('auth-eye', show && 'active')}
                onClick={() => setShow((s) => !s)}
                aria-label={show ? 'Hide password' : 'Show password'}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </motion.button>
            </motion.div>
          </motion.label>

          {error ? (
            <motion.div 
              className="auth-error"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {error}
            </motion.div>
          ) : null}

          <motion.button 
            type="submit" 
            className="auth-primary" 
            disabled={loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </motion.button>

          <motion.div 
            className="auth-footer"
            variants={itemVariants}
          >
            <span>New coach?</span>
            <Link className="auth-link" to="/auth/sign-up">
              Create account
            </Link>
          </motion.div>
        </motion.form>
      </motion.div>
    </div>
  );
}
