import ps from 'ps-node';
import {join} from 'path';
import fetch from 'node-fetch';
import {existsSync, readdirSync, readFileSync} from 'fs';
import * as net from 'net';

export default class Utils {

    static MINIMUM_TCP_PORT = 1024;
    static MAXIMUM_TCP_PORT = 65535;

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
     * Attempt to collect all Electron debugger websockets
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

            // We have all the sockets we need
            if (Object.keys(data.sockets).length >= 2) return data.sockets;

        } catch (e) {
            // We do not care
        }

        // See if we should try again in a sec
        if (data.attemptCount < maxAttempts) {
            await Utils.sleep(1000);
            data.attemptCount++;
            return this.getElectronSockets(port, maxAttempts, data);
        }

        return data.sockets;
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

    /**
     * Attempt to get a free port by starting our own temporary server on it
     * This will recursively try ports between your minimum port and the max TCP one
     * @param startPort The minimum port to try, 1024 by default
     * @returns {Promise<null|number>} A free port or null if there were none free in that range
     */
    static getFreePort = async (startPort = this.MINIMUM_TCP_PORT) => {
        const server = net.createServer();

        /**
         * Helper function to wrap the listen function into a promise
         * @param server The server to listen for
         * @param port The port ot listen on
         * @returns {Promise<unknown>}
         */
        const listen = (server, port) => {
            return new Promise((resolve, reject) => {
                // Listen to errors and reject if we see any
                server.on('error', err => {
                    reject(err);
                });

                // Attempt to start temporary server on the port
                server.listen(port, err => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        };

        // Attempt to listen on ports until one works
        let port = startPort;
        while (port < this.MAXIMUM_TCP_PORT) {
            console.info(`Trying port ${port}..`);

            try {
                await listen(server, port);
                server.close();
                return port;
            } catch (err) {
                port++;
            }
        }

        return null;
    };
}