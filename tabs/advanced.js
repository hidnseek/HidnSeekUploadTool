function tab_initialize_advanced() {
    function generate_ui(items) {
        var target_element = $('.tab-advanced');

        function checked(val) {
            if (val) return 'checked';
        }

        for (var i = 0; i < items.length; i++) {
            for (var j = 0; j < FIRMWARE_OPTIONS.length; j++) {
                if (items[i] == FIRMWARE_OPTIONS[j].name) {
                    switch (FIRMWARE_OPTIONS[j].element) {
                        case 'checkbox':
                            var div = '<div class="checkbox">\
                                <label>\
                                <div><input type="checkbox" name="' + FIRMWARE_OPTIONS[j].name + '" id="' + FIRMWARE_OPTIONS[j].name + '" ' + checked(FIRMWARE_OPTIONS[j].default) + ' /></div>\
                                <div>[' + FIRMWARE_OPTIONS[j].name + ']</div>\
                                <div>' + FIRMWARE_OPTIONS[j].description + '</div>\
                                </label>\
                                </div>';

                            target_element.append(div);
                            break;
                        case 'number':
                            var div = '<div class="number">\
                                <label>\
                                <div>\
                                    <input type="number"\
                                       name="' + FIRMWARE_OPTIONS[j].name + '" \
                                       id="' + FIRMWARE_OPTIONS[j].name + '" \
                                       value="' + FIRMWARE_OPTIONS[j].default + '" \
                                       min="' + FIRMWARE_OPTIONS[j].min + '" \
                                       max="' + FIRMWARE_OPTIONS[j].max + '" \/>\
                                </div>\
                                <div>[' + FIRMWARE_OPTIONS[j].name + ']</div>\
                                <div>' + FIRMWARE_OPTIONS[j].description + '</div>\
                                </label>\
                                </div>';

                            target_element.append(div);
                            break;
                    }

                    break;
                }
            }
        }

        for (var i = 0; i < PROPERTIES.length; i++) {
            if (PROPERTIES[i][2] == 'checkbox') {
                $('.tab-advanced input[name="' + PROPERTIES[i][0] + '"]').prop('checked', PROPERTIES[i][1]);
            } else if (PROPERTIES[i][2] == 'number') {
                $('.tab-advanced input[name="' + PROPERTIES[i][0] + '"]').val(PROPERTIES[i][1]);
            }
        }
    }

    $('#content').load("./tabs/advanced.html", function() {
        if (GUI.active_tab != 'advanced') {
            GUI.active_tab = 'advanced';
            googleAnalytics.sendAppView('Advanced');
        }

        generate_ui([
            'MOTOR_REVERSE',
            'COMP_PWM',
            'RC_CALIBRATION',
            'BEACON', 'MOTOR_BRAKE',
            'RC_PULS_REVERSE',
            'SLOW_THROTTLE',
            'LOW_BRAKE',
            'CHECK_HARDWARE',
            'BLIP_CELL_COUNT',
            'DEBUG_ADC_DUMP',
            'MOTOR_DEBUG',
            'MOTOR_ADVANCE',
            'BRAKE_SPEED',
            'STOP_RC_PULS',
            'FULL_RC_PULS',
            'MAX_RC_PULS',
            'MIN_RC_PULS'
        ]);

        $('select#firmware').change(function() {
            var val = $(this).val();

            if (val != '0' && val != 'custom') {
                $('.tab-advanced input:disabled').each(function() {
                    $(this).prop('disabled', false);
                });
            } else {
                $('.tab-advanced input:enabled').each(function() {
                    $(this).prop('disabled', true);
                });
            }
        }).change();

        // bind events
        $('.tab-advanced input').change(function() {
            var element = $(this);
            var type = element.prop('type');
            var name = element.prop('name');

            if (type == 'checkbox') {
                var val = + element.is(':checked'); // + converts boolean to decimal
            } else {
                var val = element.val();
            }

            for (var i = 0; i < PROPERTIES.length; i++) {
                if (PROPERTIES[i][0] == name) {
                    PROPERTIES[i][1] = val;

                    return;
                }
            }

            PROPERTIES.push([name, val, type]);
        });
    });
}