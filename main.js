/*
API-Documentation
https://www.powerfox.energy/wp-content/uploads/2020/05/powerfox-Kunden-API.pdf
*/

'use strict';

const utils       = require('@iobroker/adapter-core'); // Get common adapter utils
const tools       = require('./lib/tools');
const adapterName = require('./package.json').name.split('.').pop();
const request     = require('request');

let channels = [];
let iopkg;
let isStopped = false;
let adapter;

function startAdapter(options) {
    options = options || {};
    Object.assign(options, {
        name: adapterName,
        useFormatDate: true,
        unload: cb => {
            killSwitchTimeout && clearTimeout(killSwitchTimeout);
            killSwitchTimeout = null;
            cb && cb();
        }
    });
    adapter = new utils.Adapter(options);

    adapter.on('ready', () => {
        adapter.log.debug("start");

        adapter.getForeignObject('system.config', (err, systemConfig) => {
            if (adapter.config.password && (!adapter.supportsFeature || !adapter.supportsFeature('ADAPTER_AUTO_DECRYPT_NATIVE'))) {
                adapter.config.password = tools.decrypt((systemConfig && systemConfig.native && systemConfig.native.secret) || '5Cd6dDqzq8bBbKJ9', adapter.config.password);
            }

            if(/[\x00-\x08\x0E-\x1F\x80-\xFF]/.test(adapter.config.password)){
                adapter.log.error('Password error: Please re-enter the password in Admin.');
                killAdapter();
            }

            if(!adapter.config.email || !adapter.config.password){
                adapter.log.error("Credential error: Please configurate Adapter first!");
                killAdapter();
            }

            if(!(adapter.config.devices && adapter.config.devices.length)){
                adapter.log.error("Devicelist error: Please define device(s) first!");
                killAdapter();
            }

            // create basic auth string
            let auth = 'Basic ' + Buffer.from(adapter.config.email + ':' + adapter.config.password).toString('base64');

            // https://backend.powerfox.energy/api/2.0/my/{device}/current
            let dataUrl = "https://backend.powerfox.energy/api/2.0/my/{device}/current";

            adapter.log.debug(adapter.config.email);
            adapter.log.debug(adapter.config.password);
            adapter.log.debug(adapter.config.devices);
            adapter.log.debug(auth);
            adapter.log.debug(dataUrl);

            // request({
            //     method: 'GET',
            //     rejectUnauthorized: false,
            //     url: dataUrl
            // }, (error, response, body) => {
            //     if (!error && response.statusCode === 200) {
            //         let data = JSON.parse(body);
            //         if(typeof data == 'object' && data.hasOwnProperty("message")){
            //             adapter.log.error('Wrong JSON returned');
            //             killAdapter();
            //         } else {
            //             // do action
            //         }
            //     } else {
            //         adapter.log.error('Cannot read JSON file: ' + error || response.statusCode);
            //         killAdapter();
            //     }
            //     killAdapter();
            // });

        });

        adapter.log.debug("end");
    });

    return adapter;
}

function createVarName(text){
    return text.toLowerCase().replace(/\s/g, '_').replace(/[^\x20\x2D0-9A-Z\x5Fa-z\xC0-\xD6\xF8-\xFF]/g, '');
}

function killAdapter(){
    setImmediate(() => {
        killSwitchTimeout && clearTimeout(killSwitchTimeout);
        isStopped = true;
        adapter.stop ? adapter.stop() : adapter.terminate();
    });
}

let killSwitchTimeout = setTimeout(() => {
    killSwitchTimeout = null;
    if (!isStopped) {
        adapter && adapter.log && adapter.log.info('force terminating after 4 minutes');
        adapter && adapter.stop && adapter.stop();
    }
}, 240000);

// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}