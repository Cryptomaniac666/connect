/* @flow */
'use strict';

import { httpRequest } from '../utils/networkUtils';
import { parseBridgeJSON } from '../utils/browser';
import { DEFAULT_PRIORITY } from '../data/ConnectSettings';
import { parseCoinsJson } from './CoinInfo';
import { parseFirmware } from './FirmwareInfo';
import { Promise } from 'es6-promise';
import parseUri from 'parse-uri';
import * as bowser from 'bowser';
import semvercmp from 'semver-compare';

import type { ConnectSettings } from '../data/ConnectSettings';

type WhiteList = {
    +priority: number,
    +origin: string,
}
type KnownHost = {
    +origin: string,
    +label?: string,
    +icon?: string,
}
type WebUSB = {
    +vendorId: string,
    +productId: string,
}
type Browser = {
    +version: number,
    +download: string,
    +update: string,
}
type Resources = {
    bridge: string,
}
type Asset = {
    name: string,
    type?: string,
    url: string,
}
export type Config = {
    +whitelist: Array<WhiteList>,
    +knownHosts: Array<KnownHost>,
    +webusb: Array<WebUSB>,
    +resources: Resources,
    +assets: Array<Asset>,
    +supportedBrowsers: { [key: string]: Browser },
    +supportedFirmware: Array<{|
        +coinType?: string,
        +coin?: string,
        +excludedMethods?: Array<string>,
        +min?: Array<string>,
        +max?: Array<string>,
    |}>,
}

type AssetCollection = { [key: string]: JSON };

// TODO: transform json to flow typed object
const parseConfig = (json: any): Config => {
    const config: Config = json;
    return config;
};

export default class DataManager {
    static config: Config;
    static assets: AssetCollection = {};
    static settings: ConnectSettings;

    static async load(settings: ConnectSettings): Promise<void> {
        const ts: number = new Date().getTime();
        const configUrl: string = `${settings.configSrc}?r=${ ts }`;

        try {
            this.settings = settings;
            const config: JSON = await httpRequest(configUrl, 'json');
            this.config = parseConfig(config);

            // check if origin is localhost or trusted
            const isLocalhost: boolean = location.hostname === 'localhost';
            const whitelist: ?WhiteList = DataManager.isWhitelisted(this.settings.origin || '');
            this.settings.trustedHost = (isLocalhost || !!whitelist) && !this.settings.popup;
            // ensure that popup will be used
            if (!this.settings.trustedHost) {
                this.settings.popup = true;
            }
            // ensure that debug is disabled
            if (this.settings.debug && !this.settings.trustedHost && !whitelist) {
                this.settings.debug = false;
            }
            this.settings.priority = DataManager.getPriority(whitelist);

            const knownHost: ?KnownHost = DataManager.getHostLabel(this.settings.extension || this.settings.origin || '');
            if (knownHost) {
                this.settings.hostLabel = knownHost.label;
                this.settings.hostIcon = knownHost.icon;
            }

            for (const asset of this.config.assets) {
                const json: JSON = await httpRequest(`${asset.url}?r=${ ts }`, asset.type || 'json');
                this.assets[ asset.name ] = json;
            }

            // hotfix webusb + chrome:72
            const browserName = bowser.name.toLowerCase();
            if (this.settings.popup && (browserName === 'chrome' || browserName === 'chromium')) {
                if (semvercmp(bowser.version, '72') >= 0) {
                    this.settings.webusb = false;
                }
            }

            // parse bridge JSON
            this.assets['bridge'] = parseBridgeJSON(this.assets['bridge']);

            // parse coins definitions
            parseCoinsJson(this.assets['coins']);

            // parse firmware definitions
            parseFirmware(this.assets['firmware-t1']);
            parseFirmware(this.assets['firmware-t2']);
        } catch (error) {
            throw error;
        }
    }

    static getMessages(): JSON {
        return this.assets['messages'];
    }

    static isWhitelisted(origin: string): ?WhiteList {
        if (!this.config) return null;
        const uri = parseUri(origin);
        if (uri && typeof uri.host === 'string') {
            const parts: Array<string> = uri.host.split('.');
            if (parts.length > 2) {
                // subdomain
                uri.host = parts.slice(parts.length - 2, parts.length).join('.');
            }
            return this.config.whitelist.find(item => (item.origin === origin || item.origin === uri.host));
        }
    }

    static getPriority(whitelist: ?WhiteList): number {
        if (whitelist) {
            return whitelist.priority;
        }
        return DEFAULT_PRIORITY;
    }

    static getHostLabel(origin: string): ?KnownHost {
        return this.config.knownHosts.find(host => host.origin === origin);
    }

    static getSettings(key: ?string): any {
        if (!this.settings) return null;
        if (typeof key === 'string') {
            return this.settings[key];
        }
        return this.settings;
    }

    static getDebugSettings(type: string): boolean {
        return false;
    }

    static getConfig(): Config {
        return this.config;
    }

    static getLatestBridgeVersion(): JSON {
        return DataManager.assets.bridge;
    }
}
