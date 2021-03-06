import {
    SRC,
    JS_SRC,
    DIST,
    LIB_NAME,
    NODE_MODULES,
} from './constants';

module.exports = {
    mode: 'production',
    entry: {
        'trezor-connect': `${JS_SRC}index.js`,
    },
    output: {
        filename: '[name].js',
        path: DIST,
        publicPath: './',
        library: LIB_NAME,
        libraryTarget: 'umd',
        libraryExport: 'default',
    },
    module: {
        rules: [
            {
                test: /\.jsx?$/,
                exclude: /node_modules/,
                use: ['babel-loader'],
            },
        ],
    },
    resolve: {
        modules: [ SRC, NODE_MODULES ],
    },
    performance: {
        hints: false,
    },
    plugins: [],

    optimization: {
        minimize: false,
    },

    // ignoring Node.js import in fastxpub (hd-wallet)
    node: {
        fs: 'empty',
        path: 'empty',
    },
};
