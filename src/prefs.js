const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio;
const Params = imports.misc.params;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const PrayTimes = Me.imports.PrayTimes;
const Convenience = Me.imports.convenience;
const PrefsKeys = Me.imports.prefs_keys;
const Config = imports.misc.config;

const IS_3_XX_SHELL_VERSION = Config.PACKAGE_VERSION.startsWith("3");

const PagePrefsGrid = new GObject.Class({
    Name: 'Page.Prefs.Grid',
    GTypeName: 'PagePrefsGrid',
    Extends: Gtk.Grid,

    _init: function(params) {
        this.parent(params);
        this._settings = Convenience.getSettings();
        this.margin = this.row_spacing = this.column_spacing = 10;
        this._rownum = 0;
    },

    add_entry: function(text, key) {
        let item = new Gtk.Entry({
            hexpand: false
        });
        item.text = this._settings.get_string(key);
        this._settings.bind(key, item, 'text', Gio.SettingsBindFlags.DEFAULT);

        return this.add_row(text, item);
    },

    add_shortcut: function(text, settings_key) {
        let item = new Gtk.Entry({
            hexpand: false
        });
        item.set_text(this._settings.get_strv(settings_key)[0]);
        item.connect('changed', (entry) => {
            let [key, mods] = Gtk.accelerator_parse(entry.get_text());

            if(Gtk.accelerator_valid(key, mods)) {
                let shortcut = Gtk.accelerator_name(key, mods);
                this._settings.set_strv(settings_key, [shortcut]);
            }
        });

        return this.add_row(text, item);
    },

    add_boolean: function(text, key, callback) {
        let item = new Gtk.Switch({
            active: this._settings.get_boolean(key)
        });

        if (callback) {
          callback(item, this._settings.get_boolean(key))
        }

        this._settings.bind(key, item, 'active', Gio.SettingsBindFlags.DEFAULT);
        return this.add_row(text, item);
    },

    add_combo: function(text, key, list, type) {
        let item = new Gtk.ComboBoxText();

        for(let i = 0; i < list.length; i++) {
            let title = list[i].title.trim();
            let id = list[i].value.toString();
            item.insert(-1, id, title);
        }

        if(type === 'string') {
            item.set_active_id(this._settings.get_string(key));
        }
        else {
            item.set_active_id(this._settings.get_int(key).toString());
        }

        item.connect('changed', (combo) => {
            let value = combo.get_active_id();

            if(type === 'string') {
                if(this._settings.get_string(key) !== value) {
                    this._settings.set_string(key, value);
                }
            }
            else {
                value = parseInt(value, 10);

                if(this._settings.get_int(key) !== value) {
                    this._settings.set_int(key, value);
                }
            }
        });

        return this.add_row(text, item);
    },

    add_spin: function(label, key, adjustment_properties, spin_properties) {
        adjustment_properties = Params.parse(adjustment_properties, {
            lower: 0,
            upper: 100,
            step_increment: 100
        });
        let adjustment = new Gtk.Adjustment(adjustment_properties);

        spin_properties = Params.parse(spin_properties, {
            adjustment: adjustment,
            numeric: true,
            digits: 4,
            snap_to_ticks: true
        }, true);
        let spin_button = new Gtk.SpinButton(spin_properties);

        spin_button.set_value(this._settings.get_double(key));
        spin_button.connect('value-changed', (spin) => {
            let value = spin.get_value();

            if(this._settings.get_double(key) !== value) {
                this._settings.set_double(key, value);
            }
        });

        this._settings.connect('change-event', (settings, key_set) => {
          spin_button.set_value(this._settings.get_double(key));
        });

        return this.add_row(label, spin_button, true);
    },

    add_row: function(text, widget, wrap) {
        let label;
        if (IS_3_XX_SHELL_VERSION){
            label = new Gtk.Label({
            label: text,
            hexpand: true,
            halign: Gtk.Align.START
        	});
        	label.set_line_wrap(wrap || false);
        
        } else {
        	label= new Gtk.Label({
            label: text,
            hexpand: true,
            halign: Gtk.Align.START
        	});
        }

        if (widget) {
          this.attach(label, 0, this._rownum, 1, 1); // col, row, colspan, rowspan
          this.attach(widget, 1, this._rownum, 1, 1);
        } else {
          this.attach(label, 0, this._rownum, 2, 1); // col, row, colspan, rowspan
        }
        this._rownum++;
        if (widget) {
          return widget;
        }
    },

    add_item: function(widget, col, colspan, rowspan) {
        this.attach(
            widget,
            col || 0,
            this._rownum,
            colspan || 2,
            rowspan || 1
        );
        this._rownum++;

        return widget;
    },

    add_range: function(label, key, range_properties) {
        range_properties = Params.parse(range_properties, {
            min: 0,
            max: 100,
            step: 10,
            mark_position: 0,
            add_mark: false,
            size: 200,
            draw_value: true
        });

        let range = Gtk.Scale.new_with_range(
            Gtk.Orientation.HORIZONTAL,
            range_properties.min,
            range_properties.max,
            range_properties.step
        );
        range.set_value(this._settings.get_int(key));
        range.set_draw_value(range_properties.draw_value);

        if(range_properties.add_mark) {
            range.add_mark(
                range_properties.mark_position,
                Gtk.PositionType.BOTTOM,
                null
            );
        }

        range.set_size_request(range_properties.size, -1);

        range.connect('value-changed', (slider) => {
            this._settings.set_int(key, slider.get_value());
        });

        return this.add_row(label, range, true);
    }
});

