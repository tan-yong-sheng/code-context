import * as vscode from 'vscode';
import { Context, SearchQuery, SemanticSearchResult } from '@tan-yong-sheng/code-context-core';
import * as path from 'path';
import { getLogger } from '../utils/logger';

export class SearchCommand {
    private context: Context;
    private logger = getLogger();

    constructor(context: Context) {
        this.context = context;
        this.logger.debug('SearchCommand instance created');
    }

    /**
     * Update the Context instance (used when configuration changes)
     */
    updateContext(context: Context): void {
        this.logger.debug('SearchCommand context updated');
        this.context = context;
    }

    async execute(preSelectedText?: string): Promise<void> {
        this.logger.enter('SearchCommand.execute', { preSelectedText: preSelectedText?.substring(0, 50) });

        let searchTerm: string | undefined;

        // Check if we have meaningful pre-selected text
        const trimmedPreSelectedText = preSelectedText?.trim();
        if (trimmedPreSelectedText && trimmedPreSelectedText.length > 0) {
            // Use the pre-selected text directly
            searchTerm = trimmedPreSelectedText;
            this.logger.info(`Using pre-selected text: "${searchTerm.substring(0, 50)}..."`);
        } else {
            // Show input box if no meaningful pre-selected text
            this.logger.debug('Showing input box for search term');
            searchTerm = await vscode.window.showInputBox({
                placeHolder: 'Enter search term...',
                prompt: 'Search for functions, classes, variables, or any code using semantic search'
            });
        }

        if (!searchTerm) {
            this.logger.info('No search term provided, aborting');
            return;
        }

        this.logger.info(`Search term: "${searchTerm}"`);

        try {
            const startTime = Date.now();
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Searching...',
                cancellable: false
            }, async (progress) => {
                this.logger.enter('SearchCommand.execute.withProgress');
                progress.report({ increment: 0, message: 'Performing semantic search...' });

                // Get workspace root for codebase path
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    this.logger.error('No workspace folder found');
                    vscode.window.showErrorMessage('No workspace folder found. Please open a folder first.');
                    return;
                }
                const codebasePath = workspaceFolders[0].uri.fsPath;
                this.logger.info(`Codebase path: ${codebasePath}`);

                // Check if index exists
                progress.report({ increment: 20, message: 'Checking index...' });
                this.logger.debug('Checking if index exists...');
                const hasIndex = await this.context.hasIndex(codebasePath);
                this.logger.debug(`Index exists: ${hasIndex}`);

                if (!hasIndex) {
                    this.logger.warn('Index not found');
                    vscode.window.showErrorMessage('Index not found. Please index the codebase first.');
                    return;
                }

                // Optionally prompt for file extension filters
                this.logger.debug('Prompting for file extension filters');
                const extensionInput = await vscode.window.showInputBox({
                    placeHolder: 'Optional: filter by file extensions (e.g. .ts,.py,.java) – leave empty for all',
                    prompt: 'Enter a comma-separated list of file extensions to include',
                    value: ''
                });

                const fileExtensions = (extensionInput || '')
                    .split(',')
                    .map(e => e.trim())
                    .filter(Boolean);

                this.logger.info(`File extensions filter: [${fileExtensions.join(', ')}]`);

                // Validate extensions strictly and build filter expression
                let filterExpr: string | undefined = undefined;
                if (fileExtensions.length > 0) {
                    const invalid = fileExtensions.filter(e => !(e.startsWith('.') && e.length > 1 && !/\s/.test(e)));
                    if (invalid.length > 0) {
                        this.logger.error(`Invalid extensions: ${invalid.join(', ')}`);
                        vscode.window.showErrorMessage(`Invalid extensions: ${invalid.join(', ')}. Use proper extensions like '.ts', '.py'.`);
                        return;
                    }
                    const quoted = fileExtensions.map(e => `'${e}'`).join(',');
                    filterExpr = `fileExtension in [${quoted}]`;
                    this.logger.debug(`Filter expression: ${filterExpr}`);
                }

                // Use semantic search
                const query: SearchQuery = {
                    term: searchTerm,
                    includeContent: true,
                    limit: 20
                };

                this.logger.info('🔍 Executing semantic search...');
                progress.report({ increment: 50, message: 'Executing semantic search...' });

                const searchStartTime = Date.now();
                let results = await this.context.semanticSearch(
                    codebasePath,
                    query.term,
                    query.limit || 20,
                    0.3, // similarity threshold
                    filterExpr
                );
                const searchDuration = Date.now() - searchStartTime;
                this.logger.info(`Semantic search completed in ${searchDuration}ms, found ${results.length} results`);

                progress.report({ increment: 100, message: 'Search complete!' });

                if (results.length === 0) {
                    this.logger.info(`No results found for "${searchTerm}"`);
                    vscode.window.showInformationMessage(`No results found for "${searchTerm}"`);
                    return;
                }

                // Generate quick pick items for VS Code
                const quickPickItems = this.generateQuickPickItems(results, searchTerm, codebasePath);

                const selected = await vscode.window.showQuickPick(quickPickItems, {
                    placeHolder: `Found ${results.length} results for "${searchTerm}" using semantic search`,
                    matchOnDescription: true,
                    matchOnDetail: true
                });

                if (selected) {
                    this.logger.info(`User selected: ${selected.result.relativePath}`);
                    await this.openResult(selected.result);
                } else {
                    this.logger.debug('User cancelled quick pick');
                }

                this.logger.exit('SearchCommand.execute.withProgress');
            });

            this.logger.info(`Total search execution time: ${Date.now() - startTime}ms`);

        } catch (error) {
            this.logger.error('Search failed', error);
            vscode.window.showErrorMessage(`Search failed: ${error}. Please ensure the codebase is indexed.`);
        } finally {
            this.logger.exit('SearchCommand.execute');
        }
    }

    private async openResult(result: SemanticSearchResult): Promise<void> {
        this.logger.enter('SearchCommand.openResult', { relativePath: result.relativePath, startLine: result.startLine });

        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                this.logger.error('No workspace folder found');
                vscode.window.showWarningMessage('No workspace folder found');
                return;
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            let fullPath = result.relativePath;
            if (!result.relativePath.startsWith('/') && !result.relativePath.includes(':')) {
                fullPath = path.join(workspaceRoot, result.relativePath);
            }

            this.logger.info(`Opening file: ${fullPath}`);

            const document = await vscode.workspace.openTextDocument(fullPath);
            const editor = await vscode.window.showTextDocument(document);

            // Navigate to the location
            const line = Math.max(0, result.startLine - 1); // Convert to 0-based line numbers
            const column = 0;

            const position = new vscode.Position(line, column);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);

            this.logger.info(`Navigated to line ${result.startLine}`);

        } catch (error) {
            this.logger.error('Failed to open result', error);
            vscode.window.showErrorMessage(`Failed to open file: ${error}`);
        } finally {
            this.logger.exit('SearchCommand.openResult');
        }
    }

    /**
     * Execute search for webview (without UI prompts)
     */
    async executeForWebview(searchTerm: string, limit: number = 50, fileExtensions: string[] = []): Promise<SemanticSearchResult[]> {
        this.logger.enter('SearchCommand.executeForWebview', { searchTerm: searchTerm.substring(0, 50), limit, fileExtensions });

        // Get workspace root for codebase path
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.logger.error('No workspace folder found');
            throw new Error('No workspace folder found. Please open a folder first.');
        }
        const codebasePath = workspaceFolders[0].uri.fsPath;
        this.logger.info(`Codebase path: ${codebasePath}`);

        // Check if index exists
        this.logger.debug('Checking if index exists...');
        const hasIndex = await this.context.hasIndex(codebasePath);
        this.logger.debug(`Index exists: ${hasIndex}`);

        if (!hasIndex) {
            this.logger.warn('Index not found');
            throw new Error('Index not found. Please index the codebase first.');
        }

        this.logger.info(`🔍 Executing semantic search for webview with limit ${limit}...`);

        // Validate extensions strictly and build filter expression
        let filterExpr: string | undefined = undefined;
        if (fileExtensions && fileExtensions.length > 0) {
            const invalid = fileExtensions.filter(e => !(typeof e === 'string' && e.startsWith('.') && e.length > 1 && !/\s/.test(e)));
            if (invalid.length > 0) {
                this.logger.error(`Invalid extensions: ${invalid.join(', ')}`);
                throw new Error(`Invalid extensions: ${invalid.join(', ')}. Use proper extensions like '.ts', '.py'.`);
            }
            const quoted = fileExtensions.map(e => `'${e}'`).join(',');
            filterExpr = `fileExtension in [${quoted}]`;
            this.logger.debug(`Filter expression: ${filterExpr}`);
        }

        const searchStartTime = Date.now();
        let results = await this.context.semanticSearch(
            codebasePath,
            searchTerm,
            limit,
            0.3, // similarity threshold
            filterExpr
        );
        const searchDuration = Date.now() - searchStartTime;

        this.logger.info(`Webview search completed in ${searchDuration}ms, found ${results.length} results`);
        this.logger.exit('SearchCommand.executeForWebview');

        return results;
    }

    /**
     * Check if index exists for the given codebase path
     */
    async hasIndex(codebasePath: string): Promise<boolean> {
        this.logger.enter('SearchCommand.hasIndex', { codebasePath });

        try {
            const hasIndex = await this.context.hasIndex(codebasePath);
            this.logger.debug(`Index exists at ${codebasePath}: ${hasIndex}`);
            return hasIndex;
        } catch (error) {
            this.logger.error('Error checking index existence', error);
            return false;
        } finally {
            this.logger.exit('SearchCommand.hasIndex');
        }
    }

    /**
     * Generate quick pick items for VS Code
     */
    private generateQuickPickItems(results: SemanticSearchResult[], searchTerm: string, workspaceRoot?: string) {
        this.logger.debug(`Generating quick pick items for ${results.length} results`);

        return results.slice(0, 20).map((result, index) => {
            let displayPath = result.relativePath;
            // Truncate content for display
            const truncatedContent = result.content.length <= 150
                ? result.content
                : result.content.substring(0, 150) + '...';

            // Add rank info to description
            const rankText = ` (rank: ${index + 1})`;

            return {
                label: `$(file-code) ${displayPath}`,
                description: `$(search) semantic search${rankText}`,
                detail: truncatedContent,
                result: result
            };
        });
    }
}
