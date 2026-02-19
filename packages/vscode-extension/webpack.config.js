const path = require('path');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    target: 'node', // VSCode extensions run in a Node.js-context
    mode: 'none', // this leaves the source code as close as possible to the original

    entry: './src/extension.ts', // the entry point of this extension
    output: {
        // the bundle is stored in the 'dist' folder (check package.json)
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2'
    },
    cache: {
        type: 'filesystem',
        buildDependencies: {
            config: [__filename]
        }
    },
    devtool: 'nosources-source-map',
    externals: {
        vscode: 'commonjs vscode', // the vscode-module is created on-the-fly and must be excluded
        '@tan-yong-sheng/sqlite-vec-wasm-node': 'commonjs @tan-yong-sheng/sqlite-vec-wasm-node' // WASM package loads .wasm file at runtime
    },
    resolve: {
        // support reading TypeScript and JavaScript files
        extensions: ['.ts', '.js'],
        alias: {
            '@tan-yong-sheng/code-context-core': path.resolve(__dirname, '../core/dist/index.js'),
            '@tan-yong-sheng/code-context-core/dist/splitter': path.resolve(__dirname, '../core/dist/splitter'),
            '@tan-yong-sheng/code-context-core/dist/embedding': path.resolve(__dirname, '../core/dist/embedding'),
            '@tan-yong-sheng/code-context-core/dist/vectordb': path.resolve(__dirname, '../core/dist/vectordb')
        },
        // Fallback for optional ws dependencies (bufferutil and utf-8-validate)
        // These are native addons that ws uses for performance, but falls back to JS if not available
        fallback: {
            bufferutil: false,
            'utf-8-validate': false
        }
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            transpileOnly: true,
                            onlyCompileBundledFiles: true
                        }
                    }
                ]
            },
            {
                test: /\.wasm$/,
                type: 'webassembly/async'
            },
            {
                test: /tree-sitter.*\.wasm$/,
                type: 'asset/resource',
                generator: {
                    filename: 'wasm/[name][ext]'
                }
            }
        ]
    },
    experiments: {
        asyncWebAssembly: true
    },
    // Ignore warnings that are expected and don't affect functionality
    ignoreWarnings: [
        // Ignore warnings from ws optional dependencies
        { module: /ws\/lib\/buffer-util\.js/ },
        { module: /ws\/lib\/validation\.js/ }
    ],
    plugins: [
        // Ignore only native tree-sitter modules that cause issues in VSCode extension context
        // but allow web-tree-sitter to be bundled
        new webpack.IgnorePlugin({
            resourceRegExp: /^tree-sitter$/
        }),

        // Replace AST splitter with stub since it depends on tree-sitter
        new webpack.NormalModuleReplacementPlugin(
            /.*ast-splitter(\.js)?$/,
            path.resolve(__dirname, 'src/stubs/ast-splitter-stub.js')
        ),

        // Copy web-tree-sitter.wasm and language parsers to dist directory for runtime loading
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, '../../node_modules/web-tree-sitter/tree-sitter.wasm'),
                    to: path.resolve(__dirname, 'dist/tree-sitter.wasm')
                },
                // Copy all WASM parsers from wasm directory
                {
                    from: path.resolve(__dirname, 'wasm'),
                    to: path.resolve(__dirname, 'dist/wasm'),
                    globOptions: {
                        ignore: ['**/.DS_Store']
                    }
                }
            ]
        })
    ]
};
