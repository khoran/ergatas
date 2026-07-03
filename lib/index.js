
//import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/js/dist/util.js";
import "bootstrap/js/dist/modal.js";
import "bootstrap/js/dist/tab.js";
import "bootstrap/js/dist/button.js";
import "bootstrap/js/dist/collapse.js";
import "bootstrap/js/dist/dropdown.js";
import "bootstrap/js/dist/carousel.js";

// fix a bug on some systems that complain that console.debug does not exist
console.debug=console.log; 


var ko = require('knockout');
window.ko=ko;
// knockout.mapping's UMD wrapper takes the CommonJS branch under webpack and
// attaches its API to module.exports (not ko.mapping), so assign it explicitly.
// Bundling it removes a separate render-chain script request.
ko.mapping = require('../public/js/knockout.mapping-2.4.1.js');
require('./client/ko-common.js');
//require("./clamp.js");


import alertify from 'alertifyjs';
import  'alertifyjs/build/css/alertify.min.css';
import  'alertifyjs/build/css/themes/default.css';
window.alertify=alertify;

import './scss/styles.scss';
import './scss/filter-side-panel.scss';
import './scss/loader.scss';
import './scss/css-circular-prog-bar.scss';

import ergatas from './client/main';

//export default  Client;

//console.warn("========================= JS STARTS ===========================", (new Date()) - window.performance.timing.navigationStart);

jQuery(function() {
    //console.warn("========================= DOCUMENT READY  ===========================", (new Date()) - window.performance.timing.navigationStart);

    const app= new ergatas.Client(); 
    if(process.env.NODE_ENV === "development")
        window.app = app;
    app.start();

});
