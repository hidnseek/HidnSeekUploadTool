/*
    USBasp uses:
    control transfers for communicating
    recipient is device
    request type is vendor

    Descriptors seems to be broken in current chrome.usb API implementation (writing this while using canary 37.0.2040.0
*/
'use strict';

var USBasp_protocol = function() {
    this.hex; // ref
    this.verify_hex;

    this.connected = null;
    this.handle = null; // connection handle

    this.fuse_count = 0;
    this.maximum_transmission_size = 0;
    this.chip_erased = false; // on chip erase mcu reboots, we need to keep track

    this.func = {
        CONNECT:            1,
        DISCONNECT:         2,
        TRANSMIT:           3,
        READFLASH:          4,
        ENABLEPROG:         5,
        WRITEFLASH:         6,
        READEEPROM:         7,
        WRITEEEPROM:        8,
        SETLONGADDRESS:     9,
        SETISPSCK:          10,
        TPI_CONNECT:        11,
        TPI_DISCONNECT:     12,
        TPI_RAWREAD:        13,
        TPI_RAWWRITE:       14,
        TPI_READBLOCK:      15,
        TPI_WRITEBLOCK:     16,
        GETCAPABILITIES:    127
    };
};

USBasp_protocol.prototype.connect = function(hex) {
    var self = this;
    self.hex = hex;

    // reset and set some variables before we start
    self.upload_time_start = microtime();
    self.verify_hex = [];

    self.connected = false;
    self.fuse_count = 0;
    self.maximum_transmission_size = 0;
    self.chip_erased = false;

    chrome.usb.getDevices(usbDevices.USBASP, function(result) {
        if (result.length) {
            console.log('USBasp detected with ID: ' + result[0].device);

            self.openDevice(result[0]);
        } else {
            // TODO: throw some error
        }
    });
};

USBasp_protocol.prototype.openDevice = function(device) {
    var self = this;

    chrome.usb.openDevice(device, function(handle) {
        self.handle = handle;

        console.log('Device opened with Handle ID: ' + handle.handle);
        self.claimInterface(0);
    });
};

USBasp_protocol.prototype.closeDevice = function() {
    var self = this;

    chrome.usb.closeDevice(this.handle, function closed() {
        console.log('Device closed with Handle ID: ' + self.handle.handle);

        self.handle = null;
    });
};

USBasp_protocol.prototype.claimInterface = function(interfaceNumber) {
    var self = this;

    chrome.usb.claimInterface(this.handle, interfaceNumber, function claimed() {
        console.log('Claimed interface: ' + interfaceNumber);

        self.upload_procedure(1);
    });
};

USBasp_protocol.prototype.releaseInterface = function(interfaceNumber) {
    var self = this;

    chrome.usb.releaseInterface(this.handle, interfaceNumber, function released() {
        console.log('Released interface: ' + interfaceNumber);

        self.closeDevice();
    });
};

USBasp_protocol.prototype.resetDevice = function(callback) {
    chrome.usb.resetDevice(this.handle, function(result) {
        console.log('Reset Device: ' + result);

        if (callback) callback();
    });
};

USBasp_protocol.prototype.controlTransfer = function(direction, request, value, _interface, length, data, callback) {
    if (direction == 'in') {
        // data is ignored
        chrome.usb.controlTransfer(this.handle, {
            'direction':    'in',
            'recipient':    'device',
            'requestType':  'vendor',
            'request':      request,
            'value':        value,
            'index':        _interface,
            'length':       length
        }, function(result) {
            if (result.resultCode) console.log(result.resultCode);

            var buf = new Uint8Array(result.data);
            callback(buf, result.resultCode);
        });
    } else {
        // length is ignored
        if (data) {
            var arrayBuf = new ArrayBuffer(data.length);
            var arrayBufView = new Uint8Array(arrayBuf);
            arrayBufView.set(data);
        } else {
            var arrayBuf = new ArrayBuffer(0);
        }

        chrome.usb.controlTransfer(this.handle, {
            'direction':    'out',
            'recipient':    'device',
            'requestType':  'vendor',
            'request':      request,
            'value':        value,
            'index':        _interface,
            'data':         arrayBuf
        }, function(result) {
            if (result.resultCode) console.log(result.resultCode);

            callback(result);
        });
    }
};

USBasp_protocol.prototype.loadAddress = function(address, callback) {
    var self = this;

    self.controlTransfer('in', self.func.SETLONGADDRESS, (address & 0xFFFF), (address >> 16), 0, 4, function(data) {
        callback(data);
    });
};

