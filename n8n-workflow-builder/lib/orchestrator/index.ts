// lib/orchestrator/index.ts

export type { PhaseRunner, PhaseResult } from './contracts/PhaseRunner';
export type { OrchestratorDeps } from './contracts/OrchestratorDeps';
export { SessionRepo } from './context/SessionRepo';
export { NodeContextService } from './context/NodeContextService';
export type { NodeSearchResult, NodeValidationResult } from './context/NodeContextService';
export { createOrchestrator } from './createOrchestrator';

// Discovery phase exports
export type { DiscoveryInput, DiscoveryOutput, ClarificationInput, DiscoveryRunnerDeps } from './contracts/discovery.types';
export { DiscoveryRunner } from './runners/discovery.runner';

// Configuration phase exports
export type { ConfigurationInput, ConfigurationOutput, ConfiguredNode, ConfigurationRunnerDeps } from './contracts/configuration.types';
export { ConfigurationRunner } from './runners/configuration.runner';

// Building phase exports
export type { BuildingInput, BuildingOutput, BuildingRunnerDeps } from './contracts/building.types';
export { BuildingRunner } from './runners/building.runner';

// Validation phase exports
export type { ValidationInput, ValidationOutput, ValidationRunnerDeps } from './contracts/validation.types';
export { ValidationRunner } from './runners/validation.runner';

// Documentation phase exports
export type { DocumentationInput, DocumentationOutput, DocumentationRunnerDeps } from './contracts/documentation.types';
export { DocumentationRunner } from './runners/documentation.runner';