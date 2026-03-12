import React, { useState } from 'react';

type SmartImgProps = {
  src: string;
  alt: string;
  className?: string;
  fallbackText?: string;
  style?: React.CSSProperties;
  loading?: 'eager' | 'lazy';
  fetchPriority?: 'high' | 'low' | 'auto';
  sizes?: string;
  decoding?: 'async' | 'sync' | 'auto';
  width?: number;
  height?: number;
};

export default function SmartImg({
  src,
  alt,
  className,
  fallbackText,
  style,
  loading,
  fetchPriority,
  sizes,
  decoding,
  width,
  height,
}: SmartImgProps) {
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

  const resolvedLoading = loading ?? 'lazy';
  const resolvedDecoding = decoding ?? 'async';
  const resolvedPriority = fetchPriority ?? (resolvedLoading === 'lazy' ? 'low' : 'auto');

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      style={style}
      loading={resolvedLoading}
      decoding={resolvedDecoding}
      sizes={sizes}
      width={width}
      height={height}
      {...({ fetchpriority: resolvedPriority } as any)}
      draggable={false}
      onError={() => setOk(false)}
    />
  );
}
