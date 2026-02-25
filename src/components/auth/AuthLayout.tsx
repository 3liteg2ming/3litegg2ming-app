import React from 'react';
import { motion } from 'framer-motion';

interface AuthLayoutProps {
  children: React.ReactNode;
  /** Optional back button element (e.g., back to home or previous page) */
  backButton?: React.ReactNode;
  /** Show subtle logo/branding area at top of card */
  showLogo?: boolean;
}

/**
 * Premium Auth Layout - shared wrapper for Sign In, Sign Up, Forgot Password
 * Features:
 * - Dark Elite Gaming gradient background with subtle radial tints
 * - Glassmorphic card with gold accent
 * - Framer Motion entrance animations
 * - Responsive mobile-first design
 */
export function AuthLayout({
  children,
  backButton,
  showLogo = false,
}: AuthLayoutProps) {
  return (
    <div className="auth-screen">
      {/* Back button area */}
      {backButton && (
        <motion.div 
          className="auth-top"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          {backButton}
        </motion.div>
      )}

      {/* Main card with premium glass effect */}
      <motion.div 
        className="auth-card"
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        {/* Optional logo/branding section */}
        {showLogo && (
          <motion.div 
            className="auth-logo-section"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            <div className="auth-logo">🏆</div>
            <div className="auth-logo-text">Elite Gaming</div>
          </motion.div>
        )}

        {/* Content passed in from child page */}
        {children}
      </motion.div>
    </div>
  );
}
