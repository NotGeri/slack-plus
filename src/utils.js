import ps from 'ps-node';
import {join} from 'path';
import fetch from 'node-fetch';
import {existsSync, readdirSync, readFileSync} from 'fs';
import * as net from 'net';

export default class Utils {

    /**
     * Search for a specific task kill any processes that are found
     * @param name The name of the process
     * @returns {Promise<unknown>}
     */
    static killProcess = name => {
        return new Promise(resolve => {
            ps.lookup({command: name}, (err, processes) => {
                // No process found or permission denied; we don't care
                if (err) return resolve();

                // If Slack processes were found, kill them all
                if (processes.length > 0) {
                    for (const slack of processes) {
                        process.kill(slack.pid, 'SIGTERM');
                    }
                }

                return resolve();
            });
        });
    };

    /**
     * Get the location of the latest Slack install in AppData
     * @returns {string|null} The location of the Slack install or null if invalid
     */
    static getSlackLocation = () => {
        const slackDir = join(process.env.LOCALAPPDATA, 'slack');
        if (!existsSync(slackDir)) return null;

        // Get all 'app-XXX' folders
        const subDirs = readdirSync(slackDir).filter(dir => dir.startsWith('app-'));

        // Get all versions by adding the semantic versions together
        const versions = {};
        for (const subDir of subDirs) {
            const version = subDir.replaceAll(/(app|[.-])/ig, '');
            versions[version] = subDir;
        }

        // Get the latest version
        const latestVersion = Math.max(...Object.keys(versions).map(Number));
        if (!latestVersion) return null;

        // Verify path exists
        const exePath = join(slackDir, versions[latestVersion], 'slack.exe');
        if (!existsSync(exePath)) return null;
        return exePath;
    };

    /**
     * Sleep X MS as a promise
     * @param ms The amount of milliseconds to sleep
     * @returns {Promise<unknown>}
     */
    static sleep = async ms => {
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    };

    /**
     * Attempt to get all Electron debugger websockets
     * @param port The port of the Electron remote debugger
     * @param maxAttempts The amount of times we should try before giving up
     * @param data
     * @returns {Promise<*|null|undefined>} The Electron remote debuggers' websockets
     */
    static getElectronSockets = async (port, maxAttempts = 10, data = {}) => {
        if (!data.sockets) data.sockets = {};
        if (!data.attemptCount) data.attemptCount = 0;

        try {
            const windows = await fetch(`http://127.0.0.1:${port}/json/list?t=${Date.now()}`).then(response => response.json());
            for (const window of windows) {
                // We do not want service workers
                if (window?.type !== 'page') continue;

                // See if we have a socket URL
                if (!window.webSocketDebuggerUrl) continue;

                // See if we already stored this
                if (!data.sockets[window.id]) {
                    data.sockets[window.id] = window.webSocketDebuggerUrl;
                }
            }

            // No socket found, let us handle it as an error
            // Todo (notgeri):
            throw new Error('No websockets found in response');

        } catch (e) {
            // See if we should try again in a sec
            if (data.attemptCount < maxAttempts) {
                await Utils.sleep(1000);
                data.attemptCount++;
                return this.getElectronSockets(port, maxAttempts, data);
            }

            return data.sockets;
        }
    };

    /**
     * Read all JS files from a specific dirs and map them to their script file's name
     * @param scriptsPath
     * @returns {Promise<{}>}
     */
    static readScripts = async scriptsPath => {
        const scripts = {};

        const scriptFiles = readdirSync(scriptsPath).filter(file => file.endsWith('.js'));
        for (const scriptFile of scriptFiles) {
            const content = readFileSync(join(scriptsPath, scriptFile));
            if (!content) continue;
            scripts[scriptFile] = content.toString();
        }

        return scripts;
    };
    
}