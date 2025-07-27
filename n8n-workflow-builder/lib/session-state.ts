import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { 
  WorkflowPhase, 
  WorkflowOperation,
  ValidationError 
} from '@/types/workflow';
import { DeltaBuilder } from './delta-builder';

/**
 * Client-side workflow state management using Zustand
 * Implements the minimal client state pattern from the PRD
 */
interface WorkflowStore {
  // Session info
  sessionId: string | null;
  currentPhase: WorkflowPhase;
  
  // UI state
  selectedNodeId?: string;
  expandedSections: string[];
  isLoading: boolean;
  error: string | null;
  
  // Pending operations (delta accumulator)
  deltaBuilder: DeltaBuilder;
  
  // Last server update for UI sync
  lastServerUpdate: {
    discovered?: number;
    configured?: number;
    validated?: number;
    errors?: ValidationError[];
  };
  
  // Clarification state
  pendingClarification?: {
    questionId: string;
    question: string;
  };
  
  // Actions
  setSessionId: (sessionId: string) => void;
  setPhase: (phase: WorkflowPhase) => void;
  selectNode: (nodeId: string) => void;
  deselectNode: () => void;
  toggleSection: (sectionId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateFromServer: (update: any) => void;
  setPendingClarification: (clarification: { questionId: string; question: string } | undefined) => void;
  
  // Delta operations
  addOperation: (operation: WorkflowOperation) => void;
  applyOperations: () => Promise<{ success: boolean; error?: string }>;
  clearOperations: () => void;
  
  // Reset
  reset: () => void;
}

/**
 * Create the workflow store with Zustand
 */
export const useWorkflowStore = create<WorkflowStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    sessionId: null,
    currentPhase: 'discovery',
    selectedNodeId: undefined,
    expandedSections: [],
    isLoading: false,
    error: null,
    deltaBuilder: new DeltaBuilder(),
    lastServerUpdate: {},
    pendingClarification: undefined,
    
    // Session management
    setSessionId: (sessionId) => set({ sessionId }),
    
    setPhase: (phase) => {
      const { deltaBuilder } = get();
      deltaBuilder.setPhase(phase);
      set({ currentPhase: phase });
    },
    
    // Node selection
    selectNode: (nodeId) => {
      const { deltaBuilder } = get();
      deltaBuilder.selectNode(nodeId);
      set({ selectedNodeId: nodeId });
    },
    
    deselectNode: () => {
      const { selectedNodeId, deltaBuilder } = get();
      if (selectedNodeId) {
        deltaBuilder.deselectNode(selectedNodeId);
        set({ selectedNodeId: undefined });
      }
    },
    
    // UI state
    toggleSection: (sectionId) => set((state) => ({
      expandedSections: state.expandedSections.includes(sectionId)
        ? state.expandedSections.filter(id => id !== sectionId)
        : [...state.expandedSections, sectionId],
    })),
    
    setLoading: (loading) => set({ isLoading: loading }),
    setError: (error) => set({ error }),
    
    // Server sync
    updateFromServer: (update) => set((state) => ({
      lastServerUpdate: {
        ...state.lastServerUpdate,
        ...update,
      },
      currentPhase: update.phase || state.currentPhase,
      pendingClarification: update.pendingClarification,
    })),
    
    setPendingClarification: (clarification) => set({ pendingClarification: clarification }),
    
    // Delta operations
    addOperation: (operation) => {
      const { deltaBuilder } = get();
      // The delta builder handles the specific operation type internally
      // This is a generic way to add any operation
      switch (operation.type) {
        case 'discoverNode':
          deltaBuilder.discoverNode(operation.node);
          break;
        case 'selectNode':
          deltaBuilder.selectNode(operation.nodeId);
          break;
        case 'configureNode':
          deltaBuilder.configureNode(operation.nodeId, operation.config);
          break;
        // Add more cases as needed
      }
    },
    
    applyOperations: async () => {
      const { sessionId, deltaBuilder } = get();
      if (!sessionId) {
        return { success: false, error: 'No active session' };
      }
      
      set({ isLoading: true, error: null });
      
      const result = await deltaBuilder.apply(sessionId);
      
      if (result.success) {
        set({ isLoading: false });
      } else {
        set({ isLoading: false, error: result.error || 'Failed to apply operations' });
      }
      
      return result;
    },
    
    clearOperations: () => {
      const { deltaBuilder } = get();
      deltaBuilder.clear();
    },
    
    // Reset store
    reset: () => set({
      sessionId: null,
      currentPhase: 'discovery',
      selectedNodeId: undefined,
      expandedSections: [],
      isLoading: false,
      error: null,
      deltaBuilder: new DeltaBuilder(),
      lastServerUpdate: {},
      pendingClarification: undefined,
    }),
  }))
);

/**
 * Selector hooks for specific state slices
 */
export const useSessionId = () => useWorkflowStore((state) => state.sessionId);
export const useCurrentPhase = () => useWorkflowStore((state) => state.currentPhase);
export const useIsLoading = () => useWorkflowStore((state) => state.isLoading);
export const useError = () => useWorkflowStore((state) => state.error);
export const usePendingClarification = () => useWorkflowStore((state) => state.pendingClarification);

/**
 * Hook to get operation count
 */
export const useOperationCount = () => {
  const deltaBuilder = useWorkflowStore((state) => state.deltaBuilder);
  return deltaBuilder.count();
};