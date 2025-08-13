/**
 * Icon preloading utilities for NodeIcon component
 * Optimizes loading performance by prefetching commonly used icons
 */

/**
 * Preload a list of node icons
 * @param iconNames Array of icon names to preload
 */
export const preloadNodeIcons = (iconNames: string[]) => {
  // Batch preload for loading screens
  iconNames.forEach(name => {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'image';
    link.type = 'image/svg+xml';
    link.href = `/demo-icons/icons/nodes/svgs/${name}.svg`;
    link.setAttribute('data-icon-preload', name);
    
    // Check if already preloaded
    const existing = document.querySelector(`link[data-icon-preload="${name}"]`);
    if (!existing) {
      document.head.appendChild(link);
    }
  });
};

/**
 * Preload commonly used node icons
 * Call this on app initialization or before loading screens
 */
export const preloadCommonNodeIcons = () => {
  // Preload frequently used icons based on common integrations
  const commonIcons = [
    // Communication
    'slack',
    'discord',
    'telegram',
    'whatsapp',
    
    // Development
    'github',
    'gitlab',
    'bitbucket',
    'jenkins',
    
    // CRM
    'salesforce',
    'hubspot',
    'pipedrive',
    'zendesk',
    
    // Project Management
    'jira',
    'notion',
    'asana',
    'trello',
    
    // Cloud & Data
    'postgres',
    'mysql',
    'mongodb',
    'supabase',
    
    // AI
    'openAi',
    'mistralAi',
    
    // Core n8n
    'n8n',
    'webhook',
    'httprequest'
  ];
  
  preloadNodeIcons(commonIcons);
};

/**
 * Preload icons by category from manifest
 * @param category Category name from manifest
 */
export const preloadNodeIconsByCategory = async (category: string) => {
  try {
    const response = await fetch('/icons-manifest.json');
    const manifest = await response.json();
    
    const categoryIcons = manifest.categories[category];
    if (categoryIcons) {
      preloadNodeIcons(categoryIcons);
    }
  } catch (error) {
    console.error('Failed to load icons manifest:', error);
  }
};

/**
 * Clear preloaded icons from DOM
 * Useful for cleanup or memory management
 */
export const clearPreloadedIcons = () => {
  const preloadedLinks = document.querySelectorAll('link[data-icon-preload]');
  preloadedLinks.forEach(link => link.remove());
};