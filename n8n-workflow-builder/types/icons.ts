/**
 * Icon-related type definitions for the NodeIcon component
 */

// Icon size options
export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

// Icon size map for pixel values
export const ICON_SIZE_MAP = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
  xl: 48
} as const;

// Node icon props (re-exported from component)
export type { NodeIconProps } from '@/components/ui/node-icon';

// Icon manifest structure
export interface IconManifest {
  version: string;
  totalIcons: number;
  basePath: string;
  categories: Record<string, string[]>;
  icons: IconMetadata[];
}

// Individual icon metadata
export interface IconMetadata {
  name: string;
  displayName: string;
  filename: string;
  category: string;
  variant?: 'dark' | 'light';
}

// Icon category names
export type IconCategory = 
  | 'communication'
  | 'crm'
  | 'projectManagement'
  | 'developer'
  | 'ai'
  | 'ecommerce'
  | 'marketing'
  | 'social'
  | 'analytics'
  | 'security'
  | 'finance'
  | 'storage'
  | 'content'
  | 'automation'
  | 'collaboration'
  | 'infrastructure'
  | 'support'
  | 'erp'
  | 'messaging'
  | 'other';

// Loading states for icons
export type IconLoadingState = 'idle' | 'loading' | 'loaded' | 'error';

// Icon error types
export interface IconError {
  name: string;
  message: string;
  timestamp: number;
}