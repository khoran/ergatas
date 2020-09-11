
import "core-js/stable";
import "regenerator-runtime/runtime";


var ko = require('knockout');
window.ko=ko;
require('./ko-common.js');


import alertify from 'alertifyjs';
import  'alertifyjs/build/css/alertify.min.css';
import  'alertifyjs/build/css/themes/bootstrap.css';
window.alertify=alertify;

import './scss/styles.scss';
import './scss/filter-side-panel.scss';

import ergatas from './main';

//export default  Client;

//console.warn("========================= JS STARTS ===========================", (new Date()) - window.performance.timing.navigationStart);

jQuery(function() {
    //console.warn("========================= DOCUMENT READY  ===========================", (new Date()) - window.performance.timing.navigationStart);

    const app= new ergatas.Client(); 
    if(process.env.NODE_ENV === "development")
        window.app = app;
    app.start();

});