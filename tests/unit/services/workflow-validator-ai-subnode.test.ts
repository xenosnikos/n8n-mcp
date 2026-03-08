import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowValidator } from '@/services/workflow-validator';
import { NodeRepository } from '@/database/node-repository';
import { EnhancedConfigValidator } from '@/services/enhanced-config-validator';

// Mock dependencies
vi.mock('@/database/node-repository');
vi.mock('@/services/enhanced-config-validator');
vi.mock('@/services/expression-validator');
vi.mock('@/utils/logger');

describe('WorkflowValidator - AI Sub-Node Main Connection Detection', () => {
  let validator: WorkflowValidator;
  let mockNodeRepository: NodeRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    mockNodeRepository = new NodeRepository({} as any) as any;

    if (!mockNodeRepository.getAllNodes) {
      mockNodeRepository.getAllNodes = vi.fn();
    }
    if (!mockNodeRepository.getNode) {
      mockNodeRepository.getNode = vi.fn();
    }

    const nodeTypes: Record<string, any> = {
      'nodes-base.manualTrigger': {
        type: 'nodes-base.manualTrigger',
        displayName: 'Manual Trigger',
        package: 'n8n-nodes-base',
        isTrigger: true,
        outputs: ['main'],
        properties: [],
      },
      'nodes-base.set': {
        type: 'nodes-base.set',
        displayName: 'Set',
        package: 'n8n-nodes-base',
        outputs: ['main'],
        properties: [],
      },
      'nodes-langchain.lmChatGoogleGemini': {
        type: 'nodes-langchain.lmChatGoogleGemini',
        displayName: 'Google Gemini Chat Model',
        package: '@n8n/n8n-nodes-langchain',
        outputs: ['ai_languageModel'],
        properties: [],
      },
      'nodes-langchain.memoryBufferWindow': {
        type: 'nodes-langchain.memoryBufferWindow',
        displayName: 'Window Buffer Memory',
        package: '@n8n/n8n-nodes-langchain',
        outputs: ['ai_memory'],
        properties: [],
      },
      'nodes-langchain.embeddingsOpenAi': {
        type: 'nodes-langchain.embeddingsOpenAi',
        displayName: 'Embeddings OpenAI',
        package: '@n8n/n8n-nodes-langchain',
        outputs: ['ai_embedding'],
        properties: [],
      },
      'nodes-langchain.agent': {
        type: 'nodes-langchain.agent',
        displayName: 'AI Agent',
        package: '@n8n/n8n-nodes-langchain',
        isAITool: true,
        outputs: ['main'],
        properties: [],
      },
      'nodes-langchain.openAi': {
        type: 'nodes-langchain.openAi',
        displayName: 'OpenAI',
        package: '@n8n/n8n-nodes-langchain',
        outputs: ['main'],
        properties: [],
      },
      'nodes-langchain.textClassifier': {
        type: 'nodes-langchain.textClassifier',
        displayName: 'Text Classifier',
        package: '@n8n/n8n-nodes-langchain',
        outputs: ['={{}}'], // Dynamic expression-based outputs
        properties: [],
      },
      'nodes-langchain.vectorStoreInMemory': {
        type: 'nodes-langchain.vectorStoreInMemory',
        displayName: 'In-Memory Vector Store',
        package: '@n8n/n8n-nodes-langchain',
        outputs: ['={{$parameter["mode"] === "retrieve" ? "main" : "ai_vectorStore"}}'],
        properties: [],
      },
    };

    vi.mocked(mockNodeRepository.getNode).mockImplementation((nodeType: string) => {
      return nodeTypes[nodeType] || null;
    });
    vi.mocked(mockNodeRepository.getAllNodes).mockReturnValue(Object.values(nodeTypes));

    validator = new WorkflowValidator(
      mockNodeRepository,
      EnhancedConfigValidator as any
    );
  });

  function makeWorkflow(sourceType: string, sourceName: string, connectionKey: string = 'main') {
    return {
      nodes: [
        { id: '1', name: 'Manual Trigger', type: 'n8n-nodes-base.manualTrigger', position: [0, 0], parameters: {} },
        { id: '2', name: sourceName, type: sourceType, position: [200, 0], parameters: {} },
        { id: '3', name: 'Set', type: 'n8n-nodes-base.set', position: [400, 0], parameters: {} },
      ],
      connections: {
        'Manual Trigger': {
          main: [[{ node: sourceName, type: 'main', index: 0 }]]
        },
        [sourceName]: {
          [connectionKey]: [[{ node: 'Set', type: connectionKey, index: 0 }]]
        }
      }
    };
  }

  it('should flag LLM node (lmChatGoogleGemini) connected via main', async () => {
    const workflow = makeWorkflow(
      'n8n-nodes-langchain.lmChatGoogleGemini',
      'Google Gemini'
    );

    const result = await validator.validateWorkflow(workflow as any);

    const error = result.errors.find(e => e.code === 'AI_SUBNODE_MAIN_CONNECTION');
    expect(error).toBeDefined();
    expect(error!.message).toContain('ai_languageModel');
    expect(error!.message).toContain('AI sub-node');
    expect(error!.nodeName).toBe('Google Gemini');
  });

  it('should flag memory node (memoryBufferWindow) connected via main', async () => {
    const workflow = makeWorkflow(
      'n8n-nodes-langchain.memoryBufferWindow',
      'Window Buffer Memory'
    );

    const result = await validator.validateWorkflow(workflow as any);

    const error = result.errors.find(e => e.code === 'AI_SUBNODE_MAIN_CONNECTION');
    expect(error).toBeDefined();
    expect(error!.message).toContain('ai_memory');
  });

  it('should flag embeddings node connected via main', async () => {
    const workflow = makeWorkflow(
      'n8n-nodes-langchain.embeddingsOpenAi',
      'Embeddings OpenAI'
    );

    const result = await validator.validateWorkflow(workflow as any);

    const error = result.errors.find(e => e.code === 'AI_SUBNODE_MAIN_CONNECTION');
    expect(error).toBeDefined();
    expect(error!.message).toContain('ai_embedding');
  });

  it('should NOT flag regular langchain nodes (agent, openAi) connected via main', async () => {
    const workflow1 = makeWorkflow('n8n-nodes-langchain.agent', 'AI Agent');
    const workflow2 = makeWorkflow('n8n-nodes-langchain.openAi', 'OpenAI');

    const result1 = await validator.validateWorkflow(workflow1 as any);
    const result2 = await validator.validateWorkflow(workflow2 as any);

    expect(result1.errors.find(e => e.code === 'AI_SUBNODE_MAIN_CONNECTION')).toBeUndefined();
    expect(result2.errors.find(e => e.code === 'AI_SUBNODE_MAIN_CONNECTION')).toBeUndefined();
  });

  it('should NOT flag dynamic-output nodes (expression-based outputs)', async () => {
    const workflow1 = makeWorkflow('n8n-nodes-langchain.textClassifier', 'Text Classifier');
    const workflow2 = makeWorkflow('n8n-nodes-langchain.vectorStoreInMemory', 'Vector Store');

    const result1 = await validator.validateWorkflow(workflow1 as any);
    const result2 = await validator.validateWorkflow(workflow2 as any);

    expect(result1.errors.find(e => e.code === 'AI_SUBNODE_MAIN_CONNECTION')).toBeUndefined();
    expect(result2.errors.find(e => e.code === 'AI_SUBNODE_MAIN_CONNECTION')).toBeUndefined();
  });

  it('should NOT flag AI sub-node connected via correct AI type', async () => {
    const workflow = {
      nodes: [
        { id: '1', name: 'Manual Trigger', type: 'n8n-nodes-base.manualTrigger', position: [0, 0], parameters: {} },
        { id: '2', name: 'AI Agent', type: 'n8n-nodes-langchain.agent', position: [200, 0], parameters: {} },
        { id: '3', name: 'Google Gemini', type: 'n8n-nodes-langchain.lmChatGoogleGemini', position: [200, 200], parameters: {} },
      ],
      connections: {
        'Manual Trigger': {
          main: [[{ node: 'AI Agent', type: 'main', index: 0 }]]
        },
        'Google Gemini': {
          ai_languageModel: [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]]
        }
      }
    };

    const result = await validator.validateWorkflow(workflow as any);

    expect(result.errors.find(e => e.code === 'AI_SUBNODE_MAIN_CONNECTION')).toBeUndefined();
  });

  it('should NOT flag unknown/community nodes not in database', async () => {
    const workflow = makeWorkflow('n8n-nodes-community.someNode', 'Community Node');

    const result = await validator.validateWorkflow(workflow as any);

    expect(result.errors.find(e => e.code === 'AI_SUBNODE_MAIN_CONNECTION')).toBeUndefined();
  });
});
