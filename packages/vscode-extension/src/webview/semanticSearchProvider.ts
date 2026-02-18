import * as vscode from 'vscode';
import { WebviewHelper } from './webviewHelper';
import { SearchCommand } from '../commands/searchCommand';
import { IndexCommand } from '../commands/indexCommand';
import { SyncCommand } from '../commands/syncCommand';
import { ConfigManager, EmbeddingProviderConfig, SqliteVecWebConfig } from '../config/configManager';
import * as path from 'path';
import { getLogger } from '../utils/logger';

export class SemanticSearchViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'semanticSearchView';
    private searchCommand: SearchCommand;
    private indexCommand: IndexCommand;
    private _syncCommand: SyncCommand;
    private configManager: ConfigManager;
    private logger = getLogger();

    constructor(private readonly _extensionUri: vscode.Uri, searchCommand: SearchCommand, indexCommand: IndexCommand, _syncCommand: SyncCommand, configManager: ConfigManager) {
        this.searchCommand = searchCommand;
        this.indexCommand = indexCommand;
        this._syncCommand = _syncCommand;
        this.configManager = configManager;
        this.logger.debug('SemanticSearchViewProvider instance created');
    }

    /**
     * Update the command instances (used when configuration changes)
     */
    updateCommands(searchCommand: SearchCommand, indexCommand: IndexCommand, _syncCommand: SyncCommand): void {
        this.logger.debug('SemanticSearchViewProvider commands updated');
        this.searchCommand = searchCommand;
        this.indexCommand = indexCommand;
        this._syncCommand = _syncCommand;
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this.logger.enter('SemanticSearchViewProvider.resolveWebviewView');
        this.logger.info('SemanticSearchViewProvider: resolveWebviewView called');

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = WebviewHelper.getHtmlContent(
            this._extensionUri,
            'src/webview/templates/semanticSearch.html',
            webviewView.webview
        );
        this.logger.debug('Webview HTML content set');

        // Check index status on load
        this.logger.debug('Checking initial index status...');
        this.checkIndexStatusAndUpdateWebview(webviewView.webview);

        // Send initial configuration data to webview
        this.logger.debug('Sending initial configuration...');
        this.sendCurrentConfig(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(
            async message => {
                this.logger.debug(`Received message from webview: ${message.command}`, { command: message.command });

                switch (message.command) {
                    case 'checkIndex':
                        this.logger.section('WEBVIEW: CHECK INDEX');
                        await this.checkIndexStatusAndUpdateWebview(webviewView.webview);
                        return;

                    case 'getConfig':
                        this.logger.section('WEBVIEW: GET CONFIG');
                        this.sendCurrentConfig(webviewView.webview);
                        return;

                    case 'saveConfig':
                        this.logger.section('WEBVIEW: SAVE CONFIG');
                        await this.saveConfig(message.config, webviewView.webview);
                        return;

                    case 'testEmbedding':
                        this.logger.section('WEBVIEW: TEST EMBEDDING');
                        await this.testEmbedding(message.config, webviewView.webview);
                        return;

                    case 'search':
                        this.logger.section('WEBVIEW: SEARCH');
                        try {
                            const searchStartTime = Date.now();
                            this.logger.info(`Searching for: "${message.text}"`);

                            // Use search command
                            const searchResults = await this.searchCommand.executeForWebview(
                                message.text,
                                50,
                                Array.isArray(message.fileExtensions) ? message.fileExtensions : []
                            );

                            this.logger.info(`Search completed in ${Date.now() - searchStartTime}ms, found ${searchResults.length} results`);

                            // Convert SemanticSearchResult[] to webview format
                            const results = this.convertSearchResultsToWebviewFormat(searchResults);

                            // Send results back to webview
                            webviewView.webview.postMessage({
                                command: 'showResults',
                                results: results,
                                query: message.text
                            });

                            vscode.window.showInformationMessage(`Found ${results.length} results for: "${message.text}"`);
                        } catch (error) {
                            this.logger.error('Search failed:', error);
                            vscode.window.showErrorMessage(`Search failed: ${error}`);
                            // Send empty results to webview
                            webviewView.webview.postMessage({
                                command: 'showResults',
                                results: [],
                                query: message.text
                            });
                        }
                        return;

                    case 'index':
                        this.logger.section('WEBVIEW: INDEX');
                        try {
                            this.logger.info('Starting index from webview...');
                            await this.indexCommand.execute();
                            // Notify webview that indexing is complete and check index status
                            webviewView.webview.postMessage({
                                command: 'indexComplete'
                            });
                            // Update index status after completion
                            await this.checkIndexStatusAndUpdateWebview(webviewView.webview);
                        } catch (error) {
                            this.logger.error('Indexing error:', error);
                            // Still notify webview to reset button state
                            webviewView.webview.postMessage({
                                command: 'indexComplete'
                            });
                        }
                        return;

                    case 'openFile':
                        this.logger.section('WEBVIEW: OPEN FILE');
                        try {
                            this.logger.info(`Opening file: ${message.relativePath}`);
                            const workspaceFolders = vscode.workspace.workspaceFolders;
                            const workspaceRoot = workspaceFolders ? workspaceFolders[0].uri.fsPath : '';
                            const absPath = path.join(workspaceRoot, message.relativePath);
                            const uri = vscode.Uri.file(absPath);
                            const document = await vscode.workspace.openTextDocument(uri);
                            const editor = await vscode.window.showTextDocument(document);

                            // Select range from startLine to endLine if provided, otherwise just jump to line
                            if (message.startLine !== undefined && message.endLine !== undefined) {
                                const startLine = Math.max(0, message.startLine - 1); // Convert to 0-based
                                const endLine = Math.max(0, message.endLine - 1); // Convert to 0-based
                                const range = new vscode.Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER);
                                editor.selection = new vscode.Selection(range.start, range.end);
                                editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                                this.logger.info(`Navigated to lines ${message.startLine}-${message.endLine}`);
                            } else if (message.line !== undefined) {
                                const line = Math.max(0, message.line - 1); // Convert to 0-based
                                const range = new vscode.Range(line, 0, line, 0);
                                editor.selection = new vscode.Selection(range.start, range.end);
                                editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                                this.logger.info(`Navigated to line ${message.line}`);
                            }
                        } catch (error) {
                            this.logger.error(`Failed to open file: ${message.relativePath}`, error);
                            vscode.window.showErrorMessage(`Failed to open file: ${message.relativePath}`);
                        }
                        return;
                }
            },
            undefined,
            []
        );

        this.logger.exit('SemanticSearchViewProvider.resolveWebviewView');
    }

    /**
     * Convert SemanticSearchResult[] from core to webview format
     */
    private convertSearchResultsToWebviewFormat(searchResults: any[]): any[] {
        this.logger.debug(`Converting ${searchResults.length} search results to webview format`);

        const workspaceFolders = vscode.workspace.workspaceFolders;
        const baseWorkspacePath = workspaceFolders ? workspaceFolders[0].uri.fsPath : '/tmp';

        return searchResults.map(result => {
            let filePath = result.relativePath;
            if (result.relativePath && !result.relativePath.startsWith('/') && !result.relativePath.includes(':')) {
                filePath = `${baseWorkspacePath}/${result.relativePath}`;
            }

            let displayPath = result.relativePath;

            // Truncate content for display
            const truncatedContent = result.content && result.content.length <= 150
                ? result.content
                : (result.content || '').substring(0, 150) + '...';

            return {
                file: displayPath,
                filePath: filePath,
                relativePath: result.relativePath,
                line: result.startLine,
                preview: truncatedContent,
                context: `1 match in ${displayPath}`,
                score: result.score,
                startLine: result.startLine,
                endLine: result.endLine
            };
        });
    }

    /**
     * Check index status and update webview accordingly
     */
    private async checkIndexStatusAndUpdateWebview(webview: vscode.Webview): Promise<void> {
        this.logger.enter('SemanticSearchViewProvider.checkIndexStatusAndUpdateWebview');

        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                this.logger.warn('No workspace folders found');
                webview.postMessage({
                    command: 'updateIndexStatus',
                    hasIndex: false
                });
                return;
            }

            const codebasePath = workspaceFolders[0].uri.fsPath;
            this.logger.debug(`Checking index status for: ${codebasePath}`);

            const hasIndex = await this.searchCommand.hasIndex(codebasePath);
            this.logger.info(`Index status: ${hasIndex ? 'exists' : 'not found'}`);

            webview.postMessage({
                command: 'updateIndexStatus',
                hasIndex: hasIndex
            });
        } catch (error) {
            this.logger.error('Failed to check index status:', error);
            webview.postMessage({
                command: 'updateIndexStatus',
                hasIndex: false
            });
        } finally {
            this.logger.exit('SemanticSearchViewProvider.checkIndexStatusAndUpdateWebview');
        }
    }

    private sendCurrentConfig(webview: vscode.Webview) {
        this.logger.enter('SemanticSearchViewProvider.sendCurrentConfig');

        const config = this.configManager.getEmbeddingProviderConfig();
        const vectorDbConfig = this.configManager.getVectorDbConfig();
        const splitterConfig = this.configManager.getSplitterConfig();
        const advancedConfig = this.configManager.getAdvancedConfig();
        const supportedProviders = ConfigManager.getSupportedProviders();

        this.logger.logConfig({
            provider: config?.provider,
            model: config?.config?.model,
            splitterType: splitterConfig?.type,
            embeddingDimension: advancedConfig.embeddingDimension,
            embeddingBatchSize: advancedConfig.embeddingBatchSize
        });

        webview.postMessage({
            command: 'configData',
            config: config,
            vectorDbConfig: vectorDbConfig,
            splitterConfig: splitterConfig,
            advancedConfig: advancedConfig,
            supportedProviders: supportedProviders
        });

        this.logger.exit('SemanticSearchViewProvider.sendCurrentConfig');
    }

    private async saveConfig(configData: any, webview: vscode.Webview) {
        this.logger.enter('SemanticSearchViewProvider.saveConfig');

        try {
            // Save embedding provider config
            this.logger.debug('Saving embedding provider config...');
            const embeddingConfig: EmbeddingProviderConfig = {
                provider: configData.provider,
                config: configData.config
            };
            await this.configManager.saveEmbeddingProviderConfig(embeddingConfig);

            // Save Vector DB config
            if (configData.vectorDbConfig) {
                this.logger.debug('Saving vector DB config...');
                await this.configManager.saveVectorDbConfig(configData.vectorDbConfig);
            }

            // Save splitter config
            if (configData.splitterConfig) {
                this.logger.debug('Saving splitter config...');
                await this.configManager.saveSplitterConfig(configData.splitterConfig);
            }

            // Save advanced config
            if (configData.advancedConfig) {
                this.logger.debug('Saving advanced config...');
                await this.configManager.saveAdvancedConfig(configData.advancedConfig);
            }

            // Add a small delay to ensure configuration is fully saved
            await new Promise(resolve => setTimeout(resolve, 100));

            // Notify extension to recreate Context with new config
            this.logger.info('Configuration saved, reloading...');
            vscode.commands.executeCommand('semanticCodeSearch.reloadConfiguration');

            webview.postMessage({
                command: 'saveResult',
                success: true,
                message: 'Configuration saved successfully!'
            });

            vscode.window.showInformationMessage('Context configuration saved successfully!');
        } catch (error) {
            this.logger.error('Failed to save config:', error);
            webview.postMessage({
                command: 'saveResult',
                success: false,
                message: `Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
        } finally {
            this.logger.exit('SemanticSearchViewProvider.saveConfig');
        }
    }

    private async testEmbedding(embeddingConfig: any, webview: vscode.Webview) {
        this.logger.enter('SemanticSearchViewProvider.testEmbedding', { provider: embeddingConfig.provider });

        try {
            this.logger.info(`Testing embedding connection for ${embeddingConfig.provider}...`);

            // Test only embedding connection
            const embedding = ConfigManager.createEmbeddingInstance(embeddingConfig.provider, embeddingConfig.config);
            await embedding.embed('test embedding connection');

            this.logger.info('Embedding connection test successful');
            webview.postMessage({
                command: 'testResult',
                success: true,
                message: 'Embedding connection test successful!'
            });
        } catch (error) {
            this.logger.error('Embedding connection test failed:', error);
            webview.postMessage({
                command: 'testResult',
                success: false,
                message: `Embedding connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
        } finally {
            this.logger.exit('SemanticSearchViewProvider.testEmbedding');
        }
    }
}
