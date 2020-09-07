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
        adapter.getForeignObject('system.config', (err, systemConfig) => {
            if (adapter.config.password && (!adapter.supportsFeature || !adapter.supportsFeature('ADAPTER_AUTO_DECRYPT_NATIVE'))) {
                adapter.config.password = tools.decrypt((systemConfig && systemConfig.native && systemConfig.native.secret) || '5Cd6dDqzq8bBbKJ9', adapter.config.password);
            }

            if(/[\x00-\x08\x0E-\x1F\x80-\xFF]/.test(adapter.config.password)){
                adapter.log.error('Password error: Please re-enter the password in Admin.');
                killAdapter();
            }

            if(!adapter.config.email || !adapter.config.password){
                adapter.log.info("Credential error: Please configurate Adapter first!");
                killAdapter();
            }

            if(!(adapter.config.devices && adapter.config.devices.length)){
                adapter.log.info("Devicelist error: Please define device(s) first!");
                killAdapter();
            }

            // create basic auth string
            let auth = 'Basic ' + Buffer.from(adapter.config.email + ':' + adapter.config.password).toString('base64');

            // https://backend.powerfox.energy/api/2.0/my/{device}/current
            let dataUrl = "https://backend.powerfox.energy/api/2.0/my/{device}/current";

            for (let i = 0; i < adapter.config.devices.length; i++) {
                let device = adapter.config.devices[i];

                if(device.active){
                    let curDataUrl = dataUrl.replace(/{device}/, device.name);
                    let path = 'devices.'+createVarName(device.name);

                    adapter.log.debug(device.name);
                    adapter.log.debug(device.active);
                    adapter.log.debug(device.aws);

                    adapter.log.debug(curDataUrl);

                    request({
                        method: 'GET',
                        url: curDataUrl,
                        headers : {
                            "Authorization" : auth
                        }
                    }, (error, response, body) => {
                        if (!error && response.statusCode === 200) {
                            let data = JSON.parse(body);
                            if(typeof data == 'object'){
                                if(data.hasOwnProperty("message")){
                                    adapter.log.error('Error: ' + data.message);
                                } else {
                                    var type = "POWER";
                                    //DEFINE TYPE
                                    if(data.hasOwnProperty("WattHour")){
                                        type = "HEAT";
                                    } else if(data.hasOwnProperty("CubicMeterCold") || data.hasOwnProperty("CubicMeterWarm")){
                                        type = "WATER";
                                    }

                                    /*
                                        {
                                            "Watt": 891.0,
                                            "Timestamp": 1598473947,
                                            "A_Plus": 19910672.0,
                                            "A_Minus": 40175502.0
                                        }
                                    */
                                    if(type == "POWER"){
                                        if(data.hasOwnProperty("Watt")){
                                            var consumption = 0, feedIn = 0;
                                            if(data["Watt"] < 0){
                                                feedIn = (data["Watt"] * -1);
                                            } else {
                                                consumption = data["Watt"];
                                            }

                                            adapter.setObjectNotExists(path + '.currentPower', {
                                                type: 'state',
                                                common: {
                                                    name: 'current power (W)',
                                                    type: 'number',
                                                    role: 'value',
                                                    unit: "W",
                                                    read: false,
                                                    write: false,
                                                },
                                                native: {},
                                            });
                                            adapter.setState(path+'.currentPower', data["Watt"]);

                                            adapter.setObjectNotExists(path + '.currentPowerConsumption', {
                                                type: 'state',
                                                common: {
                                                    name: 'current power consumption (W)',
                                                    type: 'number',
                                                    role: 'value',
                                                    unit: "W",
                                                    read: false,
                                                    write: false,
                                                },
                                                native: {},
                                            });
                                            adapter.setState(path+'.currentPowerConsumption', consumption);

                                            adapter.setObjectNotExists(path + '.currentFeedIn', {
                                                type: 'state',
                                                common: {
                                                    name: 'current feed in (W)',
                                                    type: 'number',
                                                    role: 'value',
                                                    unit: "W",
                                                    read: false,
                                                    write: false,
                                                },
                                                native: {},
                                            });
                                            adapter.setState(path+'.currentFeedIn', feedIn);
                                        }

                                        if(data.hasOwnProperty("A_Plus")){
                                            adapter.setObjectNotExists(path + '.consumptionMeterReadingKWh', {
                                                type: 'state',
                                                common: {
                                                    name: 'consumption meter reading (KWh)',
                                                    type: 'number',
                                                    role: 'value',
                                                    unit: "KWh",
                                                    read: false,
                                                    write: false,
                                                },
                                                native: {},
                                            });
                                            adapter.setState(path+'.consumptionMeterReadingKWh', (data["A_Plus"]/1000));

                                            adapter.setObjectNotExists(path + '.consumptionMeterReadingWh', {
                                                type: 'state',
                                                common: {
                                                    name: 'consumption meter reading (Wh)',
                                                    type: 'number',
                                                    role: 'value',
                                                    unit: "Wh",
                                                    read: false,
                                                    write: false,
                                                },
                                                native: {},
                                            });
                                            adapter.setState(path+'.consumptionMeterReadingWh', (data["A_Plus"]));
                                        }

                                        if(data.hasOwnProperty("A_Minus")){
                                            adapter.setObjectNotExists(path + '.feedInMeterReadingKWh', {
                                                type: 'state',
                                                common: {
                                                    name: 'feed in meter reading (KWh)',
                                                    type: 'number',
                                                    role: 'value',
                                                    unit: "KWh",
                                                    read: false,
                                                    write: false,
                                                },
                                                native: {},
                                            });
                                            adapter.setState(path+'.feedInMeterReadingKWh', (data["A_Minus"]/1000));

                                            adapter.setObjectNotExists(path + '.feedInMeterReadingWh', {
                                                type: 'state',
                                                common: {
                                                    name: 'feed in meter reading (Wh)',
                                                    type: 'number',
                                                    role: 'value',
                                                    unit: "Wh",
                                                    read: false,
                                                    write: false,
                                                },
                                                native: {},
                                            });
                                            adapter.setState(path+'.feedInMeterReadingWh', (data["A_Minus"]));
                                        }
                                    } else if(type == "HEAT"){
                                        if(data.hasOwnProperty("WattHour")){
                                            adapter.setObjectNotExists(path + '.heatConsumptionReadingWh', {
                                                type: 'state',
                                                common: {
                                                    name: 'heat consumption (Wh)',
                                                    type: 'number',
                                                    role: 'value',
                                                    unit: "Wh",
                                                    read: false,
                                                    write: false,
                                                },
                                                native: {},
                                            });
                                            adapter.setState(path+'.heatConsumptionReadingWh', (data["WattHour"]));

                                            adapter.setObjectNotExists(path + '.heatConsumptionReadingKWh', {
                                                type: 'state',
                                                common: {
                                                    name: 'heat consumption (KWh)',
                                                    type: 'number',
                                                    role: 'value',
                                                    unit: "KWh",
                                                    read: false,
                                                    write: false,
                                                },
                                                native: {},
                                            });
                                            adapter.setState(path+'.heatConsumptionReadingKWh', (data["WattHour"]/1000));
                                        }
                                    } else if(type == "WATER"){
                                        if(data.hasOwnProperty("CubicMeterCold")){
                                            adapter.setObjectNotExists(path + '.coldWaterLevel', {
                                                type: 'state',
                                                common: {
                                                    name: 'cold water level in m³',
                                                    type: 'number',
                                                    role: 'value',
                                                    unit: "m³",
                                                    read: false,
                                                    write: false,
                                                },
                                                native: {},
                                            });
                                            adapter.setState(path+'.coldWaterLevel', (data["CubicMeterCold"]));
                                        }
                                        if(data.hasOwnProperty("CubicMeterWarm")){
                                            adapter.setObjectNotExists(path + '.warmWaterLevel', {
                                                type: 'state',
                                                common: {
                                                    name: 'warm water level in m³',
                                                    type: 'number',
                                                    role: 'value',
                                                    unit: "m³",
                                                    read: false,
                                                    write: false,
                                                },
                                                native: {},
                                            });
                                            adapter.setState(path+'.warmWaterLevel', (data["CubicMeterWarm"]));
                                        }
                                    }

                                    if(data.hasOwnProperty("Timestamp")){
                                        adapter.setObjectNotExists(path + '.timestamp', {
                                            type: 'state',
                                            common: {
                                                name: 'DateTime from data',
                                                type: 'string',
                                                role: 'date',
                                                read: false,
                                                write: false,
                                            },
                                            native: {},
                                        });
                                        let timestamp = new Date((parseInt(data["Timestamp"]) || 0) * 1000).toUTCString();
                                        adapter.setState(path+'.timestamp', timestamp);
                                    }

                                    adapter.setObjectNotExists(path + '.type', {
                                        type: 'state',
                                        common: {
                                            name: 'device type',
                                            type: 'string',
                                            role: 'text',
                                            read: false,
                                            write: false,
                                        },
                                        native: {},
                                    });
                                    adapter.setState(path+'.type', type);
                                }
                            } else {
                                adapter.log.error('NO JSON returned');
                            }
                        } else {
                            if(response.statusCode === 401){
                                adapter.log.error('wrong credentials');
                            } else {
                                if(error !== null){
                                    adapter.log.error('Error: ' + error);
                                } else {
                                    adapter.log.error('Error: ' + response.statusCode);
                                    let data = JSON.parse(body);
                                    if(typeof data == 'object'){
                                        adapter.log.error('Error: ' + JSON.stringify(data));
                                    } else {
                                        adapter.log.error('Error: ' + body);
                                    }
                                }
                            }
                        }
                    });
                }
            }
        });
        killAdapter();
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
        adapter && adapter.log && adapter.log.info('force terminating after 55 Seconds');
        adapter && adapter.stop && adapter.stop();
    }
}, 55000);

// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}