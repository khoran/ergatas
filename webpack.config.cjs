// Node 17+ / OpenSSL 3 dropped MD4. Redirect it to SHA256 for all loaders
// (babel-loader, css-loader, loader-utils, etc.) that still request 'md4'.
const crypto = require('crypto');
const _origCreateHash = crypto.createHash.bind(crypto);
crypto.createHash = (algorithm, ...args) =>
  _origCreateHash(algorithm === 'md4' ? 'sha256' : algorithm, ...args);

var path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const {InjectManifest} = require('workbox-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin')

//const { v4: uuidv4 } = require('uuid');
const md5File = require('md5-file');


const Dotenv = require('dotenv-webpack');

//var UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const webpack = require('webpack');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const MiniCssExtractPlugin = require('mini-css-extract-plugin')

const fs = require('fs');
const packageJson = fs.readFileSync('./package.json');
const version = JSON.parse(packageJson).version || 0;

function stripImportAttributesPlugin() {
  return {
    visitor: {
      ImportDeclaration(path) {
        if (path.node.attributes && path.node.attributes.length) {
          path.node.attributes = [];
        }

        if (path.node.assertions && path.node.assertions.length) {
          path.node.assertions = [];
        }
      },
    },
  };
}

function shouldTranspileModule(modulePath) {
  return [
    /node_modules\/@uppy\//,
    /node_modules\/is-network-error\//,
    /node_modules\/p-queue\//,
    /node_modules\/p-retry\//,
    /node_modules\/p-timeout\//,
  ].some((pattern) => pattern.test(modulePath));
}

console.log("VERSION: "+version);


// Env-aware build. `npm run build` sets NODE_ENV=production (minified, CSS
// extracted, no source maps). Anything else (e.g. `webpack --watch`, build.sh)
// defaults to a development build: unminified, fast rebuilds, source maps, and
// style-loader CSS injection. This `isDevelopment` flag also drives the SASS
// loader choice in module.rules below, so CSS delivery is env-switched too.
const isDevelopment = process.env.NODE_ENV !== 'production';


