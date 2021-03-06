/* @flow */
'use strict';

import AbstractMethod from './AbstractMethod';
import { validateParams, getFirmwareRange } from './helpers/paramsValidator';
import { getBitcoinNetwork } from '../../data/CoinInfo';
import { getLabel } from '../../utils/pathUtils';
import { NO_COIN_INFO } from '../../constants/errors';

import BlockBook, { create as createBackend } from '../../backend';
import * as helper from './helpers/signtx';

import {
    validateTrezorInputs,
    validateTrezorOutputs,
    inputToHD,
    getReferencedTransactions,
    transformReferencedTransactions,
} from './tx';

import type {
    TransactionInput,
    TransactionOutput,
    SignedTx,
} from '../../types/trezor';

import type {
    BuildTxInput,
} from 'hd-wallet';

import type { CoreMessage, BitcoinNetworkInfo } from '../../types';

type Params = {
    inputs: Array<TransactionInput>,
    hdInputs: Array<BuildTxInput>,
    outputs: Array<TransactionOutput>,
    locktime: ?number,
    timestamp: ?number,
    coinInfo: BitcoinNetworkInfo,
    push: boolean,
}

export default class SignTransaction extends AbstractMethod {
    params: Params;
    backend: BlockBook;

    constructor(message: CoreMessage) {
        super(message);
        this.requiredPermissions = ['read', 'write'];
        this.info = 'Sign transaction';

        const payload: Object = message.payload;

        // validate incoming parameters
        validateParams(payload, [
            { name: 'inputs', type: 'array', obligatory: true },
            { name: 'outputs', type: 'array', obligatory: true },
            { name: 'locktime', type: 'number' },
            { name: 'timestamp', type: 'number' },
            { name: 'coin', type: 'string', obligatory: true },
            { name: 'push', type: 'boolean' },
        ]);

        const coinInfo: ?BitcoinNetworkInfo = getBitcoinNetwork(payload.coin);
        if (!coinInfo) {
            throw NO_COIN_INFO;
        } else {
            // set required firmware from coinInfo support
            this.firmwareRange = getFirmwareRange(this.name, coinInfo, this.firmwareRange);
            this.info = getLabel('Sign #NETWORK transaction', coinInfo);
        }

        payload.inputs.forEach(utxo => {
            validateParams(utxo, [
                { name: 'amount', type: 'string' },
            ]);
        });

        payload.outputs.forEach(utxo => {
            validateParams(utxo, [
                { name: 'amount', type: 'string' },
            ]);
        });

        const inputs: Array<TransactionInput> = validateTrezorInputs(payload.inputs, coinInfo);
        const hdInputs: Array<BuildTxInput> = inputs.map(inputToHD);
        const outputs: Array<TransactionOutput> = validateTrezorOutputs(payload.outputs, coinInfo);

        const total: number = outputs.reduce((t, r) => t + r.amount, 0);
        if (total <= coinInfo.dustLimit) {
            throw new Error('Total amount is too low.');
        }

        this.params = {
            inputs,
            hdInputs,
            outputs: payload.outputs,
            locktime: payload.locktime,
            timestamp: payload.timestamp,
            coinInfo,
            push: payload.hasOwnProperty('push') ? payload.push : false,
        };

        if (coinInfo.hasTimestamp && !payload.hasOwnProperty('timestamp')) {
            const d = new Date();
            this.params.timestamp = Math.round(d.getTime() / 1000);
        }
    }

    async run(): Promise<SignedTx> {
        // initialize backend
        this.backend = await createBackend(this.params.coinInfo);
        const bjsRefTxs = await this.backend.loadTransactions(getReferencedTransactions(this.params.hdInputs));
        const refTxs = transformReferencedTransactions(bjsRefTxs);

        const response = await helper.signTx(
            this.device.getCommands().typedCall.bind(this.device.getCommands()),
            this.params.inputs,
            this.params.outputs,
            refTxs,
            this.params.coinInfo,
            this.params.locktime,
            this.params.timestamp,
        );

        if (this.params.push) {
            const txid: string = await this.backend.sendTransactionHex(response.serializedTx);
            return {
                ...response,
                txid,
            };
        }

        return response;
    }
}
