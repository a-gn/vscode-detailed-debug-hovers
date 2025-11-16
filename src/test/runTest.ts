/**
 * Originally written by Claude (Sonnet 4.5) on 2025/11/14
 */

import * as path from 'path';
import { runTests, downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import { spawn } from 'child_process';

async function installPythonExtension(vscodeExecutablePath: string): Promise<void> {
    const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

    return new Promise((resolve, reject) => {
        const installProcess = spawn(cli, [...args, '--install-extension', 'ms-python.python', '--force'], {
            stdio: 'inherit'
        });

        installProcess.on('close', (code: number | null) => {
            if (code !== 0) {
                reject(new Error(`Failed to install Python extension, exit code: ${code}`));
            } else {
                console.log('Python extension installed successfully');
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

        // Download VSCode if needed and install Python extension for integration tests
        const vscodeExecutablePath = await downloadAndUnzipVSCode();
        await installPythonExtension(vscodeExecutablePath);

        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [testWorkspace]
        });
    } catch (err) {
        console.error('Failed to run tests:', err);
        process.exit(1);
    }
}

main();
