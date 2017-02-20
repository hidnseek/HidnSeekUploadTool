'use strict';

var serial = {
    connectionId:      -1,
    bytes_received:     0,
    bytes_sent:         0,
    failed:             0,

    transmitting: false,
    output_buffer: [],

    connect: function (path, options, callback) {
        var self = this;

        chrome.serial.connect(path, options, function (connectionInfo) {
            if (connectionInfo) {
                self.connectionId = connectionInfo.connectionId;
                self.bytes_received = 0;
                self.bytes_sent = 0;
                self.failed = 0;

                self.onReceive.addListener(function log_bytes_received(info) {
                    self.bytes_received += info.data.byteLength;
                });

                self.onReceiveError.addListener(function watch_for_on_receive_errors(info) {
                    console.error(info);
                    googleAnalytics.sendException('Serial: ' + info.error, false);

                    switch (info.error) {
                        case 'system_error': // we might be able to recover from this one
                            if (!self.failed++) {
                                chrome.serial.setPaused(self.connectionId, false, function () {
                                    self.getInfo(function (info) {
                                        if (info) {
                                            if (!info.paused) {
                                                console.log('SERIAL: Connection recovered from last onReceiveError');
                                                googleAnalytics.sendException('Serial: onReceiveError - recovered', false);

                                                self.failed = 0;
                                            } else {
                                                console.log('SERIAL: Connection did not recover from last onReceiveError, disconnecting');
                                                GUI.log('Unrecoverable <span style="color: red">failure</span> of serial connection, disconnecting...');
                                                googleAnalytics.sendException('Serial: onReceiveError - unrecoverable', false);

                                                self.disconnect();
                                            }
                                        } else {
                                            if (chrome.runtime.lastError) {
                                                console.error(chrome.runtime.lastError.message);
                                            }
                                        }
                                    });
                                });
                            }
                            break;
                        case 'timeout':
                            // TODO
                            break;
                        case 'device_lost':
                            // TODO
                            break;
                        case 'disconnected':
                            // TODO
                            break;
                    }
                });

                console.log('SERIAL: Connection opened with ID: ' + connectionInfo.connectionId + ', Baud: ' + connectionInfo.bitrate);

                if (callback) callback(connectionInfo);
            } else {
                console.log('SERIAL: Failed to open serial port');
                googleAnalytics.sendException('Serial: FailedToOpen', false);

                if (callback) callback(false);
            }
        });
    },
    disconnect: function (callback) {
        var self = this;

        self.empty_output_buffer();

        // remove listeners
        for (var i = (self.onReceive.listeners.length - 1); i >= 0; i--) {
            self.onReceive.removeListener(self.onReceive.listeners[i]);
        }

        for (var i = (self.onReceiveError.listeners.length - 1); i >= 0; i--) {
            self.onReceiveError.removeListener(self.onReceiveError.listeners[i]);
        }

        chrome.serial.disconnect(this.connectionId, function(result) {
            if (result) {
                console.log('SERIAL: Connection with ID: ' + self.connectionId + ' closed');
            } else {
                console.log('SERIAL: Failed to close connection with ID: ' + self.connectionId + ' closed');
                googleAnalytics.sendException('Serial: FailedToClose', false);
            }

            console.log('SERIAL: Statistics - Sent: ' + self.bytes_sent + ' bytes, Received: ' + self.bytes_received + ' bytes');

            self.connectionId = -1;

            if (callback) callback(result);
        });
    },
    getDevices: function (callback) {
        chrome.serial.getDevices(function (devices_array) {
            var devices = [];
            devices_array.forEach(function (device) {
                devices.push(device.path);
            });

            callback(devices);
        });
    },
    getInfo: function (callback) {
        chrome.serial.getInfo(this.connectionId, callback);
    },
    getControlSignals: function (callback) {
        chrome.serial.getControlSignals(this.connectionId, callback);
    },
    setControlSignals: function (signals, callback) {
        chrome.serial.setControlSignals(this.connectionId, signals, callback);
    },
    send: function (data, callback) {
        var self = this;
        this.output_buffer.push({'data': data, 'callback': callback});

        function send () {
            // store inside separate variables in case array gets destroyed
            var data = self.output_buffer[0].data,
                callback = self.output_buffer[0].callback;

            if (self.connectionId) {
                chrome.serial.send(self.connectionId, data, function (sendInfo) {
                    // track sent bytes for statistics
                    self.bytes_sent += sendInfo.bytesSent;

                    // fire callback
                    if (callback) callback(sendInfo);

                    // remove data for current transmission form the buffer
                    self.output_buffer.shift();

                    // if there is any data in the queue fire send immediately, otherwise stop trasmitting
                    if (self.output_buffer.length) {
                        // keep the buffer withing reasonable limits
                        if (self.output_buffer.length > 100) {
                            var counter = 0;

                            while (self.output_buffer.length > 100) {
                                self.output_buffer.pop();
                                counter++;
                            }

                            console.log('SERIAL: Send buffer overflowing, dropped: ' + counter + ' entries');
                        }

                        send();
                    } else {
                        self.transmitting = false;
                    }
                });
            }
        };

        if (!self.transmitting) {
            self.transmitting = true;
            send();
        }
    },
    onReceive: {
        listeners: [],

        addListener: function (function_reference) {
            chrome.serial.onReceive.addListener(function_reference);
            this.listeners.push(function_reference);
        },
        removeListener: function (function_reference) {
            for (var i = (this.listeners.length - 1); i >= 0; i--) {
                if (this.listeners[i] == function_reference) {
                    chrome.serial.onReceive.removeListener(function_reference);

                    this.listeners.splice(i, 1);
                    break;
                }
            }
        }
    },
    onReceiveError: {
        listeners: [],

        addListener: function (function_reference) {
            chrome.serial.onReceiveError.addListener(function_reference);
            this.listeners.push(function_reference);
        },
        removeListener: function (function_reference) {
            for (var i = (this.listeners.length - 1); i >= 0; i--) {
                if (this.listeners[i] == function_reference) {
                    chrome.serial.onReceiveError.removeListener(function_reference);

                    this.listeners.splice(i, 1);
                    break;
                }
            }
        }
    },
    empty_output_buffer: function () {
        this.output_buffer = [];
        this.transmitting = false;
    }
};