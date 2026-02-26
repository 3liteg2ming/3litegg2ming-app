import { ChevronLeft, Lock, Mail, UserRound, Gamepad2, ShieldCheck, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { TEAM_ASSETS, type TeamKey } from '../../lib/teamAssets';
import { useAuth } from '../../state/auth/AuthProvider';

const TEAM_KEYS = Object.keys(TEAM_ASSETS) as TeamKey[];

function sortTeams(a: TeamKey, b: TeamKey) {
  return TEAM_ASSETS[a].name.localeCompare(TEAM_ASSETS[b].name);
}

function getPasswordStrength(password: string): 'weak' | 'fair' | 'strong' | null {
  if (!password) return null;
  const hasNumber = /\d/.test(password);
  const hasLength = password.length >= 8;
  
  if (hasLength && hasNumber) return 'strong';
  if (hasLength || hasNumber) return 'fair';
  return 'weak';
}

export default function SignUpPage() {
  const nav = useNavigate();
  const { signUp, user, loading, isSupabase } = useAuth();
  const teams = useMemo(() => TEAM_KEYS.slice().sort(sortTeams), []);

  const [displayName, setDisplayName] = useState('');
  const [psn, setPsn] = useState('');
  const [teamKey, setTeamKey] = useState<TeamKey>('collingwood');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const passwordStrength = getPasswordStrength(password);
  const passwordsMatch = password && confirmPassword && password === confirmPassword;
  const isFormValid = displayName && email && password && confirmPassword && passwordsMatch;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password strength
    if (!passwordStrength || passwordStrength === 'weak') {
      setError('Password must be at least 8 characters and include a number');
      return;
    }

    try {
      await signUp({ email, password, displayName, psn, teamKey });
      setSuccess(true);
      
      // Auto-navigate after 2 seconds if in Supabase mode (email confirmation will be shown)
      // Or navigate immediately if in local mode
      setTimeout(() => {
        if (isSupabase) {
          // With Supabase, user likely needs to confirm email
          nav('/auth/sign-in', { 
            replace: true,
            state: { message: 'Check your email to confirm your account before signing in' }
          });
        } else {
          // Local mode, just go to app
          nav('/members', { replace: true });
        }
      }, 1500);
    } catch (err: any) {
      const errMsg = err?.message || 'Could not create account. Please try again.';
      setError(errMsg);
      setSuccess(false);
    }
  }

  if (user && !loading) {
    return <Navigate to="/members" replace />;
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.15,
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
        className="auth-card auth-card--wide"
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        variants={containerVariants}
      >
        {success ? (
          <>
            <motion.div 
              className="auth-success-card"
              variants={itemVariants}
            >
              <CheckCircle2 size={40} className="auth-success-icon" />
              <div className="auth-success-title">Account Created!</div>
              <div className="auth-success-text">
                {isSupabase
                  ? 'Check your email to confirm your account, then sign in.'
                  : 'Welcome to Elite Gaming! Redirecting…'}
              </div>
            </motion.div>
          </>
        ) : (
          <>
            <motion.div 
              className="auth-badge"
              variants={itemVariants}
            >
              COACH REGISTRATION
            </motion.div>
            
            <motion.div variants={itemVariants}>
              <div className="auth-title">Create coach account</div>
              <div className="auth-sub">
                Pick your team once — we lock it in so only you can submit results for that team.
              </div>
            </motion.div>

            {!isSupabase ? (
              <motion.div 
                className="auth-note"
                variants={itemVariants}
              >
                <strong>Local mode:</strong> Supabase env vars aren't set, so this account lives on this device only.
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
                <span className="auth-label">Coach name</span>
                <motion.div className="auth-inputWrap">
                  <UserRound size={16} className="auth-icon" />
                  <input
                    className="auth-input"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Zach"
                    autoComplete="nickname"
                    required
                    disabled={loading}
                  />
                </motion.div>
              </motion.label>

              <motion.label 
                className="auth-field"
                whileHover={{ scale: 1.01 }}
              >
                <span className="auth-label">PSN (optional)</span>
                <motion.div className="auth-inputWrap">
                  <Gamepad2 size={16} className="auth-icon" />
                  <input
                    className="auth-input"
                    type="text"
                    value={psn}
                    onChange={(e) => setPsn(e.target.value)}
                    placeholder="EliteYoda10"
                    disabled={loading}
                  />
                </motion.div>
              </motion.label>

              <motion.label 
                className="auth-field"
                whileHover={{ scale: 1.01 }}
              >
                <span className="auth-label">Team</span>
                <motion.div className="auth-inputWrap">
                  <ShieldCheck size={16} className="auth-icon" />
                  <select
                    className="auth-input auth-select"
                    value={teamKey}
                    onChange={(e) => setTeamKey(e.target.value as TeamKey)}
                    disabled={loading}
                  >
                    {teams.map((k) => (
                      <option key={k} value={k}>
                        {TEAM_ASSETS[k].name}
                      </option>
                    ))}
                  </select>
                </motion.div>
                <motion.div 
                  className="auth-help"
                  variants={itemVariants}
                >
                  Locked after registration (can be changed later by admin).
                </motion.div>
              </motion.label>

              <motion.div className="auth-divider" />

              <motion.label 
                className="auth-field"
                whileHover={{ scale: 1.01 }}
              >
                <span className="auth-label">Email</span>
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
                    disabled={loading}
                  />
                </motion.div>
              </motion.label>

              <motion.label 
                className="auth-field"
                whileHover={{ scale: 1.01 }}
              >
                <span className="auth-label">Password</span>
                <motion.div className="auth-inputWrap">
                  <Lock size={16} className="auth-icon" />
                  <input
                    className="auth-input"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                    disabled={loading}
                  />
                  <motion.button
                    type="button"
                    className="auth-eye"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    disabled={loading}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </motion.button>
                </motion.div>
                {password && (
                  <motion.div 
                    className={`auth-strength-wrap auth-strength-${passwordStrength}`}
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="auth-strength-meter">
                      <div className="auth-strength-bar" />
                    </div>
                    <div className="auth-strength-text">
                      {passwordStrength === 'strong' && '✓ Strong'}
                      {passwordStrength === 'fair' && '◐ Fair'}
                      {passwordStrength === 'weak' && '✗ Weak'}
                    </div>
                  </motion.div>
                )}
              </motion.label>

              <motion.label 
                className="auth-field auth-confirm-field"
                whileHover={{ scale: 1.01 }}
              >
                <span className="auth-label">Confirm password</span>
                <motion.div className="auth-inputWrap">
                  <Lock size={16} className="auth-icon" />
                  <input
                    className="auth-input"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                    disabled={loading}
                  />
                  <motion.button
                    type="button"
                    className="auth-eye"
                    onClick={() => setShowConfirmPassword((s) => !s)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    disabled={loading}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </motion.button>
                </motion.div>
                {confirmPassword && password !== confirmPassword && (
                  <motion.div 
                    className="auth-error"
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ marginTop: 6 }}
                  >
                    Passwords don't match
                  </motion.div>
                )}
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
                disabled={loading || !isFormValid}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              >
                {loading ? (
                  <>
                    <span className="auth-button-spinner" />
                    <span style={{ marginLeft: 8 }}>Creating…</span>
                  </>
                ) : (
                  'Create account'
                )}
              </motion.button>

              <motion.div 
                className="auth-footer"
                variants={itemVariants}
              >
                <span>Already have an account?</span>
                <Link className="auth-link" to="/auth/sign-in">
                  Sign in
                </Link>
              </motion.div>

              <motion.div 
                className="auth-note"
                variants={itemVariants}
                style={{ fontSize: 11, marginTop: 8, textAlign: 'center' }}
              >
                By creating an account, you agree to coach results submitted via Elite Gaming for league use.
              </motion.div>
            </motion.form>
          </>
        )}
      </motion.div>
    </div>
  );
}
