
import "core-js/stable";
import "regenerator-runtime/runtime";

var ko = require('knockout');
window.ko=ko;
require('./ko-common.js');

var selectize = require('selectize');
import 'selectize/dist/css/selectize.css';
import 'selectize-bootstrap4-theme/dist/css/selectize.bootstrap4.css';
import 'filepond/dist/filepond.min.css';
import FilePondPluginFileValidateSize from 'filepond-plugin-file-validate-size';
import FilePondPluginImagePreview from 'filepond-plugin-image-preview';
import 'filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css';
import FilePondPluginImageResize from 'filepond-plugin-image-resize';
import FilePondPluginImageExifOrientation from 'filepond-plugin-image-exif-orientation';





var $ = require('jquery');
window.jQuery = $;
window.$ = $;


import 'bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@icon/open-iconic/open-iconic.css';

import Client from './main';

//export viewModel;
export default  Client;