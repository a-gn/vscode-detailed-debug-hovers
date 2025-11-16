/**
 * Originally written by Claude (Sonnet 4.5) on 2025/11/14
 */

import * as path from 'path';
import { runTests, downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import { spawn } from 'child_process';

async function installPythonExtensions(vscodeExecutablePath: string): Promise<void> {
    const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

    // Install Python extension
    await new Promise<void>((resolve, reject) => {
        console.log('Installing Python extension (ms-python.python)...');
        const installProcess = spawn(cli, [...args, '--install-extension', 'ms-python.python', '--force'], {
            stdio: 'inherit'
        });

        installProcess.on('close', (code: number | null) => {
            if (code !== 0) {
                reject(new Error(`Failed to install Python extension, exit code: ${code}`));
            } else {
                console.log('✓ Python extension installed successfully');
                resolve();
            }
        });
    });

    // Install Python Debugger extension (required for debugpy support)
    await new Promise<void>((resolve, reject) => {
        console.log('Installing Python Debugger extension (ms-python.debugpy)...');
        const installProcess = spawn(cli, [...args, '--install-extension', 'ms-python.debugpy', '--force'], {
            stdio: 'inherit'
        });

        installProcess.on('close', (code: number | null) => {
            if (code !== 0) {
                reject(new Error(`Failed to install Python Debugger extension, exit code: ${code}`));
            } else {
                console.log('✓ Python Debugger extension installed successfully');
                resolve();
            }
        });
    });

    // Install Python Environments extension (for Python environment discovery)
    await new Promise<void>((resolve, reject) => {
        console.log('Installing Python Environments extension (ms-python.vscode-python-envs)...');
        const installProcess = spawn(cli, [...args, '--install-extension', 'ms-python.vscode-python-envs', '--force'], {
            stdio: 'inherit'
        });

        installProcess.on('close', (code: number | null) => {
            if (code !== 0) {
                reject(new Error(`Failed to install Python Environments extension, exit code: ${code}`));
            } else {
                console.log('✓ Python Environments extension installed successfully');
                resolve();
            }
        });
    });
}

async function main() {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');
        const extensionTestsPath = path.resolve(__dirname, './suite/index');
        const testWorkspace = path.resolve(__dirname, '../../');

        // Download VSCode if needed and install Python extensions for integration tests
        const vscodeExecutablePath = await downloadAndUnzipVSCode();
        await installPythonExtensions(vscodeExecutablePath);

        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                testWorkspace,
                '--enable-proposed-api=ms-python.python',
                '--enable-proposed-api=ms-python.debugpy',
                '--enable-proposed-api=ms-python.vscode-python-envs'
            ]
        });
    } catch (err) {
        console.error('Failed to run tests:', err);
        process.exit(1);
    }
}

main();
