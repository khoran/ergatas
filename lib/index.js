import Client from './main';

var ko = require('knockout');
window.ko=ko;
require('./ko-common.js');

var selectize = require('selectize');
import 'selectize/dist/css/selectize.css';
import 'selectize-bootstrap4-theme/dist/css/selectize.bootstrap4.css';


var $ = require('jquery');
window.jQuery = $;
window.$ = $;


import 'bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@icon/open-iconic/open-iconic.css';


//export viewModel;
export default  Client;