
import "core-js/stable";
import "regenerator-runtime/runtime";

var ko = require('knockout');
window.ko=ko;
require('./ko-common.js');

var selectize = require('selectize');
import 'selectize/dist/css/selectize.css';
import 'selectize-bootstrap4-theme/dist/css/selectize.bootstrap4.css';

import * as FilePond from 'filepond';
window.FilePond= FilePond;



var $ = require('jquery');
window.jQuery = $;
window.$ = $;


import 'bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@icon/open-iconic/open-iconic.css';

import Client from './main';

//export viewModel;
export default  Client;