var path = require('path');
//var CleanWebpackPlugin = require('clean-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
 
var UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  entry: {
    'ergatas': './lib/index.js',
    'ergatas.min': './lib/index.js',
  },
  mode: 'development',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    library: 'ergatas',
    globalObject: 'this',
    //libraryTarget: 'umd',
    libraryTarget: 'var',
  },
  module: {
    rules: [
      {
        test: /\.(js)$/,
        exclude: /(node_modules)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      },
      {
        test:/\.css$/,
        use: ['style-loader','css-loader'],
      },
      {
        test:/\.(ttf|otf|eot|svg)$/,
        use: ['file-loader'],
      },
      {
        test:/\.woff$/,
        use: ['url-loader'],
      }
    ]
  },
//  optimization: {
//    minimize: true,
//    minimizer: [new UglifyJsPlugin({
//      include: /\.min\.js$/
//    })]
//  },
  plugins: [
    new CleanWebpackPlugin(),
   // new webpack.ProvidePlugin({
   //   identifier: ['bootstrap'],
   //   $: 'jquery',
   //   jQuery: 'jquery',
   // }),
  ]
};
