var path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const Dotenv = require('dotenv-webpack');

var UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const webpack = require('webpack');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

//import path from 'path';
//import Dotenv from 'dotenv-webpack';
//import { CleanWebpackPlugin } from 'clean-webpack-plugin';
//import UglifyJsPlugin  from 'uglifyjs-webpack-plugin';
//import webpack  from 'webpack' ;
//import {BundleAnalyzerPlugin} from 'webpack-bundle-analyzer';

module.exports = {
  entry: {
    'ergatas': './lib/index.js',
    'ergatas.min': './lib/index.js',
  },
  mode: 'development',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    chunkFilename: '[name].js',
    library: 'ergatas',
    globalObject: 'this',
    //libraryTarget: 'umd',
    libraryTarget: 'var',
    publicPath: 'https://localhost:9000/',
  },
  //externals:{
    //jquery:"jQuery",
  //},
  module: {
    rules: [
      {
        test: /\.(js)$/,
        exclude: /(node_modules)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-env',
              //["env",{modules:false}],
            ]
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
        test:/\.(woff|woff2)$/,
        use: ['url-loader'],
      },
      {
        test:/\.html$/,
        use: ['html-loader'],
      }
    ]
  },
  watchOptions: {
    ignored: [/node_modules/],
  },
  optimization: {
    minimize: true,
    minimizer: [new UglifyJsPlugin({
      include: /\.min\.js$/
    })]
  },
  plugins: [
    new CleanWebpackPlugin(),
    new Dotenv(),
    new webpack.optimize.ModuleConcatenationPlugin(),
    //new BundleAnalyzerPlugin(),
  ],
  devServer: {
	  hot:false,
	  inline:false
  }
};
