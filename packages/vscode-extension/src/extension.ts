import * as vscode from 'vscode';
import { SemanticSearchViewProvider } from './webview/semanticSearchProvider';

import { SearchCommand } from './commands/searchCommand';
import { IndexCommand } from './commands/indexCommand';
import { SyncCommand } from './commands/syncCommand';
import { ConfigManager } from './config/configManager';
import { Context, OpenAIEmbedding, VoyageAIEmbedding, GeminiEmbedding, SqliteVecVectorDatabase, AstCodeSplitter, LangChainCodeSplitter, SplitterType } from '@tan-yong-sheng/code-context-core';
import { envManager, SqliteVecConfig } from '@tan-yong-sheng/code-context-core';
import { getLogger } from './utils/logger';

let semanticSearchProvider: SemanticSearchViewProvider;
let searchCommand: SearchCommand;
let indexCommand: IndexCommand;
let syncCommand: SyncCommand;
let configManager: ConfigManager;
let codeContext: Context;
let autoSyncDisposable: vscode.Disposable | null = null;

export async function activate(context: vscode.ExtensionContext) {
    const logger = getLogger();
    logger.section('EXTENSION ACTIVATION');
    logger.enter('activate', { extensionPath: context.extensionPath });

    logger.info('AI Code Context extension is now activating...');
    logger.info(`VSCode Version: ${vscode.version}`);
    logger.info(`Platform: ${process.platform}`);
    logger.info(`Node Version: ${process.version}`);

    // Log workspace info
    const workspaceFolders = vscode.workspace.workspaceFolders;
    logger.info(`Workspace folders: ${workspaceFolders?.length || 0}`);
    workspaceFolders?.forEach((folder, index) => {
        logger.info(`  [${index}] ${folder.name}: ${folder.uri.fsPath}`);
    });

    try {
        // Initialize config manager
        logger.debug('Initializing ConfigManager...');
        configManager = new ConfigManager(context);

        // Initialize shared context instance with embedding configuration
        logger.debug('Creating Context with configuration...');
        codeContext = createContextWithConfig(configManager);

        // Initialize providers and commands
        logger.debug('Initializing commands...');
        searchCommand = new SearchCommand(codeContext);
        indexCommand = new IndexCommand(codeContext);
        syncCommand = new SyncCommand(codeContext);
        semanticSearchProvider = new SemanticSearchViewProvider(context.extensionUri, searchCommand, indexCommand, syncCommand, configManager);
        logger.info('Commands and webview provider initialized');

        // Register command handlers
        logger.debug('Registering command handlers...');
        const disposables = [
            // Register webview providers
            vscode.window.registerWebviewViewProvider(SemanticSearchViewProvider.viewType, semanticSearchProvider, {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }),

            // Listen for configuration changes
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration('semanticCodeSearch.embeddingProvider') ||
                    event.affectsConfiguration('semanticCodeSearch.vectorDb') ||
                    event.affectsConfiguration('semanticCodeSearch.splitter') ||
                    event.affectsConfiguration('semanticCodeSearch.autoSync')) {
                    logger.section('CONFIGURATION CHANGED');
                    logger.info('Configuration changed, reloading...');
                    reloadContextConfiguration();
                }
            }),

            // Register commands
            vscode.commands.registerCommand('semanticCodeSearch.semanticSearch', () => {
                logger.section('SEARCH COMMAND');
                const editor = vscode.window.activeTextEditor;
                const selectedText = editor?.document.getText(editor.selection);
                return searchCommand.execute(selectedText);
            }),
            vscode.commands.registerCommand('semanticCodeSearch.indexCodebase', () => {
                logger.section('INDEX COMMAND');
                return indexCommand.execute();
            }),
            vscode.commands.registerCommand('semanticCodeSearch.clearIndex', () => {
                logger.section('CLEAR INDEX COMMAND');
                return indexCommand.clearIndex();
            }),
            vscode.commands.registerCommand('semanticCodeSearch.reloadConfiguration', () => {
                logger.section('RELOAD CONFIGURATION COMMAND');
                return reloadContextConfiguration();
            })
        ];

        context.subscriptions.push(...disposables);
        logger.info(`Registered ${disposables.length} disposables`);

        // Initialize auto-sync if enabled
        logger.debug('Setting up auto-sync...');
        setupAutoSync();

        // Run initial sync on startup
        logger.debug('Running initial sync...');
        runInitialSync();

        // Show status bar item
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.text = `$(search) Context`;
        statusBarItem.tooltip = 'Click to open semantic search';
        statusBarItem.command = 'semanticCodeSearch.semanticSearch';
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);
        logger.info('Status bar item created');

        logger.info('Extension activated successfully');

    } catch (error) {
        logger.error('Extension activation failed', error);
        vscode.window.showErrorMessage(`AI Code Context activation failed: ${error}`);
        throw error;
    } finally {
        logger.exit('activate');
    }
}

