import React from 'react';
import { motion } from 'framer-motion';

interface AuthLayoutProps {
  children: React.ReactNode;
  /** Optional back button element (e.g., back to home or previous page) */
  backButton?: React.ReactNode;
  /** Show subtle logo/branding area at top of card */
  showLogo?: boolean;
  /** Optional class to apply to the card (e.g. auth-card--signup) */
  cardModifier?: string;
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
  cardModifier = '',
}: AuthLayoutProps) {
  return (
    <div className="auth-screen auth-screen--premium">
      <motion.div 
        className="auth-layout-container"
        initial={{ opacity: 0, y: 15, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
      >
        {/* Back button area */}
        {backButton && (
          <div className="auth-top auth-top--premium">
            {backButton}
          </div>
        )}

        {/* Main card with premium glass effect */}
        <div className={`auth-card auth-card--premium ${cardModifier}`}>
          {/* Optional logo/branding section */}
          {showLogo && (
            <div className="auth-logo-section">
              <div className="auth-logo">🏆</div>
              <div className="auth-logo-text">Elite Gaming</div>
            </div>
          )}

          {/* Content passed in from child page */}
          {children}
        </div>
      </motion.div>
    </div>
  );
}