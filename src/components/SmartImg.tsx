import React, { useState } from 'react';

export default function SmartImg({
  src,
  alt,
  className,
  fallbackText,
  style,
  loading,
}: {
  src: string;
  alt: string;
  className?: string;
  fallbackText?: string;
  style?: React.CSSProperties;
  loading?: 'eager' | 'lazy';
}) {
  const [ok, setOk] = useState(true);

  if (!ok) {
    return (
      <div
        className={className}
        aria-label={alt}
        style={{ display: 'grid', placeItems: 'center', ...style }}
      >
        <div style={{ fontWeight: 950, opacity: 0.85, fontSize: 12 }}>
          {fallbackText ?? 'EG'}
        </div>
      </div>
    );
  }

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      style={style}
      loading={loading}
      onError={() => setOk(false)}
    />
  );
}
