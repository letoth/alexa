'use strict';
const Alexa = require('alexa-sdk');
const http = require('http');
const https = require('https');

const APP_ID = undefined;

function diff(date1, date2) {
    const delta = date1 - date2;
    const seconds = delta / 1000;
    if (seconds >= 60) {
        const mins = seconds / 60;
        if (mins >= 60) {
            const hours = mins / 60;
            return Math.round(hours) + ' hours';
        }
        return Math.round(mins) + ' minutes';
    }

    return Math.round(seconds) + ' seconds';
}

const handlers = {
    'CreateGuestUserIntent': function () {
        if (this.event.request.dialogState == "STARTED" || this.event.request.dialogState == "IN_PROGRESS") {
            this.context.succeed({
                "response": {
                    "directives": [
                        {
                            "type": "Dialog.Delegate"
                        }
                    ],
                    "shouldEndSession": false
                },
                "sessionAttributes": {}
            });
        } else if (this.event.request.intent.confirmationStatus == "DENIED") {
            this.context.succeed({
                "response": {
                    "shouldEndSession": true
                },
                "sessionAttributes": {}
            });
        } else {
            var ctx = this;
            const userName = this.event.request.intent.slots.UserName.value;
            const payload = `<?xml version="1.0" encoding="utf-8" standalone="yes"?> <ns3:guestuser xmlns:ns2="ers.ise.cisco.com" xmlns:ns3="identity.ers.ise.cisco.com">
                <customFields/>
                <guestAccessInfo>
                   <fromDate>04/20/2018 08:00</fromDate> <location>Budapest</location>
                   <toDate>04/23/2018 23:00</toDate>
                   <validDays>4</validDays>
                </guestAccessInfo>
                <guestInfo>
                  <enabled>true</enabled>
                  <notificationLanguage>Hungarian</notificationLanguage>
                  <password></password>
                  <smsServiceProvider>Global Default</smsServiceProvider>
                  <userName>${userName}</userName>
                </guestInfo>
                <guestType>Daily (default)</guestType>
                <portalId>f39a7a40-95a4-11e4-9855-005056865a9c</portalId>
            </ns3:guestuser>`;

            const optionsPost = {
                host: 'ise12.budsuperlab.net',
                port: 9060,
                path: '/ers/config/guestuser',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/xml',
                    'Authorization': 'Basic ' + new Buffer('sebi:DevNet123').toString('base64')
                }
            };

            var reqPost = https.request(optionsPost, (res) => {
                console.log('statusCode:', res.statusCode);
                const postStatus = res.statusCode;
                //res.on('data', function(d) {
                    const optionsGet = {
                        host: 'ise12.budsuperlab.net',
                        port: 9060,
                        path: `/ers/config/guestuser/name/${userName}`,
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json',
                            'Authorization': 'Basic ' + new Buffer('sebi:DevNet123').toString('base64')
                        }
                    };
                    var reqGet = https.request(optionsGet, (res) => {
                        res.setEncoding('utf8');
                        console.log('statusCode:', res.statusCode);
                        res.on('data', function(d) {
                            const password = JSON.parse(d).GuestUser.guestInfo.password;
                            const tmp = password.split('');
                            const pwSep = tmp.join(', ');
                            var msg = "Unexpected error";
                            if (postStatus == '400') {
                                // TODO: simplifying here, we should handle other errors as well
                                msg = `${userName} already exists with password, ${pwSep}`;
                            } else {
                                msg = `${userName} has been created with password, ${pwSep}`;
                            }
                            ctx.response.speak(msg);
                            ctx.emit(':responseReady');
                        });
                    });
                    reqGet.end();
                //});
            });
            reqPost.write(payload);
            reqPost.end();
        }
    },
    'WhereIsUserIntent': function () {
        var ctx = this;
        const userName = this.event.request.intent.slots.UserName.value;
        const optionsGet = {
            host: '91.82.94.236',
            port: 80,
            path: `/api/location/v2/clients?username=${userName}`,
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': 'Basic bGV2aWtlOkFQSWdvMTIz'
            }
        };
        var reqGet = http.request(optionsGet, (res) => {
            res.setEncoding('utf8');
            console.log('statusCode:', res.statusCode);
            var body = "";
            res.on("data", data => {
                body += data;
            });
            res.on('end', function(d) {
                var msg = "Unexpected error";
                const json = JSON.parse(body);
                if (json.length > 0 && json[0].mapInfo) {
                    const mapHierarchy = json[0].mapInfo.mapHierarchyString;
                    const idx = mapHierarchy.lastIndexOf('>');
                    const room = mapHierarchy.substring(idx + 1);
                    const date1 = new Date();
                    const date2 = new Date(json[0].statistics.lastLocatedTime);
                    const diffStr = diff(date1, date2);

                    msg = `${userName} was last seen in, ${room}, ${diffStr} ago.`;
                } else {
                    msg = `${userName} cannot be found.`;
                }
                ctx.response.speak(msg);
                ctx.emit(':responseReady');
            });
        });
        reqGet.end();
    }
};

exports.handler = function (event, context, callback) {
    const alexa = Alexa.handler(event, context, callback);
    alexa.APP_ID = APP_ID;
    alexa.registerHandlers(handlers);
    alexa.execute();
};

