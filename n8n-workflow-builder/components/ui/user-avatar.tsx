'use client';

import { useState, useRef, useEffect } from 'react';
import { User } from '@supabase/supabase-js';

interface UserAvatarProps {
  user: User;
}

export function UserAvatar({ user }: UserAvatarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<'right' | 'left'>('right');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Check if dropdown would overflow viewport
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const dropdownWidth = 224; // w-56 = 14rem = 224px
      const viewportWidth = window.innerWidth;
      
      // If dropdown would overflow right edge, position it to the left
      if (buttonRect.right + dropdownWidth > viewportWidth - 16) {
        setDropdownPosition('left');
      } else {
        setDropdownPosition('right');
      }
    }
  }, [isOpen]);
  
  return (
    <div className="relative flex items-center" ref={dropdownRef}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-8 h-8 rounded-full hover:ring-2 hover:ring-neutral-200 dark:hover:ring-neutral-700 transition-all"
        aria-label="User menu"
        aria-expanded={isOpen}
      >
        <img
          src={user.user_metadata?.avatar_url || '/default-avatar.svg'}
          alt={user.user_metadata?.full_name || user.email || 'User'}
          className="w-8 h-8 rounded-full border border-neutral-200 dark:border-neutral-700 object-cover"
        />
      </button>
      
      {isOpen && (
        <div className={`absolute top-full mt-2 w-56 bg-white dark:bg-neutral-900 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-800 z-50 ${
          dropdownPosition === 'left' ? 'left-0' : 'right-0'
        }`}>
          <div className="p-3 border-b border-neutral-100 dark:border-neutral-800">
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              {user.user_metadata?.full_name || 'User'}
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              {user.email}
            </p>
          </div>
          
          <div className="p-1">
            <form action="/api/auth/logout" method="POST">
              <button 
                type="submit"
                className="w-full text-left px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-md transition-colors"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Logout
                </span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}