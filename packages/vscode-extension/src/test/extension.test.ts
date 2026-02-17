import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
    void vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        const extension = vscode.extensions.getExtension('tan-yong-sheng.ai-code-context');
        assert.ok(extension, 'Extension should be installed');
    });

    test('Extension should activate', async () => {
        const extension = vscode.extensions.getExtension('tan-yong-sheng.code-context');
        assert.ok(extension, 'Extension should be installed');

        if (!extension.isActive) {
            await extension.activate();
        }

        assert.strictEqual(extension.isActive, true, 'Extension should be active');
    });

    test('Commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);

        assert.ok(commands.includes('semanticCodeSearch.semanticSearch'), 'Semantic search command should be registered');
        assert.ok(commands.includes('semanticCodeSearch.indexCodebase'), 'Index codebase command should be registered');
        assert.ok(commands.includes('semanticCodeSearch.clearIndex'), 'Clear index command should be registered');
    });

    test('Configuration should be accessible', () => {
        const config = vscode.workspace.getConfiguration('semanticCodeSearch');
        assert.ok(config, 'Configuration should be accessible');

        const autoSync = config.get('autoSync.enabled');
        assert.strictEqual(typeof autoSync, 'boolean', 'autoSync.enabled should be a boolean');
    });

    test('Extension exports should be available after activation', async () => {
        const extension = vscode.extensions.getExtension('tan-yong-sheng.code-context');
        assert.ok(extension, 'Extension should be installed');

        const api = await extension.activate();
        // The extension may or may not export an API
        // This test documents the expected behavior
        assert.strictEqual(typeof api, 'undefined', 'Extension does not export a public API');
    });
});
