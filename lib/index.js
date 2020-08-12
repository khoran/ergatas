
import "core-js/stable";
import "regenerator-runtime/runtime";

// imported via cdn 
import $ from 'jquery';
window.jQuery = $;
window.$ = $;


var ko = require('knockout');
window.ko=ko;
require('./ko-common.js');

//import * as FilePond from 'filepond';
//window.FilePond= FilePond;


import './scss/styles.scss';

// via cdn //import 'bootstrap';
// via cdn // import 'bootstrap/dist/css/bootstrap.min.css';
//import '@icon/open-iconic/open-iconic.css';
// via cdn now //import '@fortawesome/fontawesome-free/css/regular.css';

import Client from './main';

//export viewModel;
export default  Client;

jQuery(document).ready(function() {window.app= new ergatas.default.Client(); });