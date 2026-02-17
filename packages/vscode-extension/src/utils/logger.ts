import * as vscode from 'vscode';

/**
 * Log levels for the extension
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

/**
 * Logger utility for the AI Code Context extension.
 * Provides structured logging to the OutputChannel with different log levels.
 */
export class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;
    private logLevel: LogLevel;
    private readonly extensionName = 'AI Code Context';

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel(this.extensionName, 'log');
        this.logLevel = LogLevel.DEBUG; // Default to DEBUG for development

        // Check if we should enable debug logging from config
        this.updateLogLevelFromConfig();
    }

    /**
     * Get the singleton instance of the logger
     */
    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    /**
     * Update log level from VSCode configuration
     */
    private updateLogLevelFromConfig(): void {
        const config = vscode.workspace.getConfiguration('semanticCodeSearch');
        const debugMode = config.get<boolean>('debugMode');
        if (debugMode === true) {
            this.logLevel = LogLevel.DEBUG;
        }
    }

    /**
     * Set the log level dynamically
     */
    public setLogLevel(level: LogLevel): void {
        this.logLevel = level;
        this.info(`Log level set to ${LogLevel[level]}`);
    }

    /**
     * Show the output channel in VSCode
     */
    public show(): void {
        this.outputChannel.show();
    }

    /**
     * Dispose the output channel
     */
    public dispose(): void {
        this.outputChannel.dispose();
    }

    /**
     * Format a log message with timestamp and level
     */
    private formatMessage(level: string, message: string): string {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level}] ${message}`;
    }

    /**
     * Log a debug message
     */
    public debug(message: string, ...args: any[]): void {
        if (this.logLevel <= LogLevel.DEBUG) {
            const formattedMessage = this.formatMessage('DEBUG', message);
            this.outputChannel.appendLine(formattedMessage);
            if (args.length > 0) {
                this.outputChannel.appendLine(this.formatArgs(args));
            }
        }
    }

    /**
     * Log an info message
     */
    public info(message: string, ...args: any[]): void {
        if (this.logLevel <= LogLevel.INFO) {
            const formattedMessage = this.formatMessage('INFO', message);
            this.outputChannel.appendLine(formattedMessage);
            if (args.length > 0) {
                this.outputChannel.appendLine(this.formatArgs(args));
            }
        }
    }

    /**
     * Log a warning message
     */
    public warn(message: string, ...args: any[]): void {
        if (this.logLevel <= LogLevel.WARN) {
            const formattedMessage = this.formatMessage('WARN', message);
            this.outputChannel.appendLine(formattedMessage);
            if (args.length > 0) {
                this.outputChannel.appendLine(this.formatArgs(args));
            }
        }
    }

    /**
     * Log an error message
     */
    public error(message: string, error?: Error | unknown, ...args: any[]): void {
        if (this.logLevel <= LogLevel.ERROR) {
            const formattedMessage = this.formatMessage('ERROR', message);
            this.outputChannel.appendLine(formattedMessage);

            if (error) {
                if (error instanceof Error) {
                    this.outputChannel.appendLine(`  Error: ${error.message}`);
                    if (error.stack) {
                        this.outputChannel.appendLine(`  Stack: ${error.stack}`);
                    }
                } else {
                    this.outputChannel.appendLine(`  Error: ${String(error)}`);
                }
            }

            if (args.length > 0) {
                this.outputChannel.appendLine(this.formatArgs(args));
            }
        }
    }

    /**
     * Log function entry with parameters
     */
    public enter(functionName: string, params?: Record<string, unknown>): void {
        if (this.logLevel <= LogLevel.DEBUG) {
            const paramStr = params ? ` | Params: ${JSON.stringify(params, null, 2)}` : '';
            this.outputChannel.appendLine(this.formatMessage('ENTER', `${functionName}()${paramStr}`));
        }
    }

    /**
     * Log function exit with result
     */
    public exit(functionName: string, result?: unknown): void {
        if (this.logLevel <= LogLevel.DEBUG) {
            const resultStr = result !== undefined ? ` | Result: ${JSON.stringify(result, null, 2)}` : '';
            this.outputChannel.appendLine(this.formatMessage('EXIT', `${functionName}()${resultStr}`));
        }
    }

    /**
     * Log timing information
     */
    public time(label: string): void {
        if (this.logLevel <= LogLevel.DEBUG) {
            console.time(label);
        }
    }

    /**
     * End timing and log the duration
     */
    public timeEnd(label: string): void {
        if (this.logLevel <= LogLevel.DEBUG) {
            console.timeEnd(label);
        }
    }

    /**
     * Log a section header for better readability
     */
    public section(title: string): void {
        const line = '='.repeat(50);
        this.outputChannel.appendLine(`\n${line}`);
        this.outputChannel.appendLine(`  ${title}`);
        this.outputChannel.appendLine(`${line}\n`);
    }

    /**
     * Format arguments for logging
     */
    private formatArgs(args: any[]): string {
        try {
            return args.map(arg => {
                if (typeof arg === 'object') {
                    return JSON.stringify(arg, null, 2);
                }
                return String(arg);
            }).join('\n');
        } catch {
            return '[Unable to format arguments]';
        }
    }

    /**
     * Log configuration values (masks sensitive data)
     */
    public logConfig(config: Record<string, unknown>): void {
        if (this.logLevel <= LogLevel.DEBUG) {
            const maskedConfig = { ...config };

            // Mask sensitive fields
            if (maskedConfig.apiKey) {
                const apiKey = String(maskedConfig.apiKey);
                maskedConfig.apiKey = apiKey.length > 8
                    ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`
                    : '****';
            }

            this.outputChannel.appendLine(this.formatMessage('CONFIG', JSON.stringify(maskedConfig, null, 2)));
        }
    }
}

/**
 * Convenience function to get the logger instance
 */
export function getLogger(): Logger {
    return Logger.getInstance();
}
