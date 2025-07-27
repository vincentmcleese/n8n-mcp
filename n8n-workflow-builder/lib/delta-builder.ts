import type { WorkflowOperation } from '@/types/workflow';

/**
 * Delta Builder - Accumulates operations to be sent to the server
 * Core of the delta-based architecture for 90% token reduction
 */
export class DeltaBuilder {
  private operations: WorkflowOperation[] = [];

  /**
   * Discovery Phase Operations
   */
  discoverNode(node: { id: string; type: string; purpose: string }) {
    this.operations.push({
      type: 'discoverNode',
      node,
    });
    return this;
  }

  selectNode(nodeId: string) {
    this.operations.push({
      type: 'selectNode',
      nodeId,
    });
    return this;
  }

  deselectNode(nodeId: string) {
    this.operations.push({
      type: 'deselectNode',
      nodeId,
    });
    return this;
  }

  requestClarification(questionId: string, question: string, context: any) {
    this.operations.push({
      type: 'requestClarification',
      questionId,
      question,
      context,
    });
    return this;
  }

  clarificationResponse(questionId: string, response: string) {
    this.operations.push({
      type: 'clarificationResponse',
      questionId,
      response,
    });
    return this;
  }

  /**
   * Configuration Phase Operations
   */
  configureNode(nodeId: string, config: any) {
    this.operations.push({
      type: 'configureNode',
      nodeId,
      config,
    });
    return this;
  }

  updateNodeConfig(nodeId: string, path: string, value: any) {
    this.operations.push({
      type: 'updateNodeConfig',
      nodeId,
      path,
      value,
    });
    return this;
  }

  /**
   * Validation Phase Operations
   */
  validateNode(nodeId: string, result: { valid: boolean; errors?: any[] }) {
    this.operations.push({
      type: 'validateNode',
      nodeId,
      result,
    });
    return this;
  }

  addValidationError(nodeId: string, error: {
    field?: string;
    message: string;
    severity: 'error' | 'warning';
  }) {
    this.operations.push({
      type: 'addValidationError',
      nodeId,
      error,
    });
    return this;
  }

  /**
   * Building Phase Operations
   */
  addToWorkflow(nodeId: string, position: [number, number]) {
    this.operations.push({
      type: 'addToWorkflow',
      nodeId,
      position,
    });
    return this;
  }

  addConnection(source: string, target: string) {
    this.operations.push({
      type: 'addConnection',
      source,
      target,
    });
    return this;
  }

  updateWorkflowSettings(settings: any) {
    this.operations.push({
      type: 'updateWorkflowSettings',
      settings,
    });
    return this;
  }

  /**
   * Phase Management Operations
   */
  setPhase(phase: 'discovery' | 'configuration' | 'validation' | 'building' | 'complete') {
    this.operations.push({
      type: 'setPhase',
      phase,
    });
    return this;
  }

  completePhase(phase: 'discovery' | 'configuration' | 'validation' | 'building' | 'complete') {
    this.operations.push({
      type: 'completePhase',
      phase,
    });
    return this;
  }

  /**
   * Get accumulated operations
   */
  getOperations(): WorkflowOperation[] {
    return [...this.operations];
  }

  /**
   * Clear operations after successful apply
   */
  clear() {
    this.operations = [];
  }

  /**
   * Get operation count
   */
  count(): number {
    return this.operations.length;
  }

  /**
   * Apply operations to server
   */
  async apply(sessionId: string): Promise<{ success: boolean; error?: string }> {
    if (this.operations.length === 0) {
      return { success: true };
    }

    try {
      const response = await fetch(`/api/workflow/${sessionId}/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operations: this.operations,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message || 'Failed to apply operations' };
      }

      // Clear operations after successful apply
      this.clear();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }
}