USBasp_protocol.prototype.verify_chip_signature = function(signature) {
    var self = this;
    var available_flash_size = 0;

    switch (signature) {
        case 0x1E9514: // testing only
            console.log('Chip recognized as 328');

            self.fuse_count = 3;
            self.maximum_transmission_size = 128;
            available_flash_size = 32768;
            break;
        case 0x1E950F: // testing only
            console.log('Chip recognized as 328P');

            self.fuse_count = 3;
            self.maximum_transmission_size = 128;
            available_flash_size = 32768;
            break;
        case 0x1E9307:
            console.log('Chip recognized as 8A');
            GUI.log('Chip recognized as <strong>ATmega8 / ATmega8A</strong>');

            self.fuse_count = 2;
            self.maximum_transmission_size = 64;
            available_flash_size = 8192;
            break;
    }

    if (available_flash_size > 0) {
        if (this.hex.bytes_total < available_flash_size) {
            return true;
        } else {
            console.log('HEX too big');
        }
    }

    console.log('Chip not supported, sorry :-(');
    GUI.log('Chip unsupported, sorry :-(');

    return false;
};

USBasp_protocol.prototype.verify_flash = function(first_array, second_array) {
    for (var i = 0; i < first_array.length; i++) {
        if (first_array[i] != second_array[i]) {
            console.log('Verification failed on byte: ' + i + ' expected: 0x' + first_array[i].toString(16) + ' received: 0x' + second_array[i].toString(16));
            return false;
        }
    }

    console.log('Verification successful, matching: ' + first_array.length + ' bytes');

    return true;
};

