/**
 * Enhanced Test Reporter for n8n Workflow Builder
 * 
 * Generates comprehensive reports for workflow generation testing,
 * providing insights into each phase of the orchestration process.
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

interface PhaseMetrics {
  startTime: number;
  endTime: number;
  duration: number;
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
  memoryUsage?: {
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
}

interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  source: 'Orchestrator' | 'Tools' | 'MCP' | 'Claude';
  message: string;
  data?: any;
}

interface NodeInfo {
  id: string;
  type: string;
  purpose: string;
  configuration?: any;
  validationStatus?: 'valid' | 'invalid' | 'warning';
  validationErrors?: string[];
  alternatives?: string[];
  confidence?: number;
}

interface StateDelta {
  added: Record<string, any>;
  modified: Record<string, any>;
  removed: string[];
  unchanged: string[];
}

interface PhaseReport {
  name: string;
  success: boolean;
  metrics: PhaseMetrics;
  logs: LogEntry[];
  nodes: NodeInfo[];
  sessionState: any;
  stateChanges: any;
  stateDelta?: StateDelta;
  dataFlow: {
    input: any;
    output: any;
    transformations: string[];
  };
  errors?: Array<{
    type: string;
    message: string;
    resolution?: string;
    attemptNumber?: number;
  }>;
  warnings?: string[];
}

interface WorkflowTestReport {
  testName: string;
  userPrompt: string;
  sessionId: string;
  timestamp: string;
  duration: number;
  success: boolean;
  phases: {
    discovery: PhaseReport;
    configuration: PhaseReport;
    building: PhaseReport;
    validation: PhaseReport;
    documentation: PhaseReport;
  };
  summary: {
    totalNodes: number;
    totalConnections: number;
    validationAttempts: number;
    errorsFixed: number;
    stickyNotesAdded: number;
    performanceScore: number;
    qualityScore: number;
    completenessScore: number;
  };
  optimizationSuggestions: string[];
  errorPatterns: Array<{
    pattern: string;
    frequency: number;
    suggestedFix: string;
  }>;
}

export class TestReporter {
  private report: WorkflowTestReport;
  private currentPhase: keyof WorkflowTestReport['phases'] | null = null;
  private phaseStartTime: number = 0;
  private logBuffer: LogEntry[] = [];
  private previousSessionState: any = null;
  private baselineSessionState: any = null;

  constructor(testName: string, userPrompt: string, sessionId: string) {
    this.report = {
      testName,
      userPrompt,
      sessionId,
      timestamp: new Date().toISOString(),
      duration: 0,
      success: false,
      phases: {
        discovery: this.createEmptyPhaseReport('Discovery'),
        configuration: this.createEmptyPhaseReport('Configuration'),
        building: this.createEmptyPhaseReport('Building'),
        validation: this.createEmptyPhaseReport('Validation'),
        documentation: this.createEmptyPhaseReport('Documentation'),
      },
      summary: {
        totalNodes: 0,
        totalConnections: 0,
        validationAttempts: 0,
        errorsFixed: 0,
        stickyNotesAdded: 0,
        performanceScore: 0,
        qualityScore: 0,
        completenessScore: 0,
      },
      optimizationSuggestions: [],
      errorPatterns: [],
    };
  }

  private createEmptyPhaseReport(name: string): PhaseReport {
    return {
      name,
      success: false,
      metrics: {
        startTime: 0,
        endTime: 0,
        duration: 0,
      },
      logs: [],
      nodes: [],
      sessionState: {},
      stateChanges: {},
      dataFlow: {
        input: null,
        output: null,
        transformations: [],
      },
    };
  }

  // Phase Management
  startPhase(phase: keyof WorkflowTestReport['phases']) {
    this.currentPhase = phase;
    this.phaseStartTime = Date.now();
    this.logBuffer = [];
    
    this.report.phases[phase].metrics.startTime = this.phaseStartTime;
    this.report.phases[phase].metrics.memoryUsage = this.captureMemoryUsage();
    
    this.log('INFO', 'Orchestrator', `Starting ${phase} phase`);
  }

  endPhase(success: boolean, result: any) {
    if (!this.currentPhase) return;
    
    const phase = this.report.phases[this.currentPhase];
    phase.success = success;
    phase.metrics.endTime = Date.now();
    phase.metrics.duration = phase.metrics.endTime - phase.metrics.startTime;
    phase.logs = [...this.logBuffer];
    
    // Capture final memory state
    const finalMemory = this.captureMemoryUsage();
    if (phase.metrics.memoryUsage && finalMemory) {
      phase.metrics.memoryUsage = {
        heapUsed: finalMemory.heapUsed - phase.metrics.memoryUsage.heapUsed,
        heapTotal: finalMemory.heapTotal,
        external: finalMemory.external,
      };
    }
    
    this.log('INFO', 'Orchestrator', `Completed ${this.currentPhase} phase in ${phase.metrics.duration}ms`);
    this.currentPhase = null;
  }

  // Logging
  log(level: LogEntry['level'], source: LogEntry['source'], message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      data,
    };
    
    this.logBuffer.push(entry);
    
    // Also output to console with appropriate formatting
    const prefix = `[${source}]`;
    const formattedMessage = `${prefix} ${message}`;
    
    switch (level) {
      case 'ERROR':
        console.error(chalk.red(formattedMessage));
        break;
      case 'WARN':
        console.warn(chalk.yellow(formattedMessage));
        break;
      case 'DEBUG':
        if (process.env.LOG_LEVEL === 'debug') {
          console.debug(chalk.gray(formattedMessage));
        }
        break;
      default:
        console.log(chalk.cyan(formattedMessage));
    }
  }

  // Node Management
  addNode(phase: keyof WorkflowTestReport['phases'], node: NodeInfo) {
    this.report.phases[phase].nodes.push(node);
    this.log('INFO', 'Tools', `Added node: ${node.type} (${node.purpose})`);
  }

  // State Management
  updateSessionState(phase: keyof WorkflowTestReport['phases'], state: any) {
    const currentState = JSON.parse(JSON.stringify(state));
    
    // Store baseline for Discovery phase
    if (phase === 'discovery' && !this.baselineSessionState) {
      this.baselineSessionState = currentState;
      this.previousSessionState = null;
    }
    
    // Calculate delta for non-discovery phases
    if (phase !== 'discovery' && this.previousSessionState) {
      this.report.phases[phase].stateDelta = this.calculateStateDelta(
        this.previousSessionState,
        currentState
      );
    }
    
    // Store state and update previous reference
    this.report.phases[phase].sessionState = currentState;
    this.previousSessionState = currentState;
    
    this.log('DEBUG', 'Orchestrator', 'Session state updated');
  }

  // Calculate differences between two states
  private calculateStateDelta(previousState: any, currentState: any): StateDelta {
    const delta: StateDelta = {
      added: {},
      modified: {},
      removed: [],
      unchanged: []
    };

    // Helper to get all keys from nested objects
    const getAllKeys = (obj: any, prefix = ''): string[] => {
      if (!obj || typeof obj !== 'object') return [];
      const keys: string[] = [];
      for (const key in obj) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        keys.push(fullKey);
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          keys.push(...getAllKeys(obj[key], fullKey));
        }
      }
      return keys;
    };

    // Helper to get value at path
    const getValueAtPath = (obj: any, path: string): any => {
      const keys = path.split('.');
      let value = obj;
      for (const key of keys) {
        if (value === null || value === undefined) return undefined;
        value = value[key];
      }
      return value;
    };

    // Helper to set value at path in delta object
    const setValueAtPath = (obj: any, path: string, value: any) => {
      const keys = path.split('.');
      const lastKey = keys.pop()!;
      let current = obj;
      
      for (const key of keys) {
        if (!current[key]) {
          current[key] = {};
        }
        current = current[key];
      }
      current[lastKey] = value;
    };

    const prevKeys = new Set(getAllKeys(previousState));
    const currKeys = new Set(getAllKeys(currentState));

    // Find added keys
    for (const key of currKeys) {
      if (!prevKeys.has(key)) {
        const value = getValueAtPath(currentState, key);
        setValueAtPath(delta.added, key, value);
      }
    }

    // Find removed keys
    for (const key of prevKeys) {
      if (!currKeys.has(key)) {
        delta.removed.push(key);
      }
    }

    // Find modified and unchanged keys (only check top-level for simplicity)
    for (const key in currentState) {
      if (key in previousState) {
        const prevValue = previousState[key];
        const currValue = currentState[key];
        
        // Deep comparison for objects and arrays
        const prevStr = JSON.stringify(prevValue);
        const currStr = JSON.stringify(currValue);
        
        if (prevStr !== currStr) {
          delta.modified[key] = {
            old: prevValue,
            new: currValue
          };
        } else {
          delta.unchanged.push(key);
        }
      }
    }

    return delta;
  }

  captureDataFlow(phase: keyof WorkflowTestReport['phases'], input: any, output: any, transformations: string[]) {
    this.report.phases[phase].dataFlow = {
      input: JSON.parse(JSON.stringify(input)),
      output: JSON.parse(JSON.stringify(output)),
      transformations,
    };
    this.log('INFO', 'Orchestrator', `Data flow captured: ${transformations.length} transformations`);
  }

  // Error and Warning Management
  addError(phase: keyof WorkflowTestReport['phases'], error: any) {
    if (!this.report.phases[phase].errors) {
      this.report.phases[phase].errors = [];
    }
    
    this.report.phases[phase].errors.push({
      type: error.type || 'Unknown',
      message: error.message || String(error),
      resolution: error.resolution,
      attemptNumber: error.attemptNumber,
    });
    
    this.log('ERROR', 'Orchestrator', `Error in ${phase}: ${error.message || error}`);
  }

  addWarning(phase: keyof WorkflowTestReport['phases'], warning: string) {
    if (!this.report.phases[phase].warnings) {
      this.report.phases[phase].warnings = [];
    }
    
    this.report.phases[phase].warnings.push(warning);
    this.log('WARN', 'Orchestrator', warning);
  }

  // Token Usage Tracking
  trackTokenUsage(phase: keyof WorkflowTestReport['phases'], input: number, output: number) {
    this.report.phases[phase].metrics.tokenUsage = {
      input,
      output,
      total: input + output,
    };
    this.log('INFO', 'Claude', `Token usage: ${input} in, ${output} out, ${input + output} total`);
  }

  // Summary Generation
  generateSummary(workflow: any, validationReport: any) {
    this.report.summary = {
      totalNodes: workflow?.nodes?.length || 0,
      totalConnections: Object.keys(workflow?.connections || {}).length,
      validationAttempts: validationReport?.attempts || 0,
      errorsFixed: validationReport?.fixesApplied?.length || 0,
      stickyNotesAdded: workflow?.nodes?.filter((n: any) => n.type === 'n8n-nodes-base.stickyNote')?.length || 0,
      performanceScore: this.calculatePerformanceScore(),
      qualityScore: this.calculateQualityScore(),
      completenessScore: this.calculateCompletenessScore(),
    };
    
    this.generateOptimizationSuggestions();
    this.analyzeErrorPatterns();
  }

  private calculatePerformanceScore(): number {
    const totalDuration = Object.values(this.report.phases)
      .reduce((sum, phase) => sum + phase.metrics.duration, 0);
    
    // Score based on total time (lower is better)
    if (totalDuration < 5000) return 100;
    if (totalDuration < 10000) return 80;
    if (totalDuration < 20000) return 60;
    if (totalDuration < 30000) return 40;
    return 20;
  }

  private calculateQualityScore(): number {
    let score = 100;
    
    // Deduct points for errors
    const totalErrors = Object.values(this.report.phases)
      .reduce((sum, phase) => sum + (phase.errors?.length || 0), 0);
    score -= totalErrors * 10;
    
    // Deduct points for warnings
    const totalWarnings = Object.values(this.report.phases)
      .reduce((sum, phase) => sum + (phase.warnings?.length || 0), 0);
    score -= totalWarnings * 5;
    
    // Deduct points for validation attempts
    score -= (this.report.summary.validationAttempts - 1) * 15;
    
    return Math.max(0, score);
  }

  private calculateCompletenessScore(): number {
    let score = 0;
    
    // Check phase success
    Object.values(this.report.phases).forEach(phase => {
      if (phase.success) score += 20;
    });
    
    return score;
  }

  private generateOptimizationSuggestions() {
    const suggestions: string[] = [];
    
    // Check for slow phases
    Object.entries(this.report.phases).forEach(([name, phase]) => {
      if (phase.metrics.duration > 10000) {
        suggestions.push(`Consider optimizing ${name} phase (took ${phase.metrics.duration}ms)`);
      }
    });
    
    // Check for validation issues
    if (this.report.summary.validationAttempts > 2) {
      suggestions.push('High validation attempts detected. Consider improving initial node configuration.');
    }
    
    // Check for memory usage
    Object.entries(this.report.phases).forEach(([name, phase]) => {
      if (phase.metrics.memoryUsage && phase.metrics.memoryUsage.heapUsed > 100 * 1024 * 1024) {
        suggestions.push(`${name} phase used significant memory (${Math.round(phase.metrics.memoryUsage.heapUsed / 1024 / 1024)}MB)`);
      }
    });
    
    this.report.optimizationSuggestions = suggestions;
  }

  private analyzeErrorPatterns() {
    const errorMap = new Map<string, number>();
    
    Object.values(this.report.phases).forEach(phase => {
      phase.errors?.forEach(error => {
        const key = error.type;
        errorMap.set(key, (errorMap.get(key) || 0) + 1);
      });
    });
    
    this.report.errorPatterns = Array.from(errorMap.entries()).map(([pattern, frequency]) => ({
      pattern,
      frequency,
      suggestedFix: this.getSuggestedFix(pattern),
    }));
  }

  private getSuggestedFix(errorType: string): string {
    const fixes: Record<string, string> = {
      'ValidationError': 'Review node configuration requirements and ensure all required fields are set',
      'ConnectionError': 'Check node compatibility and ensure proper data flow between nodes',
      'ConfigurationError': 'Verify node parameters match expected types and formats',
      'TimeoutError': 'Consider breaking down complex workflows into smaller components',
    };
    
    return fixes[errorType] || 'Review error details and adjust workflow accordingly';
  }

  private getPreviousPhaseName(currentPhase: string): string {
    const phaseOrder = ['discovery', 'configuration', 'building', 'validation', 'documentation'];
    const currentIndex = phaseOrder.indexOf(currentPhase);
    
    if (currentIndex <= 0) {
      return 'previous';
    }
    
    return phaseOrder[currentIndex - 1];
  }

  private captureMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
    };
  }

  // Report Generation
  generateMarkdownReport(): string {
    const report: string[] = [];
    
    // Header
    report.push('# n8n Workflow Builder Test Report');
    report.push('');
    report.push(`**Test Name:** ${this.report.testName}`);
    report.push(`**Timestamp:** ${this.report.timestamp}`);
    report.push(`**Duration:** ${this.report.duration}ms`);
    report.push(`**Success:** ${this.report.success ? '✅ Yes' : '❌ No'}`);
    report.push('');
    
    // User Prompt
    report.push('## User Prompt');
    report.push('```');
    report.push(this.report.userPrompt);
    report.push('```');
    report.push('');
    
    // Session ID
    report.push(`## Session ID: \`${this.report.sessionId}\``);
    report.push('');
    
    // Phases
    Object.entries(this.report.phases).forEach(([phaseName, phase]) => {
      report.push(`## ${'='.repeat(10)} ${phase.name.toUpperCase()} PHASE ${'='.repeat(10)}`);
      report.push('');
      
      // Phase Status
      report.push(`**Status:** ${phase.success ? '✅ Success' : '❌ Failed'}`);
      report.push(`**Duration:** ${phase.metrics.duration}ms`);
      
      if (phase.metrics.tokenUsage) {
        report.push(`**Token Usage:** ${phase.metrics.tokenUsage.total} (${phase.metrics.tokenUsage.input} in / ${phase.metrics.tokenUsage.output} out)`);
      }
      
      if (phase.metrics.memoryUsage) {
        report.push(`**Memory Delta:** ${Math.round(phase.metrics.memoryUsage.heapUsed / 1024 / 1024)}MB`);
      }
      
      report.push('');
      
      // Logs
      report.push('### Logs');
      report.push('```');
      phase.logs.forEach(log => {
        report.push(`${log.timestamp} [${log.level}] [${log.source}] ${log.message}`);
      });
      report.push('```');
      report.push('');
      
      // Nodes
      if (phase.nodes.length > 0) {
        report.push('### Nodes');
        phase.nodes.forEach(node => {
          report.push(`- **${node.type}** (ID: ${node.id})`);
          report.push(`  - Purpose: ${node.purpose}`);
          if (node.confidence !== undefined) {
            report.push(`  - Confidence: ${(node.confidence * 100).toFixed(1)}%`);
          }
          if (node.validationStatus) {
            report.push(`  - Validation: ${node.validationStatus}`);
          }
          if (node.validationErrors && node.validationErrors.length > 0) {
            report.push(`  - Errors: ${node.validationErrors.join(', ')}`);
          }
        });
        report.push('');
      }
      
      // Errors and Warnings
      if (phase.errors && phase.errors.length > 0) {
        report.push('### Errors');
        phase.errors.forEach((error, i) => {
          report.push(`${i + 1}. **${error.type}**: ${error.message}`);
          if (error.resolution) {
            report.push(`   - Resolution: ${error.resolution}`);
          }
        });
        report.push('');
      }
      
      if (phase.warnings && phase.warnings.length > 0) {
        report.push('### Warnings');
        phase.warnings.forEach((warning, i) => {
          report.push(`${i + 1}. ${warning}`);
        });
        report.push('');
      }
      
      // Data Flow - Only show if it adds value beyond state changes
      const hasNonRedundantDataFlow = phase.dataFlow.input !== null || 
                                      phase.dataFlow.output !== null ||
                                      phase.dataFlow.transformations.length > 0;
      
      if (hasNonRedundantDataFlow && 
          (phaseName === 'discovery' || // Show for discovery (initial input)
           phaseName === 'validation' || // Show for validation (building result)
           JSON.stringify(phase.dataFlow.input) !== JSON.stringify(phase.sessionState))) {
        report.push('### Data Flow');
        
        if (phase.dataFlow.input !== null) {
          report.push('**Input:**');
          report.push('```json');
          report.push(JSON.stringify(phase.dataFlow.input, null, 2));
          report.push('```');
          report.push('');
        }
        
        if (phase.dataFlow.output !== null) {
          report.push('**Output:**');
          report.push('```json');
          report.push(JSON.stringify(phase.dataFlow.output, null, 2));
          report.push('```');
          report.push('');
        }
        
        if (phase.dataFlow.transformations.length > 0) {
          report.push('**Transformations:**');
          phase.dataFlow.transformations.forEach(t => {
            report.push(`- ${t}`);
          });
          report.push('');
        }
      }
      
      // Session State - Full for Discovery, Delta for others
      if (phaseName === 'discovery') {
        report.push('### Session State (Baseline)');
        report.push('```json');
        report.push(JSON.stringify(phase.sessionState, null, 2));
        report.push('```');
        report.push('');
      } else if (phase.stateDelta) {
        report.push('### Session State Changes');
        
        // Show what changed
        const hasChanges = Object.keys(phase.stateDelta.added).length > 0 ||
                          Object.keys(phase.stateDelta.modified).length > 0 ||
                          phase.stateDelta.removed.length > 0;
        
        if (hasChanges) {
          report.push(`**Changed from ${this.getPreviousPhaseName(phaseName)} phase:**`);
          report.push('');
          
          // Added fields
          if (Object.keys(phase.stateDelta.added).length > 0) {
            report.push('**Added:**');
            for (const [key, value] of Object.entries(phase.stateDelta.added)) {
              const displayValue = typeof value === 'object' ? 
                                  `${Array.isArray(value) ? `[${value.length} items]` : `{${Object.keys(value).length} fields}`}` :
                                  JSON.stringify(value);
              report.push(`- \`${key}\`: ${displayValue}`);
            }
            report.push('');
          }
          
          // Modified fields
          if (Object.keys(phase.stateDelta.modified).length > 0) {
            report.push('**Modified:**');
            for (const [key, change] of Object.entries(phase.stateDelta.modified)) {
              const oldVal = (change as any).old;
              const newVal = (change as any).new;
              
              // Format the change display
              if (typeof oldVal === 'string' && typeof newVal === 'string') {
                report.push(`- \`${key}\`: "${oldVal}" → "${newVal}"`);
              } else if (typeof oldVal === 'number' && typeof newVal === 'number') {
                report.push(`- \`${key}\`: ${oldVal} → ${newVal}`);
              } else if (Array.isArray(oldVal) && Array.isArray(newVal)) {
                report.push(`- \`${key}\`: [${oldVal.length} items] → [${newVal.length} items]`);
              } else if (typeof oldVal === 'object' && typeof newVal === 'object') {
                const oldKeys = Object.keys(oldVal || {}).length;
                const newKeys = Object.keys(newVal || {}).length;
                report.push(`- \`${key}\`: {${oldKeys} fields} → {${newKeys} fields}`);
              } else {
                report.push(`- \`${key}\`: ${JSON.stringify(oldVal)} → ${JSON.stringify(newVal)}`);
              }
            }
            report.push('');
          }
          
          // Removed fields
          if (phase.stateDelta.removed.length > 0) {
            report.push('**Removed:**');
            phase.stateDelta.removed.forEach(key => {
              report.push(`- \`${key}\``);
            });
            report.push('');
          }
          
          // Unchanged summary
          if (phase.stateDelta.unchanged.length > 0) {
            report.push(`**Unchanged (${phase.stateDelta.unchanged.length} fields):** ${phase.stateDelta.unchanged.join(', ')}`);
            report.push('');
          }
        } else {
          report.push('_No changes to session state_');
          report.push('');
        }
        
        // Option to show full state if needed for debugging
        if (process.env.SHOW_FULL_STATE === 'true') {
          report.push('<details>');
          report.push('<summary>Full Session State (Debug)</summary>');
          report.push('');
          report.push('```json');
          report.push(JSON.stringify(phase.sessionState, null, 2));
          report.push('```');
          report.push('');
          report.push('</details>');
          report.push('');
        }
      }
    });
    
    // Token Usage Report
    report.push('## Token Usage Report');
    report.push('');
    
    // Calculate total tokens from all phases
    let totalTokens = 0;
    const phaseTokens: Record<string, number> = {};
    const callDetails: Array<{phase: string, method: string, tokens: number}> = [];
    
    // Collect token data from session states
    Object.entries(this.report.phases).forEach(([phaseName, phase]) => {
      if (phase.sessionState?.tokenUsage) {
        const tokenData = phase.sessionState.tokenUsage;
        
        // Use the byPhase data if available
        if (tokenData.byPhase) {
          Object.entries(tokenData.byPhase).forEach(([p, tokens]) => {
            phaseTokens[p] = (phaseTokens[p] || 0) + (tokens as number);
            totalTokens += tokens as number;
          });
        }
        
        // Collect call details
        if (tokenData.byCalls && Array.isArray(tokenData.byCalls)) {
          callDetails.push(...tokenData.byCalls);
        }
      }
    });
    
    // If we have token data, display it
    if (totalTokens > 0 || Object.keys(phaseTokens).length > 0) {
      report.push('### Phase Breakdown');
      report.push('');
      
      // Show phase totals with percentages
      const sortedPhases = Object.entries(phaseTokens).sort((a, b) => b[1] - a[1]);
      sortedPhases.forEach(([phase, tokens]) => {
        const percentage = totalTokens > 0 ? ((tokens / totalTokens) * 100).toFixed(1) : '0.0';
        report.push(`- **${phase}**: ${tokens.toLocaleString()} tokens (${percentage}%)`);
      });
      
      report.push('');
      report.push('### Total Workflow Generation');
      report.push(`**Total Tokens Used: ${totalTokens.toLocaleString()}**`);
      report.push('');
      
      // Show per-call details if available
      if (callDetails.length > 0) {
        report.push('### Per-Call Details');
        report.push('```');
        callDetails.forEach(call => {
          report.push(`[${call.phase}] ${call.method || 'unknown'}: ${call.tokens.toLocaleString()} tokens`);
        });
        report.push('```');
        report.push('');
      }
      
      // Add cost estimate (rough estimate based on Claude pricing)
      const estimatedCost = (totalTokens / 1000000) * 3.00; // $3 per million tokens (input)
      const outputCost = (totalTokens / 1000000) * 15.00; // $15 per million tokens (output)
      report.push('### Estimated Cost');
      report.push(`- **Input tokens estimate**: $${estimatedCost.toFixed(4)}`);
      report.push(`- **Output tokens estimate**: $${outputCost.toFixed(4)}`);
      report.push(`- **Total estimate**: $${(estimatedCost + outputCost).toFixed(4)}`);
      report.push('');
      report.push('*Note: Cost estimates are approximate and based on standard Claude pricing.*');
      report.push('');
    }
    
    // Summary
    report.push('## Summary');
    report.push('');
    report.push('### Metrics');
    report.push(`- **Total Nodes:** ${this.report.summary.totalNodes}`);
    report.push(`- **Total Connections:** ${this.report.summary.totalConnections}`);
    report.push(`- **Validation Attempts:** ${this.report.summary.validationAttempts}`);
    report.push(`- **Errors Fixed:** ${this.report.summary.errorsFixed}`);
    report.push(`- **Sticky Notes Added:** ${this.report.summary.stickyNotesAdded}`);
    report.push('');
    
    report.push('### Scores');
    report.push(`- **Performance Score:** ${this.report.summary.performanceScore}/100`);
    report.push(`- **Quality Score:** ${this.report.summary.qualityScore}/100`);
    report.push(`- **Completeness Score:** ${this.report.summary.completenessScore}/100`);
    report.push('');
    
    // Error Patterns
    if (this.report.errorPatterns.length > 0) {
      report.push('### Error Patterns');
      this.report.errorPatterns.forEach(pattern => {
        report.push(`- **${pattern.pattern}** (${pattern.frequency} occurrences)`);
        report.push(`  - Suggested Fix: ${pattern.suggestedFix}`);
      });
      report.push('');
    }
    
    // Optimization Suggestions
    if (this.report.optimizationSuggestions.length > 0) {
      report.push('### Optimization Suggestions');
      this.report.optimizationSuggestions.forEach(suggestion => {
        report.push(`- ${suggestion}`);
      });
      report.push('');
    }
    
    return report.join('\n');
  }

  saveReport(outputDir: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `report-${this.report.testName.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.md`;
    const filePath = path.join(outputDir, fileName);
    
    const markdown = this.generateMarkdownReport();
    fs.writeFileSync(filePath, markdown);
    
    // Also save JSON version for programmatic analysis
    const jsonFileName = fileName.replace('.md', '.json');
    const jsonFilePath = path.join(outputDir, jsonFileName);
    fs.writeFileSync(jsonFilePath, JSON.stringify(this.report, null, 2));
    
    return filePath;
  }

  // Finalize
  finalize(success: boolean, duration: number) {
    this.report.success = success;
    this.report.duration = duration;
  }
}