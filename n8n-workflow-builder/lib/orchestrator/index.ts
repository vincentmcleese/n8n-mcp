// lib/orchestrator/index.ts

export { PhaseRunner, PhaseResult } from './contracts/PhaseRunner';
export { OrchestratorDeps } from './contracts/OrchestratorDeps';
export { SessionRepo } from './context/SessionRepo';
export { NodeContextService, NodeSearchResult, NodeValidationResult } from './context/NodeContextService';
export { createOrchestrator } from './createOrchestrator';

// Discovery phase exports
export { DiscoveryInput, DiscoveryOutput, ClarificationInput, DiscoveryRunnerDeps } from './contracts/discovery.types';
export { DiscoveryRunner } from './runners/discovery.runner';

// Configuration phase exports
export { ConfigurationInput, ConfigurationOutput, ConfiguredNode, ConfigurationRunnerDeps } from './contracts/configuration.types';
export { ConfigurationRunner } from './runners/configuration.runner';

// Building phase exports
export { BuildingInput, BuildingOutput, BuildingRunnerDeps } from './contracts/building.types';
export { BuildingRunner } from './runners/building.runner';

// Validation phase exports
export { ValidationInput, ValidationOutput, ValidationRunnerDeps } from './contracts/validation.types';
export { ValidationRunner } from './runners/validation.runner';

// Documentation phase exports
export { DocumentationInput, DocumentationOutput, DocumentationRunnerDeps } from './contracts/documentation.types';
export { DocumentationRunner } from './runners/documentation.runner';