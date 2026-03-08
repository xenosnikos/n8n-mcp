import { NodeRepository } from '../database/node-repository';
import { EnhancedConfigValidator } from './enhanced-config-validator';
export declare const VALID_CONNECTION_TYPES: Set<string>;
interface WorkflowNode {
    id: string;
    name: string;
    type: string;
    position: [number, number];
    parameters: any;
    credentials?: any;
    disabled?: boolean;
    notes?: string;
    notesInFlow?: boolean;
    typeVersion?: number;
    continueOnFail?: boolean;
    onError?: 'continueRegularOutput' | 'continueErrorOutput' | 'stopWorkflow';
    retryOnFail?: boolean;
    maxTries?: number;
    waitBetweenTries?: number;
    alwaysOutputData?: boolean;
    executeOnce?: boolean;
}
interface WorkflowConnection {
    [sourceNode: string]: {
        [outputType: string]: Array<Array<{
            node: string;
            type: string;
            index: number;
        }>>;
    };
}
interface WorkflowJson {
    name?: string;
    nodes: WorkflowNode[];
    connections: WorkflowConnection;
    settings?: any;
    staticData?: any;
    pinData?: any;
    meta?: any;
}
export interface ValidationIssue {
    type: 'error' | 'warning';
    nodeId?: string;
    nodeName?: string;
    message: string;
    details?: any;
    code?: string;
    fix?: {
        type: string;
        currentType?: string;
        suggestedType?: string;
        description?: string;
    };
}
export interface WorkflowValidationResult {
    valid: boolean;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    statistics: {
        totalNodes: number;
        enabledNodes: number;
        triggerNodes: number;
        validConnections: number;
        invalidConnections: number;
        expressionsValidated: number;
    };
    suggestions: string[];
}
export declare class WorkflowValidator {
    private nodeRepository;
    private nodeValidator;
    private currentWorkflow;
    private similarityService;
    constructor(nodeRepository: NodeRepository, nodeValidator: typeof EnhancedConfigValidator);
    validateWorkflow(workflow: WorkflowJson, options?: {
        validateNodes?: boolean;
        validateConnections?: boolean;
        validateExpressions?: boolean;
        profile?: 'minimal' | 'runtime' | 'ai-friendly' | 'strict';
    }): Promise<WorkflowValidationResult>;
    private validateWorkflowStructure;
    private validateAllNodes;
    private validateConnections;
    private validateConnectionOutputs;
    private validateErrorOutputConfiguration;
    private validateAIToolConnection;
    private validateAIToolSource;
    private getNodeOutputTypes;
    private validateNotAISubNode;
    private getShortNodeType;
    private getConditionalOutputInfo;
    private validateOutputIndexBounds;
    private validateConditionalBranchUsage;
    private validateInputIndexBounds;
    private flagOrphanedNodes;
    private validateTriggerReachability;
    private hasCycle;
    private validateExpressions;
    private countExpressionsInObject;
    private nodeHasInput;
    private checkWorkflowPatterns;
    private getLongestLinearChain;
    private generateSuggestions;
    private checkNodeErrorHandling;
    private checkWebhookErrorHandling;
    private generateErrorHandlingSuggestions;
    private validateSplitInBatchesConnection;
    private checkForLoopBack;
    private addErrorRecoverySuggestions;
}
export {};
//# sourceMappingURL=workflow-validator.d.ts.map