async function runInitialSync() {
    const logger = getLogger();
    logger.enter('runInitialSync');

    try {
        logger.info('[STARTUP] Running initial sync...');
        await syncCommand.executeSilent();
        logger.info('[STARTUP] Initial sync completed');
    } catch (error) {
        logger.error('[STARTUP] Initial sync failed:', error);
        // Don't show error message to user for startup sync failure
    } finally {
        logger.exit('runInitialSync');
    }
}

function setupAutoSync() {
    const logger = getLogger();
    logger.enter('setupAutoSync');

    const config = vscode.workspace.getConfiguration('semanticCodeSearch');
    const autoSyncEnabled = config.get<boolean>('autoSync.enabled', true);
    const autoSyncInterval = config.get<number>('autoSync.intervalMinutes', 5);

    logger.logConfig({ autoSyncEnabled, autoSyncInterval });

    // Stop existing auto-sync if running
    if (autoSyncDisposable) {
        logger.debug('Disposing existing auto-sync');
        autoSyncDisposable.dispose();
        autoSyncDisposable = null;
    }

    if (autoSyncEnabled) {
        logger.info(`Setting up auto-sync with ${autoSyncInterval} minute interval`);

        // Start periodic auto-sync
        syncCommand.startAutoSync(autoSyncInterval).then(disposable => {
            autoSyncDisposable = disposable;
            logger.info('Auto-sync started successfully');
        }).catch(error => {
            logger.error('Failed to start auto-sync:', error);
            vscode.window.showErrorMessage(`Failed to start auto-sync: ${error instanceof Error ? error.message : 'Unknown error'}`);
        });
    } else {
        logger.info('Auto-sync disabled');
    }

    logger.exit('setupAutoSync');
}