const AzanPrefsWidget = new GObject.Class({
    Name: 'Azan.Prefs.Widget',
    GTypeName: 'AzanPrefsWidget',
    Extends: Gtk.Box,

    _init: function(params) {
        this.parent(params);
        this.set_orientation(Gtk.Orientation.VERTICAL);
        this._settings = Convenience.getSettings();

        let stack = new Gtk.Stack({
            transition_type: Gtk.StackTransitionType.SLIDE_LEFT_RIGHT,
            transition_duration: 500
        });

        let stack_switcher
        if (IS_3_XX_SHELL_VERSION){
            stack_switcher = new Gtk.StackSwitcher({
            margin_left: 5,
            margin_top: 5,
            margin_bottom: 5,
            margin_right: 5,
            stack: stack
        	});
        	this._init_stack(stack);
        	this.add(stack_switcher);
        	this.add(stack);
        } else {
        	stack_switcher = new Gtk.StackSwitcher({
        	margin_start: 5,
        	margin_end: 5,
        	margin_top: 5,
        	margin_bottom: 5,
            stack: stack
        	});
        	this._init_stack(stack);
        	this.append(stack_switcher);
        	this.append(stack);
        }
    },

    _get_tab_config: function() {

        let calculation_page;
        if (IS_3_XX_SHELL_VERSION) {
        	calculation_page = new PagePrefsGrid();
        } else {
        	calculation_page = new PagePrefsGrid();
        	calculation_page.set_margin_top(10);
        	calculation_page.set_margin_start(5);
        	calculation_page.set_margin_end(5);
		}
        calculation_page.add_row('Please note that all prayer calculations by their nature can only be a guideline and are not definitive.', false, true);
        
        calculation_page.add_combo('Calculation method',
          PrefsKeys.CALCULATION_METHOD,
          Object
            .entries(PrayTimes.getMethods())
            .map(([value,{name}]) => ({value, title: name})),
          'string'
        );

        calculation_page.add_combo('Madhab', PrefsKeys.MADHAB, [
            {'title': 'Standard (Shafii, Maliki, Hanbali, Dhahiri)', 'value': 'Standard'},
            {'title': 'Hanafi', 'value': 'Hanafi'}
          ], 'string');

        let location_page;
        if (IS_3_XX_SHELL_VERSION){
        	location_page = new PagePrefsGrid();
        } else {
        	location_page = new PagePrefsGrid();
        	location_page.set_margin_top(10);
        	location_page.set_margin_start(5);
        	location_page.set_margin_end(5);
		}

        this.latitude_box = location_page.add_spin('Latitude', PrefsKeys.LATITUDE, {
            lower: -90.0000,
            upper: 90.0000,
            step_increment: 0.0001
        });

        this.longitude_box = location_page.add_spin('Longitude', PrefsKeys.LONGITUDE, {
            lower: -180.0000,
            upper: 180.0000,
            step_increment: 0.0001
        });

        let updateLocationState = (entry,state) => {
          this.latitude_box.set_sensitive(!state);
          this.longitude_box.set_sensitive(!state);
        }

        this.auto_location = location_page.add_boolean('Automatic location', PrefsKeys.AUTO_LOCATION, updateLocationState);

        this.auto_location.connect('state-set', updateLocationState);

        location_page.add_combo('Timezone', PrefsKeys.TIMEZONE, [
            {'title': 'Auto', 'value': 'auto'},
            {'title': 'GMT -12:00', 'value': '-12'},
            {'title': 'GMT -11:00', 'value': '-11'},
            {'title': 'GMT -10:00', 'value': '-10'},
            {'title': 'GMT -09:30', 'value': '-9.5'},
            {'title': 'GMT -09:00', 'value': '-9'},
            {'title': 'GMT -08:00', 'value': '-8'},
            {'title': 'GMT -07:00', 'value': '-7'},
            {'title': 'GMT -06:00', 'value': '-6'},
            {'title': 'GMT -05:00', 'value': '-5'},
            {'title': 'GMT -04:00', 'value': '-4'},
            {'title': 'GMT -03:30', 'value': '-3.5'},
            {'title': 'GMT -03:00', 'value': '-3'},
            {'title': 'GMT -02:00', 'value': '-2'},
            {'title': 'GMT -01:00', 'value': '-1'},
            {'title': 'GMT +00:00', 'value': '0'},
            {'title': 'GMT +01:00', 'value': '1'},
            {'title': 'GMT +02:00', 'value': '2'},
            {'title': 'GMT +03:00', 'value': '3'},
            {'title': 'GMT +03:30', 'value': '3.5'},
            {'title': 'GMT +04:00', 'value': '4'},
            {'title': 'GMT +04:30', 'value': '4'},
            {'title': 'GMT +05:00', 'value': '5'},
            {'title': 'GMT +05:30', 'value': '5.5'},
            {'title': 'GMT +05:45', 'value': '5.75'},
            {'title': 'GMT +06:00', 'value': '6'},
            {'title': 'GMT +06:30', 'value': '6.5'},
            {'title': 'GMT +07:00', 'value': '7'},
            {'title': 'GMT +08:00', 'value': '8'},
            {'title': 'GMT +08:45', 'value': '8.75'},
            {'title': 'GMT +09:00', 'value': '9'},
            {'title': 'GMT +09:30', 'value': '9.5'},
            {'title': 'GMT +10:00', 'value': '10'},
            {'title': 'GMT +10:30', 'value': '10.5'},
            {'title': 'GMT +11:00', 'value': '11'},
            {'title': 'GMT +12:00', 'value': '12'},
            {'title': 'GMT +13:00', 'value': '13'},
            {'title': 'GMT +14:00', 'value': '14'}
        ], 'string');

        let display_page;
        if (IS_3_XX_SHELL_VERSION){
        	display_page = new PagePrefsGrid();
        } else {
        	display_page = new PagePrefsGrid();
        	display_page.set_margin_top(10);
        	display_page.set_margin_start(5);
        	display_page.set_margin_end(5);
		}

        this.time_format_12 = display_page.add_boolean('AM/PM time format', PrefsKeys.TIME_FORMAT_12);

        display_page.add_combo('Which times?', PrefsKeys.CONCISE_LIST, [
          {'title': 'All times', 'value': '0'},
          {'title': 'Concise', 'value': '1'}
        ], 'string');

        calculation_page.add_range('Date adjustment', PrefsKeys.HIJRI_DATE_ADJUSTMENT, {
            min: -2,
            max: 2,
            step: 1,
            mark_position: 0,
            add_mark: true,
            size: 200,
            draw_value: true
        });

        let pages = [
          {
            name: 'Calculation',
            page: calculation_page
          },
          {
            name: 'Your Location',
            page: location_page
          },
          {
            name: 'Display',
            page: display_page
          }
        ];

        return pages;
    },

    _init_stack: function(stack) {
        let config = this._get_tab_config();
        for (let index in config) {
            stack.add_titled(config[index].page, config[index].name, config[index].name);
        }
    }
});

function init() {

}

function buildPrefsWidget() {
    let widget = new AzanPrefsWidget();
    if (IS_3_XX_SHELL_VERSION){
    	widget.show_all();
    } else {
    	widget.show();
    }

    return widget;
}
