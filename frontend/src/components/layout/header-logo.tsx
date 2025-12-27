'use client';

import Link from 'next/link';
import Image from 'next/image';

interface HeaderLogoProps {
  /** Size variant - 'default' matches the standard header size */
  size?: 'default';
}

export function HeaderLogo({ size = 'default' }: HeaderLogoProps) {
  return (
    <Link 
      href="/" 
      className="flex items-center gap-2.5 sm:gap-3 hover:opacity-80 transition-opacity flex-shrink-0"
    >
      <Image 
        src="/logo.svg" 
        alt="Vigil" 
        width={52} 
        height={52} 
        className="w-11 h-11 sm:w-[52px] sm:h-[52px]"
        priority
      />
      <span className="font-display font-bold text-2xl sm:text-[1.75rem] md:text-[2rem] text-gray-900">
        Vigil
      </span>
    </Link>
  );
}