USBasp_protocol.prototype.upload_procedure = function(step) {
    var self = this;

    switch (step) {
        case 1:
            self.controlTransfer('in', self.func.CONNECT, 0, 0, 0, 0, function(data) {
                self.upload_procedure(2);
            });
            break;
        case 2:
            self.controlTransfer('in', self.func.ENABLEPROG, 0, 0, 1, 0, function(data) {
                if (data[0] == 0) {
                    self.connected = true;

                    if (!self.chip_erased) {
                        self.upload_procedure(3);
                    } else {
                        self.upload_procedure(8);
                    }
                } else if (data[0] == 1) {
                    console.log('Target not found');
                    GUI.log('Target not found');

                    self.upload_procedure(99);
                } else {
                    console.log('Enabling programming mode failed');
                    GUI.log('Enabling programming mode failed');

                    self.upload_procedure(99);
                }
            });
            break;
        case 3:
            // chip id
            var i = 0;
            var id = 0;

            var get_chip_id = function () {
                self.controlTransfer('in', self.func.TRANSMIT, 0x30, i++, 4, 0, function(data) {
                    id |= data[3] << 8 * (3 - i);

                    if (i < 3) {
                        get_chip_id();
                    } else {
                        // we should verify chip ID, if we support it, continue
                        console.log('Chip ID: ' + id);

                        if (self.verify_chip_signature(id)) {
                            self.upload_procedure(4);
                        } else {
                            self.upload_procedure(99);
                        }
                    }
                });
            }

            get_chip_id();
            break;
        case 4:
            // low fuse
            var low_fuse = null;

            var read_low_fuse = function () {
                self.controlTransfer('in', self.func.TRANSMIT, 0x0050, 0, 4, 0, function(data) {
                    if (data.length == 4) {
                        low_fuse = data[3];

                        console.log('Low fuse: ' + low_fuse);
                        self.upload_procedure(5);
                    } else {
                        self.upload_procedure(99);
                    }
                });
            }

            if (self.fuse_count >= 1) {
                read_low_fuse();
            } else {
                self.upload_procedure(5);
            }
            break;
        case 5:
            // high fuse
            var high_fuse = null;

            var read_high_fuse = function () {
                self.controlTransfer('in', self.func.TRANSMIT, 0x0858, 0, 4, 0, function(data) {
                    if (data.length == 4) {
                        high_fuse = data[3];

                        console.log('High fuse: ' + high_fuse);
                        self.upload_procedure(6);
/*
                        if (high_fuse != null && (high_fuse & 0x0F) != 0x0A) {
                            console.log('High fuse incompatible with bootloader, adjusting...');
                            GUI.log('High fuse incompatible with bootloader, adjusting...');

                            // WATCH OUT !!! modifying upper 4 bits can brick the chip
                            high_fuse = (high_fuse & 0xF0) | 0x0A;

                            self.controlTransfer('in', self.func.TRANSMIT, 0xA8AC, (high_fuse << 8), 4, 0, function(data) {
                                read_high_fuse();
                            });
                        } else {
                            self.upload_procedure(6);
                        }
*/
                    } else {
                        self.upload_procedure(99);
                    }
                });
            }

            if (self.fuse_count >= 2) {
                read_high_fuse();
            } else {
                self.upload_procedure(6);
            }
            break;
        case 6:
            // extended fuse
            var extended_fuse = null;

            var read_extended_fuse = function () {
                self.controlTransfer('in', self.func.TRANSMIT, 0x0850, 0, 4, 0, function(data) {
                    if (data.length == 4) {
                        extended_fuse = data[3];

                        console.log('Extended fuse: ' + extended_fuse);
                        self.upload_procedure(7);
                    } else {
                        self.upload_procedure(99);
                    }
                });
            }

            if (self.fuse_count >= 3) {
                read_extended_fuse();
            } else {
                self.upload_procedure(7);
            }
            break;
        case 7:
            // chip erase
            console.log('Executing global chip erase');
            GUI.log('Executing global chip erase');

            self.controlTransfer('in', self.func.TRANSMIT, 0x80AC, 0, 4, 0, function(data) {
                self.chip_erased = true;
                self.upload_procedure(1);
            });
            break;
        case 8:
            // write
            console.log('Writing data ...');
            GUI.log('Writing ...');

            var blocks = self.hex.data.length - 1;
            var flashing_block = 0;
            var address = self.hex.data[flashing_block].address;
            var bytes_flashed = 0;

            var write_to_flash = function () {
                if (bytes_flashed < self.hex.data[flashing_block].bytes) {
                    var bytes_to_write = ((bytes_flashed + self.maximum_transmission_size) <= self.hex.data[flashing_block].bytes) ? self.maximum_transmission_size : (self.hex.data[flashing_block].bytes - bytes_flashed);
                    var data_to_flash = self.hex.data[flashing_block].data.slice(bytes_flashed, bytes_flashed + bytes_to_write);

                    self.loadAddress(address, function() {
                        self.controlTransfer('out', self.func.WRITEFLASH, address, bytes_to_write | (0x03 << 8), 0, data_to_flash, function() { // index should be 0 for new usbasp, old usb asp needs the (bytes_to_write | (0x03 << 8))
                            console.log('USBASP - Writing to: ' + address + ', ' + bytes_to_write + ' bytes');

                            address += bytes_to_write;
                            bytes_flashed += bytes_to_write;

                            write_to_flash();
                        });
                    });
                } else {
                    if (flashing_block < blocks) {
                        // move to another block
                        flashing_block++;

                        address = self.hex.data[flashing_block].address;
                        bytes_flashed = 0;

                        write_to_flash();
                    } else {
                        // all blocks flashed
                        console.log('Writing: done');

                        // proceed to next step
                        self.upload_procedure(9);
                    }
                }
            }

            write_to_flash();
            break;
        case 9:
            // verify
            console.log('Verifying data ...');
            GUI.log('Verifying ...');

            var blocks = self.hex.data.length - 1;
            var reading_block = 0;
            var address = self.hex.data[reading_block].address;
            var bytes_verified = 0;

            // initialize arrays
            for (var i = 0; i <= blocks; i++) {
                self.verify_hex.push([]);
            }

            var read_from_flash = function () {
                if (bytes_verified < self.hex.data[reading_block].bytes) {
                    var bytes_to_read = ((bytes_verified + self.maximum_transmission_size) <= self.hex.data[reading_block].bytes) ? self.maximum_transmission_size : (self.hex.data[reading_block].bytes - bytes_verified);

                    self.loadAddress(address, function() {
                        self.controlTransfer('in', self.func.READFLASH, address, 0, bytes_to_read, 0, function(data) {
                            console.log('USBASP - Reading from: ' + address + ', ' + bytes_to_read + ' bytes');

                            for (var i = 0; i < data.length; i++) {
                                self.verify_hex[reading_block].push(data[i]);
                            }

                            address += bytes_to_read;
                            bytes_verified += bytes_to_read;

                            read_from_flash();
                        });
                    });
                } else {
                    if (reading_block < blocks) {
                        // move to another block
                        reading_block++;
                        address = self.hex.data[reading_block].address;
                        bytes_verified = 0;

                        read_from_flash();
                    } else {
                        // all blocks read, verify

                        var verify = true;
                        for (var i = 0; i <= blocks; i++) {
                            verify = self.verify_flash(self.hex.data[i].data, self.verify_hex[i]);

                            if (!verify) break;
                        }

                        if (verify) {
                            console.log('Programming: SUCCESSFUL');
                            GUI.log('Verifying <span style="color: green">done</span>');
                            GUI.log('Programming: <span style="color: green;">SUCCESSFUL</span>');
                        } else {
                            console.log('Programming: FAILED');
                            GUI.log('Verifying <span style="color: red">failed</span>');
                            GUI.log('Programming: <span style="color: red;">FAILED</span>');
                        }

                        self.upload_procedure(99);
                    }
                }
            }

            read_from_flash();
            break;
        default:
            // cleanup

            if (self.connected) {
                console.log('Disconnecting');

                self.controlTransfer('in', self.func.DISCONNECT, 0, 0, 0, 0, function(data) {
                    console.log('Script finished after: ' + (microtime() - self.upload_time_start).toFixed(4) + ' seconds');

                    self.releaseInterface(0);
                });
            } else {
                console.log('Script finished after: ' + (microtime() - self.upload_time_start).toFixed(4) + ' seconds');

                self.releaseInterface(0);
            }
    }
};

// initialize object
var USBASP = new USBasp_protocol();
