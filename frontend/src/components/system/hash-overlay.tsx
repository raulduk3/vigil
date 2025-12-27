import React from 'react';

export function HashTextureOverlay() {
  return (
    <>
      {/* Primary dot grid - smaller, tighter */}
      <div
        aria-hidden="true"
        className="absolute inset-0 w-full h-full pointer-events-none z-[1]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='8' viewBox='0 0 8 8' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='0.5' fill='%23808080' fill-opacity='0.12'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '8px 8px',
          maskImage: `linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 10%, rgba(0,0,0,0.35) 30%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.35) 70%, rgba(0,0,0,0.7) 90%, rgba(0,0,0,1) 100%)`,
          WebkitMaskImage: `linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 10%, rgba(0,0,0,0.35) 30%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.35) 70%, rgba(0,0,0,0.7) 90%, rgba(0,0,0,1) 100%)`,
        }}
      />
      {/* Secondary dot grid - offset and slightly larger spacing */}
      <div
        aria-hidden="true"
        className="absolute inset-0 w-full h-full pointer-events-none z-[1]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='6' cy='6' r='0.4' fill='%23606060' fill-opacity='0.08'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '12px 12px',
          backgroundPosition: '3px 3px',
          maskImage: `linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 10%, rgba(0,0,0,0.35) 30%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.35) 70%, rgba(0,0,0,0.7) 90%, rgba(0,0,0,1) 100%)`,
          WebkitMaskImage: `linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 10%, rgba(0,0,0,0.35) 30%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.35) 70%, rgba(0,0,0,0.7) 90%, rgba(0,0,0,1) 100%)`,
        }}
      />
    </>
  );
}
