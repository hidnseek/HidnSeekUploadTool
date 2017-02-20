'use strict';

function request_firmware(callback) {
    var host = 'https://www.hidnseek.fr/downloads/Firmware/',
        firmware = $('select#firmware').val(),
        release = $('select#release').val();

    var params = {};
    for (var i = 0; i < PROPERTIES.length; i++) {
        params[PROPERTIES[i][0]] = PROPERTIES[i][1];
    }

    var url;
    url = host + firmware + '.txt';

    if (url != IHEX.last_requested_url) {
        GUI.log('<strong>Requesting</strong> firmware');
        console.log('Requesting - ' + url);

        $.get(url, function(data) {
            if (data.indexOf('ERROR') == -1) {
                GUI.log('Firmware <span style="color: green">received</span>');

                IHEX.last_requested_url = url;
                IHEX.raw = data;

                // parsing hex in different thread
                var worker = new Worker('./js/workers/hex_parser.js');

                // "callback"
                worker.onmessage = function (event) {
                    IHEX.parsed = event.data;

                    if (callback) callback(IHEX.raw, IHEX.parsed);
                };

                // send data/string over for processing
                worker.postMessage(data);
            } else {
                GUI.log('Compile Server - <span style="color: red">Error</span>: ' + data.slice(6));
            }
        }).fail(function() {
            GUI.log('<span style="color: red">Failed</span> to contact compile server');
        });
    } else {
        GUI.log('Using <span style="color: green">cached</span> copy of the firmware');
        console.log('Using cached copy of the firmware as parameters are the same');

        if (callback) callback(IHEX.raw, IHEX.parsed);
    }
}

/*
function request_releases(callback) {
    $.get('http://www.openlrsng.org/cgi-bin/tgy/taglist.cgi', function(data) {
        var releases = data.split('\n');
        releases.pop(); // remove last (empty) member
        releases.reverse();

        callback(releases);
    }).fail(function() {
        GUI.log('<span style="color: red">Failed</span> to request releases from compile server');
    });
}
*/