import { ChevronLeft, Mail, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getSupabaseClient } from '../../lib/supabaseClient';

export default function ForgotPasswordPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase not configured. Using local mode.');
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (resetError) {
        throw resetError;
      }

      setSuccess(true);
      setEmail('');
    } catch (err: any) {
      setError(err?.message || 'Could not send reset email. Check your connection.');
    } finally {
      setLoading(false);
    }
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
          onClick={() => nav('/auth/sign-in')}
          aria-label="Back to sign in"
          whileHover={{ scale: 1.05, x: -4 }}
          whileTap={{ scale: 0.95 }}
        >
          <ChevronLeft size={18} />
          <span>Sign in</span>
        </motion.button>
      </motion.div>

      <motion.div 
        className="auth-card"
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        variants={containerVariants}
      >
        {success ? (
          <>
            <motion.div 
              className="auth-badge"
              variants={itemVariants}
            >
              CHECK EMAIL
            </motion.div>
            
            <motion.div variants={itemVariants}>
              <div className="auth-title">Email sent!</div>
              <div className="auth-sub">
                We've sent a password reset link to <strong>{email}</strong>. Check your inbox and follow the link to reset your password.
              </div>
            </motion.div>

            <motion.div 
              className="auth-success"
              variants={itemVariants}
            >
              <CheckCircle2 size={32} className="auth-success__icon" />
              <p className="auth-success__text">Reset link has been sent to your email address.</p>
            </motion.div>

            <motion.button 
              type="button" 
              className="auth-primary" 
              onClick={() => nav('/auth/sign-in')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              variants={itemVariants}
            >
              Back to Sign In
            </motion.button>
          </>
        ) : (
          <>
            <motion.div 
              className="auth-badge"
              variants={itemVariants}
            >
              PASSWORD RESET
            </motion.div>
            
            <motion.div variants={itemVariants}>
              <div className="auth-title">Forgot password?</div>
              <div className="auth-sub">
                Enter your email address and we'll send you a link to reset your password.
              </div>
            </motion.div>

            <motion.form 
              onSubmit={onSubmit} 
              className="auth-form"
              variants={itemVariants}
            >
              <motion.label 
                className="auth-field"
                whileHover={{ scale: 1.01 }}
              >
                <span className="auth-label">Email address</span>
                <motion.div className="auth-inputWrap">
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
                {loading ? 'Sending…' : 'Send Reset Link'}
              </motion.button>

              <motion.div 
                className="auth-footer"
                variants={itemVariants}
              >
                <span>Remember your password?</span>
                <a href="/auth/sign-in" className="auth-link">
                  Sign in
                </a>
              </motion.div>
            </motion.form>
          </>
        )}
      </motion.div>
    </div>
  );
}
