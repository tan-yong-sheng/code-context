import * as vscode from 'vscode';
import { Context } from '@tan-yong-sheng/code-context-core';
import * as fs from 'fs';
import { getLogger } from '../utils/logger';

export class SyncCommand {
    private context: Context;
    private isSyncing: boolean = false;
    private logger = getLogger();

    constructor(context: Context) {
        this.context = context;
        this.logger.debug('SyncCommand instance created');
    }

    /**
     * Update the Context instance (used when configuration changes)
     */
    updateContext(context: Context): void {
        this.logger.debug('SyncCommand context updated');
        this.context = context;
    }

    /**
     * Sync the current workspace folder - check for changes and update index
     */
    async execute(): Promise<void> {
        this.logger.enter('SyncCommand.execute');

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.logger.error('No workspace folder found');
            vscode.window.showErrorMessage('No workspace folder found. Please open a folder first.');
            return;
        }

        if (this.isSyncing) {
            this.logger.warn('Sync already in progress');
            vscode.window.showWarningMessage('Sync is already in progress. Please wait for it to complete.');
            return;
        }

        // Use the first workspace folder as target
        const targetFolder = workspaceFolders[0];
        const codebasePath = targetFolder.uri.fsPath;

        // Check if the workspace folder exists
        if (!fs.existsSync(codebasePath)) {
            this.logger.error(`Workspace folder does not exist: ${codebasePath}`);
            vscode.window.showErrorMessage(`Workspace folder '${codebasePath}' does not exist.`);
            return;
        }

        this.logger.info(`[SYNC] Starting sync for current workspace: ${codebasePath}`);
        this.isSyncing = true;
        const totalStartTime = Date.now();

        try {
            let syncStats: { added: number; removed: number; modified: number } | undefined;

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Syncing Workspace Index',
                cancellable: false
            }, async (progress) => {
                this.logger.enter('SyncCommand.execute.withProgress');
                progress.report({ increment: 0, message: 'Checking for file changes...' });

                try {
                    const syncStartTime = Date.now();
                    syncStats = await this.context.reindexByChange(
                        codebasePath,
                        (progressInfo) => {
                            const increment = progressInfo.percentage;
                            this.logger.debug(`Sync progress: ${progressInfo.phase} (${progressInfo.percentage}%)`);
                            progress.report({
                                increment: increment,
                                message: progressInfo.phase
                            });
                        }
                    );
                    this.logger.info(`Sync operation completed in ${Date.now() - syncStartTime}ms`);
                } catch (error: any) {
                    this.logger.error(`[SYNC] Error syncing workspace '${codebasePath}':`, error);
                    throw error;
                } finally {
                    this.logger.exit('SyncCommand.execute.withProgress');
                }
            });

            if (syncStats) {
                const totalChanges = syncStats.added + syncStats.removed + syncStats.modified;
                this.logger.info('Sync stats:', { added: syncStats.added, removed: syncStats.removed, modified: syncStats.modified, totalChanges });

                if (totalChanges > 0) {
                    this.logger.info(`[SYNC] Sync complete for '${codebasePath}'. Added: ${syncStats.added}, Removed: ${syncStats.removed}, Modified: ${syncStats.modified}`);
                    vscode.window.showInformationMessage(
                        `✅ Sync complete!\n\nAdded: ${syncStats.added}, Removed: ${syncStats.removed}, Modified: ${syncStats.modified} files.`
                    );
                } else {
                    this.logger.info(`[SYNC] No changes detected for '${codebasePath}'`);
                    vscode.window.showInformationMessage('✅ Sync complete! No changes detected.');
                }
            }

            this.logger.info(`Total sync time: ${Date.now() - totalStartTime}ms`);

        } catch (error: any) {
            this.logger.error('[SYNC] Sync failed:', error);
            vscode.window.showErrorMessage(`❌ Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            this.isSyncing = false;
            this.logger.info(`[SYNC] Sync process finished for workspace: ${codebasePath}`);
            this.logger.exit('SyncCommand.execute');
        }
    }

    /**
     * Auto-sync functionality - periodically check for changes
     */
    async startAutoSync(intervalMinutes: number = 5): Promise<vscode.Disposable> {
        this.logger.enter('SyncCommand.startAutoSync', { intervalMinutes });

        const intervalMs = intervalMinutes * 60 * 1000;
        this.logger.info(`[AUTO-SYNC] Starting auto-sync with ${intervalMinutes} minute interval (${intervalMs}ms)`);

        const interval = setInterval(async () => {
            this.logger.section('AUTO-SYNC INTERVAL TRIGGERED');
            try {
                this.logger.info('[AUTO-SYNC] Running periodic sync...');
                await this.executeSilent();
            } catch (error) {
                this.logger.warn('[AUTO-SYNC] Silent sync failed:', error);
                // Don't show error to user for auto-sync failures
            }
        }, intervalMs);

        // Return a disposable to stop the auto-sync
        const disposable = new vscode.Disposable(() => {
            this.logger.info('[AUTO-SYNC] Stopping auto-sync');
            clearInterval(interval);
        });

        this.logger.exit('SyncCommand.startAutoSync');
        return disposable;
    }

    /**
     * Silent sync - runs without progress notifications, used for auto-sync
     */
    async executeSilent(): Promise<void> {
        this.logger.enter('SyncCommand.executeSilent');

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.logger.debug('No workspace folder found, skipping silent sync');
            return;
        }

        if (this.isSyncing) {
            this.logger.info('[AUTO-SYNC] Sync already in progress, skipping...');
            return;
        }

        const targetFolder = workspaceFolders[0];
        const codebasePath = targetFolder.uri.fsPath;

        if (!fs.existsSync(codebasePath)) {
            this.logger.warn(`[AUTO-SYNC] Workspace folder '${codebasePath}' does not exist`);
            return;
        }

        this.logger.info(`[AUTO-SYNC] Starting silent sync for: ${codebasePath}`);
        this.isSyncing = true;
        const startTime = Date.now();

        try {
            const syncStats = await this.context.reindexByChange(codebasePath);
            const totalChanges = syncStats.added + syncStats.removed + syncStats.modified;

            if (totalChanges > 0) {
                this.logger.info(`[AUTO-SYNC] Silent sync complete for '${codebasePath}'. Added: ${syncStats.added}, Removed: ${syncStats.removed}, Modified: ${syncStats.modified}`);

                // Show a subtle notification for auto-sync changes
                vscode.window.showInformationMessage(
                    `🔄 Index auto-updated: ${totalChanges} file changes detected`,
                    { modal: false }
                );
            } else {
                this.logger.info(`[AUTO-SYNC] No changes detected for '${codebasePath}'`);
            }

            this.logger.info(`Silent sync completed in ${Date.now() - startTime}ms`);

        } catch (error: any) {
            this.logger.error('[AUTO-SYNC] Silent sync failed:', error);
            throw error;
        } finally {
            this.isSyncing = false;
            this.logger.exit('SyncCommand.executeSilent');
        }
    }

    /**
     * Check if sync is currently in progress
     */
    getIsSyncing(): boolean {
        return this.isSyncing;
    }
}
