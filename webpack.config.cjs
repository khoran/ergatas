var path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const {InjectManifest} = require('workbox-webpack-plugin');

//const { v4: uuidv4 } = require('uuid');
const md5File = require('md5-file');


const Dotenv = require('dotenv-webpack');

var UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const webpack = require('webpack');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const MiniCssExtractPlugin = require('mini-css-extract-plugin')


//const isDevelopment = process.env.NODE_ENV === 'development'
const isDevelopment = false;

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
    //publicPath: 'https://localhost:9000/',
    publicPath: '/',
  },
  externals:{
    jquery:"jQuery",
  },
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
              sourceMap: isDevelopment
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
              sourceMap: isDevelopment
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
    minimize: true,
    minimizer: [new UglifyJsPlugin({
      include: /\.min\.js$/
    })]
  },
  plugins: [
    new CleanWebpackPlugin(),
    new Dotenv(),
    new webpack.optimize.ModuleConcatenationPlugin(),
    new MiniCssExtractPlugin(),
    //new GenerateSW(),
    new InjectManifest({
      swSrc: path.resolve(__dirname, 'lib/service-worker.js'),

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



    //new BundleAnalyzerPlugin(),
  ],
  devServer: {
	  hot:false,
	  inline:false
  }
};