module.exports = {
  entry: {
    'ergatas': './lib/index.js',
    'ergatas.min': './lib/index.js',
  },
  mode: isDevelopment ? 'development' : 'production',
  // Source maps in dev only; production ships none (smaller, source not exposed).
  devtool: isDevelopment ? 'eval-cheap-module-source-map' : false,
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    chunkFilename: '[name].js',
    library: 'ergatas',
    globalObject: 'this',
    //libraryTarget: 'umd',
    libraryTarget: 'var',
    //publicPath: 'https://localhost:9000/',
    publicPath: '/',
    hashFunction: 'sha256',
  },
  resolve: {
    alias: {
      '@uppy/companion-client$': path.resolve(__dirname, 'node_modules/@uppy/companion-client/lib/index.js'),
      '@uppy/core$': path.resolve(__dirname, 'node_modules/@uppy/core/lib/index.js'),
      '@uppy/dashboard$': path.resolve(__dirname, 'node_modules/@uppy/dashboard/lib/index.js'),
      '@uppy/dropbox$': path.resolve(__dirname, 'node_modules/@uppy/dropbox/lib/index.js'),
      '@uppy/facebook$': path.resolve(__dirname, 'node_modules/@uppy/facebook/lib/index.js'),
      '@uppy/google-drive-picker$': path.resolve(__dirname, 'node_modules/@uppy/google-drive-picker/lib/index.js'),
      '@uppy/image-editor$': path.resolve(__dirname, 'node_modules/@uppy/image-editor/lib/index.js'),
      '@uppy/instagram$': path.resolve(__dirname, 'node_modules/@uppy/instagram/lib/index.js'),
      '@uppy/onedrive$': path.resolve(__dirname, 'node_modules/@uppy/onedrive/lib/index.js'),
      '@uppy/provider-views$': path.resolve(__dirname, 'node_modules/@uppy/provider-views/lib/index.js'),
      '@uppy/screen-capture$': path.resolve(__dirname, 'node_modules/@uppy/screen-capture/lib/index.js'),
      '@uppy/store-default$': path.resolve(__dirname, 'node_modules/@uppy/store-default/lib/index.js'),
      '@uppy/thumbnail-generator$': path.resolve(__dirname, 'node_modules/@uppy/thumbnail-generator/lib/index.js'),
      '@uppy/transloadit$': path.resolve(__dirname, 'node_modules/@uppy/transloadit/lib/index.js'),
      '@uppy/tus$': path.resolve(__dirname, 'node_modules/@uppy/tus/lib/index.js'),
      '@uppy/utils$': path.resolve(__dirname, 'node_modules/@uppy/utils/lib/index.js'),
      '@uppy/webcam$': path.resolve(__dirname, 'node_modules/@uppy/webcam/lib/index.js'),
      'is-network-error$': path.resolve(__dirname, 'node_modules/is-network-error/index.js'),
      'p-queue$': path.resolve(__dirname, 'node_modules/p-queue/dist/index.js'),
      'p-retry$': path.resolve(__dirname, 'node_modules/p-retry/index.js'),
      'p-timeout$': path.resolve(__dirname, 'node_modules/p-timeout/index.js'),
    },
  },
  externals:{
    jquery:"jQuery",
  },
  module: {
    rules: [
      {
        test: /\.(js)$/,
        exclude: (modulePath) => /node_modules/.test(modulePath) && !shouldTranspileModule(modulePath),
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-env',
              //["env",{modules:false}],
            ],
            plugins: [
              '@babel/plugin-syntax-import-attributes',
              '@babel/plugin-transform-class-properties',
              '@babel/plugin-transform-private-methods',
              '@babel/plugin-transform-private-property-in-object',
              stripImportAttributesPlugin,
            ],
          }
        }
      },
      {
        test:/\.css$/,
        use: ['style-loader','css-loader'],
      },
      {
        test:/\.(jpg)$/,
        use: ['file-loader?name=[name].[ext]'],
      },
      {
        test:/\.(ttf|otf|eot|svg|png)$/,
        use: ['file-loader'],
      },
      {
        test:/\.(woff|woff2)$/,
        use: ['url-loader'],
      },
      {
        test:/\.html$/,
        use: ['html-loader'],
      },
      {
        test: /\.module\.s(a|c)ss$/,
        loader: [
          isDevelopment ? 'style-loader' : MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: {
              modules: true,
              sourceMap: isDevelopment
            }
          },
          {
            loader: 'sass-loader',
            options: {
              sourceMap: isDevelopment,
              sassOptions: {
                silenceDeprecations: ['import', 'legacy-js-api', 'global-builtin', 'if-function'],
              },
            }
          }
        ]
      },
      {
        test: /\.s(a|c)ss$/,
        exclude: /\.module.(s(a|c)ss)$/,
        loader: [
          isDevelopment ? 'style-loader' : MiniCssExtractPlugin.loader,
          'css-loader',
          {
            loader: 'sass-loader',
            options: {
              sourceMap: isDevelopment,
              sassOptions: {
                silenceDeprecations: ['import', 'legacy-js-api', 'global-builtin', 'if-function'],
              },
            }
          }
        ]
      }

    ]
  },
  //watch:true,
  watchOptions: {
    ignored: [/node_modules/],
  },
  optimization: {
    minimize: !isDevelopment,
    minimizer: [new TerserPlugin({
      // Cache + parallelize for faster rebuilds.
      cache: true,
      parallel: true,
      terserOptions: {
        // Keep class/function names: app registers Knockout components and
        // some libs (Uppy/Stripe) introspect names. Costs a little size but
        // avoids subtle name-mangling breakage. Revisit once verified safe.
        keep_classnames: true,
        keep_fnames: true,
      },
    })],
  },
  plugins: [
    new CleanWebpackPlugin(),
    new Dotenv(),
    new webpack.optimize.ModuleConcatenationPlugin(),
    new MiniCssExtractPlugin(),
    //new GenerateSW(),
    new InjectManifest({
      swSrc: path.resolve(__dirname, 'lib/client/service-worker.js'),
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,

      //by excluding these, the service worker won't change, which means the user
      // won't be bothered to update it. js/html changes will be applied
      // after 2 reloads.
      //If this is not used (commented), then the service worker changes anytime
      // the js/html/css changes and will prompt the user within an hour or so to reload
      // the page to get the new changes. Seems better to do this for those using as an app.
      //exclude: [/ergatas\.(js|min\.js|css|min\.css)/],

      
      additionalManifestEntries:[
        {
          url:'index.html',
          revision: md5File.sync(path.resolve(__dirname,"lib/page-templates/index.html"))
        }],
    }),

    new webpack.DefinePlugin({
      'process.env.PACKAGE_VERSION':  '"' + version + '"'
    }),

    new CopyWebpackPlugin([ {
      from: './node_modules/@fortawesome/fontawesome-free/webfonts', 
      to: './webfonts',
      copyUnmodified: true
    }]),

    //new BundleAnalyzerPlugin(),
  ],
  devServer: {
	  hot:false,
	  inline:false
  }
};