function createContextWithConfig(configManager: ConfigManager): Context {
    const logger = getLogger();
    logger.enter('createContextWithConfig');

    const embeddingConfig = configManager.getEmbeddingProviderConfig();
    const vectorDbConfig = configManager.getVectorDbFullConfig();
    const splitterConfig = configManager.getSplitterConfig();

    logger.logConfig({
        hasEmbeddingConfig: !!embeddingConfig,
        provider: embeddingConfig?.provider,
        model: embeddingConfig?.config?.model,
        hasVectorDbConfig: !!vectorDbConfig,
        splitterType: splitterConfig?.type
    });

    try {
        let embedding;
        let vectorDatabase;

        const contextConfig: any = {};

        // Create embedding instance
        if (embeddingConfig) {
            logger.debug(`Creating embedding instance for ${embeddingConfig.provider}...`);
            embedding = ConfigManager.createEmbeddingInstance(embeddingConfig.provider, embeddingConfig.config);
            logger.info(`Embedding initialized with ${embeddingConfig.provider} (model: ${embeddingConfig.config.model})`);
            contextConfig.embedding = embedding;
        } else {
            logger.warn('No embedding configuration found');
        }

        // Create vector database instance
        if (vectorDbConfig) {
            logger.debug('Creating vector database instance...');
            vectorDatabase = new SqliteVecVectorDatabase(vectorDbConfig);
            logger.info(`Vector database initialized with sqlite-vec (dbPath: ${vectorDbConfig.dbPath})`);
            contextConfig.vectorDatabase = vectorDatabase;
        } else {
            logger.debug('Using default vector database configuration');
            vectorDatabase = new SqliteVecVectorDatabase({
                dbPath: envManager.get('VECTOR_DB_PATH') || undefined
            });
            contextConfig.vectorDatabase = vectorDatabase;
        }

        // Create splitter instance
        let codeSplitter;
        if (splitterConfig) {
            logger.debug(`Creating ${splitterConfig.type} splitter...`);
            if (splitterConfig.type === SplitterType.LANGCHAIN) {
                codeSplitter = new LangChainCodeSplitter(
                    splitterConfig.chunkSize ?? 1000,
                    splitterConfig.chunkOverlap ?? 200
                );
            } else { // Default to AST splitter
                codeSplitter = new AstCodeSplitter(
                    splitterConfig.chunkSize ?? 2500,
                    splitterConfig.chunkOverlap ?? 300
                );
            }
            contextConfig.codeSplitter = codeSplitter;
            logger.info(`Splitter configured: ${splitterConfig.type} (chunkSize: ${splitterConfig.chunkSize}, overlap: ${splitterConfig.chunkOverlap})`);
        } else {
            logger.debug('Using default AST splitter');
            codeSplitter = new AstCodeSplitter(2500, 300);
            contextConfig.codeSplitter = codeSplitter;
        }

        const ctx = new Context(contextConfig);
        logger.info('Context created successfully');
        logger.exit('createContextWithConfig');
        return ctx;
    } catch (error) {
        logger.error('Failed to create Context with user config', error);
        vscode.window.showErrorMessage(`Failed to initialize Context: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
    }
}

function reloadContextConfiguration() {
    const logger = getLogger();
    logger.section('RELOADING CONFIGURATION');
    logger.enter('reloadContextConfiguration');

    logger.info('Reloading Context configuration...');

    const embeddingConfig = configManager.getEmbeddingProviderConfig();
    const vectorDbConfig = configManager.getVectorDbFullConfig();
    const splitterConfig = configManager.getSplitterConfig();

    logger.logConfig({
        hasEmbeddingConfig: !!embeddingConfig,
        provider: embeddingConfig?.provider,
        hasVectorDbConfig: !!vectorDbConfig,
        splitterType: splitterConfig?.type
    });

    try {
        // Update embedding if configuration exists
        if (embeddingConfig) {
            logger.debug(`Updating embedding to ${embeddingConfig.provider}...`);
            const embedding = ConfigManager.createEmbeddingInstance(embeddingConfig.provider, embeddingConfig.config);
            codeContext.updateEmbedding(embedding);
            logger.info(`Embedding updated with ${embeddingConfig.provider} (model: ${embeddingConfig.config.model})`);
        }

        // Update vector database if configuration exists
        if (vectorDbConfig) {
            logger.debug('Updating vector database...');
            const vectorDatabase = new SqliteVecVectorDatabase(vectorDbConfig);
            codeContext.updateVectorDatabase(vectorDatabase);
            logger.info(`Vector database updated with sqlite-vec (dbPath: ${vectorDbConfig.dbPath})`);
        }

        // Update splitter if configuration exists
        if (splitterConfig) {
            logger.debug(`Updating splitter to ${splitterConfig.type}...`);
            let newSplitter;
            if (splitterConfig.type === SplitterType.LANGCHAIN) {
                newSplitter = new LangChainCodeSplitter(
                    splitterConfig.chunkSize ?? 1000,
                    splitterConfig.chunkOverlap ?? 200
                );
            } else {
                newSplitter = new AstCodeSplitter(
                    splitterConfig.chunkSize ?? 2500,
                    splitterConfig.chunkOverlap ?? 300
                );
            }
            codeContext.updateSplitter(newSplitter);
            logger.info(`Splitter updated: ${splitterConfig.type} (chunkSize: ${splitterConfig.chunkSize}, overlap: ${splitterConfig.chunkOverlap})`);
        } else {
            logger.debug('Using default AST splitter');
            const defaultSplitter = new AstCodeSplitter(2500, 300);
            codeContext.updateSplitter(defaultSplitter);
        }

        // Update command instances with new context
        logger.debug('Updating command contexts...');
        searchCommand.updateContext(codeContext);
        indexCommand.updateContext(codeContext);
        syncCommand.updateContext(codeContext);

        // Restart auto-sync if it was enabled
        logger.debug('Restarting auto-sync...');
        setupAutoSync();

        logger.info('Context configuration reloaded successfully');
        vscode.window.showInformationMessage('Configuration reloaded successfully!');
    } catch (error) {
        logger.error('Failed to reload Context configuration', error);
        vscode.window.showErrorMessage(`Failed to reload configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
        logger.exit('reloadContextConfiguration');
    }
}

export function deactivate() {
    const logger = getLogger();
    logger.section('EXTENSION DEACTIVATION');
    logger.enter('deactivate');

    logger.info('AI Code Context extension is now deactivating...');

    // Stop auto-sync if running
    if (autoSyncDisposable) {
        logger.debug('Disposing auto-sync');
        autoSyncDisposable.dispose();
        autoSyncDisposable = null;
    }

    logger.info('Extension deactivated successfully');
    logger.exit('deactivate');
}
