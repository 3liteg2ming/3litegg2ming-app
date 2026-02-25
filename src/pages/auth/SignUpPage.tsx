import { ChevronLeft, Lock, Mail, UserRound, Gamepad2, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { TEAM_ASSETS, type TeamKey } from '../../lib/teamAssets';
import { useAuth } from '../../state/auth/AuthProvider';

const TEAM_KEYS = Object.keys(TEAM_ASSETS) as TeamKey[];

function sortTeams(a: TeamKey, b: TeamKey) {
  return TEAM_ASSETS[a].name.localeCompare(TEAM_ASSETS[b].name);
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
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await signUp({ email, password, displayName, psn, teamKey });
      nav('/members', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Could not create account');
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
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                autoComplete="new-password"
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
            {loading ? 'Creating…' : 'Create account'}
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
        </motion.form>
      </motion.div>
    </div>
  );
}
