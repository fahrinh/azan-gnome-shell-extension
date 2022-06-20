const Geoclue = imports.gi.Geoclue;
const St = imports.gi.St;
const Main = imports.ui.main;
const Soup = imports.gi.Soup;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const GObject = imports.gi.GObject;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Clutter = imports.gi.Clutter;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const MessageTray = imports.ui.messageTray;
const Util = imports.misc.util;
const PermissionStore = imports.misc.permissionStore;

const Extension = imports.misc.extensionUtils.getCurrentExtension();

const PrayTimes = Extension.imports.PrayTimes;
const HijriCalendarKuwaiti = Extension.imports.HijriCalendarKuwaiti;
const Convenience = Extension.imports.convenience;
const PrefsKeys = Extension.imports.prefs_keys;

const Azan = GObject.registerClass(
class Azan extends PanelMenu.Button {

  _init() {
    super._init(0.0, _('Azan'));

    let box = new St.BoxLayout({ vertical: false, style_class: 'panel-status-menu-box' });
    
    this.indicatorText = new St.Label({text: _("Loading..."), y_align: Clutter.ActorAlign.CENTER});
	 box.add_child(this.indicatorText);

	this.add_child(box);
		
    this._gclueLocationChangedId = 0;
    this._weatherAuthorized = false;

    this._opt_calculationMethod = null;
    this._opt_latitude = null;
    this._opt_longitude = null;
    this._opt_timezone = null;
    this._opt_timeformat12 = false;
    this._opt_concise_list = null;

    this._settings = Convenience.getSettings();
    this._bindSettings();
    this._loadSettings();

    this._dateFormatFull = _("%A %B %e, %Y");

    this._prayTimes = new PrayTimes.PrayTimes('MWL');


    this._dayNames = new Array("Ahad", "Ithnin", "Thulatha", "Arbiaa", "Khamees", "Jomuah", "Issabt");
    this._monthNames = new Array("Muharram", "Safar", "Rabi'ul Awwal", "Rabi'ul Akhir",
                                 "Jumadal Ula", "Jumadal Akhira", "Rajab", "Sha'ban",
                                 "Ramadhan", "Shawwal", "Dhul Qa'ada", "Dhul Hijja");

    this._timeNames = {
        imsak: 'Imsak',
        fajr: 'Fajr',
        sunrise: 'Sunrise',
        dhuhr: 'Dhuhr',
        asr: 'Asr',
        sunset: 'Sunset',
        maghrib: 'Maghrib',
        isha: 'Isha',
        midnight: 'Midnight'
    };

    this._timeConciseLevels = {
      imsak: 0,
      fajr: 1,
      sunrise: 0,
      dhuhr: 1,
      asr: 1,
      sunset: 0,
      maghrib: 1,
      isha: 1,
      midnight: 0
    };

    this._prayItems = {};

    this._dateMenuItem = new PopupMenu.PopupMenuItem(_("TODO"), {
        style_class: 'azan-panel', reactive: true, hover: false, activate: false
    });

    this.menu.addMenuItem(this._dateMenuItem);

    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    for (let prayerId in this._timeNames) {

        let prayerName = this._timeNames[prayerId];

        let prayMenuItem = new PopupMenu.PopupMenuItem(_(prayerName), {
            reactive: true, hover: false, activate: false
        });

        let bin = new St.Bin({x_expand: true,x_align: Clutter.ActorAlign.END});

        let prayLabel = new St.Label();
        bin.add_actor(prayLabel);

        prayMenuItem.actor.add_actor(bin);

        this.menu.addMenuItem(prayMenuItem);

        this._prayItems[prayerId] = { menuItem: prayMenuItem, label: prayLabel };
    };

    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    this.menu.addAction(_("Settings"), Lang.bind(this, function() {
        Util.spawn(["gnome-extensions", "prefs", Extension.metadata.uuid]);
    }));

    this._updateLabelPeriodic();
    this._updatePrayerVisibility();

    this._permStore = new PermissionStore.PermissionStore((proxy, error) => {
        if (error) {
            log('Failed to connect to permissionStore: ' + error.message);
            return;
        }

        this._permStore.LookupRemote('gnome', 'geolocation', (res, error) => {
            if (error)
                log('Error looking up permission: ' + error.message);

            let [perms, data] = error ? [{}, null] : res;
            let  params = ['gnome', 'geolocation', false, data, perms];
            this._onPermStoreChanged(this._permStore, '', params);
        });
    });
  }
    
  _startGClueService() {
    if (this._gclueStarting)
        return;

    this._gclueStarting = true;

    Geoclue.Simple.new('org.gnome.Shell', Geoclue.AccuracyLevel.EXACT, null,
        (o, res) => {
            try {
                this._gclueService = Geoclue.Simple.new_finish(res);
            } catch(e) {
                log('Failed to connect to Geoclue2 service: ' + e.message);
                return;
            }
            this._gclueStarted = true;
            this._gclueService.get_client().distance_threshold = 100;
            this._updateLocationMonitoring();
        });
  }
  
  _onPermStoreChanged(proxy, sender, params) {
    let [table, id, deleted, data, perms] = params;

    if (table != 'gnome' || id != 'geolocation')
        return;

    let permission = perms['org.gnome.Weather.Application'] || ['NONE'];
    let [accuracy] = permission;
    this._weatherAuthorized = accuracy != 'NONE';

    this._updateAutoLocation();
  }
  
  _onGClueLocationChanged() {
      let geoLocation = this._gclueService.location;
      this._opt_latitude = geoLocation.latitude;
      this._opt_longitude = geoLocation.longitude;
      this._settings.set_double(PrefsKeys.LATITUDE, this._opt_latitude);
      this._settings.set_double(PrefsKeys.LONGITUDE, this._opt_longitude);
  }
  
  _updateLocationMonitoring() {
    if (this._opt_autoLocation) {
        if (this._gclueLocationChangedId != 0 || this._gclueService == null)
            return;

        this._gclueLocationChangedId =
            this._gclueService.connect('notify::location',
                                       this._onGClueLocationChanged.bind(this));
        this._onGClueLocationChanged();
    } else {
        if (this._gclueLocationChangedId)
            this._gclueService.disconnect(this._gclueLocationChangedId);
        this._gclueLocationChangedId = 0;
    }
  }
  
  _updateAutoLocation() {
        this._updateLocationMonitoring();

        if (this._opt_autoLocation) {
          this._startGClueService();
        }
  }
  
  _loadSettings() {
    this._opt_calculationMethod = this._settings.get_string(PrefsKeys.CALCULATION_METHOD);
    this._opt_adjustment = this._settings.get_int(PrefsKeys.ADJUSTMENT);
    this._opt_autoLocation = this._settings.get_boolean(PrefsKeys.AUTO_LOCATION);
    this._updateAutoLocation();
    this._opt_latitude = this._settings.get_double(PrefsKeys.LATITUDE);
    this._opt_longitude = this._settings.get_double(PrefsKeys.LONGITUDE);
    this._opt_timeformat12 = this._settings.get_boolean(PrefsKeys.TIME_FORMAT_12);
    this._opt_timezone = this._settings.get_string(PrefsKeys.TIMEZONE);
    this._opt_concise_list = this._settings.get_string(PrefsKeys.CONCISE_LIST);
  }
  
  _bindSettings() {
    this._settings.connect('changed::' + PrefsKeys.AUTO_LOCATION, Lang.bind(this, function(settings, key) {
        this._opt_autoLocation = settings.get_boolean(key);
        this._updateAutoLocation();
        this._updateLabel();
    }));

    this._settings.connect('changed::' + PrefsKeys.CALCULATION_METHOD, Lang.bind(this, function(settings, key) {
        this._opt_calculationMethod = settings.get_string(key);

        this._updateLabel();
    }));
    
    this._settings.connect('changed::' + PrefsKeys.ADJUSTMENT, Lang.bind(this, function(settings, key) {
        this._opt_adjustment = settings.get_int(key);

        this._updateLabel();
    }));
    
    this._settings.connect('changed::' + PrefsKeys.LATITUDE, Lang.bind(this, function(settings, key) {
        this._opt_latitude = settings.get_double(key);

        this._updateLabel();
    }));
    this._settings.connect('changed::' + PrefsKeys.LONGITUDE, Lang.bind(this, function(settings, key) {
        this._opt_longitude = settings.get_double(key);

        this._updateLabel();
    }));
    this._settings.connect('changed::' + PrefsKeys.TIME_FORMAT_12, Lang.bind(this, function(settings, key) {
        this._opt_timeformat12 = settings.get_boolean(key);
        this._updateLabel();
    }));
    this._settings.connect('changed::' + PrefsKeys.TIMEZONE, Lang.bind(this, function(settings, key) {
        this._opt_timezone = settings.get_string(key);

        this._updateLabel();
    }));

    this._settings.connect('changed::' + PrefsKeys.CONCISE_LIST, Lang.bind(this, function(settings, key) {
      this._opt_concise_list = settings.get_string(key);
      this._updateLabel();
      this._updatePrayerVisibility();
    }));
  }

  _updatePrayerVisibility() {
    for (let prayerId in this._timeNames) {
      this._prayItems[prayerId].menuItem.actor.visible = this._isVisiblePrayer(prayerId);
    }
  }

  _isVisiblePrayer(prayerId) {
    return this._timeConciseLevels[prayerId] >= this._opt_concise_list;
  }

  _updateLabelPeriodic() {
      let currentSeconds = new Date().getSeconds();
      if (currentSeconds === 0) {
         this._periodicTimeoutId = Mainloop.timeout_add_seconds(60, Lang.bind(this, this._updateLabelPeriodic));
      } else {
         this._periodicTimeoutId = Mainloop.timeout_add_seconds(60 - currentSeconds, Lang.bind(this, this._updateLabelPeriodic));
      }
      
      this._updateLabel();
  }

  _updateLabel() {
      let displayDate = GLib.DateTime.new_now_local();
      let dateFormattedFull = displayDate.format(this._dateFormatFull);

      let myLocation = [this._opt_latitude, this._opt_longitude];
      let myTimezone = this._opt_timezone;
      this._prayTimes.setMethod(this._opt_calculationMethod);

      let currentDate = new Date();

      let currentSeconds = this._calculateSecondsFromDate(currentDate);

      let timesStr;

      if (this._opt_timeformat12) {
        timesStr = this._prayTimes.getTimes(currentDate, myLocation, myTimezone, 'auto', '12h');
      } else {
        timesStr = this._prayTimes.getTimes(currentDate, myLocation, myTimezone, 'auto', '24h');
      }

      let timesFloat = this._prayTimes.getTimes(currentDate, myLocation, myTimezone, 'auto', 'Float');

      let nearestPrayerId;
      let minDiffMinutes = Number.MAX_VALUE;
      let isTimeForPraying = false;
      for (let prayerId in this._timeNames) {

          let prayerName = this._timeNames[prayerId];
          let prayerTime = timesStr[prayerId];

          this._prayItems[prayerId].label.text = prayerTime;

          if (this._isPrayerTime(prayerId)) {

              let prayerSeconds = this._calculateSecondsFromHour(timesFloat[prayerId]);

              let ishaSeconds = this._calculateSecondsFromHour(timesFloat['isha']);
              let fajrSeconds = this._calculateSecondsFromHour(timesFloat['fajr']);

              if (prayerId === 'fajr' && currentSeconds > ishaSeconds) {
                  prayerSeconds = fajrSeconds + (24 * 60 *60);
              }

              let diffSeconds = prayerSeconds - currentSeconds;

              if (diffSeconds <= 0 && diffSeconds > -60) {
                isTimeForPraying = true;
                nearestPrayerId = prayerId;
                break;
              }

              if (diffSeconds > 0) {
                  let diffMinutes = ~~(diffSeconds / 60);

                  if (diffMinutes <= minDiffMinutes) {
                      minDiffMinutes = diffMinutes;
                      nearestPrayerId = prayerId;
                  }
              }

          }
      };

      let hijriDate = HijriCalendarKuwaiti.KuwaitiCalendar(this._opt_adjustment);
      
      let outputIslamicDate = this._formatHijriDate(hijriDate);
      
      this._dateMenuItem.label.text = outputIslamicDate;
      
      if ( (minDiffMinutes === 15) || (minDiffMinutes === 10) || (minDiffMinutes === 5) ) {
         Main.notify(_(minDiffMinutes + " minutes remaining until " + this._timeNames[nearestPrayerId]) + " prayer.", _("Prayer time : " + timesStr[nearestPrayerId]));
      }
          
      if (isTimeForPraying) {
          Main.notify(_("It's time for the " + this._timeNames[nearestPrayerId]) + " prayer.", _("Prayer time : " + timesStr[nearestPrayerId]));
          this.indicatorText.set_text(_("It's time for " + this._timeNames[nearestPrayerId]));
      } else {
          this.indicatorText.set_text(this._timeNames[nearestPrayerId] + ' -' + this._formatRemainingTimeFromMinutes(minDiffMinutes));
      }
  }

  _calculateSecondsFromDate(date) {
      return this._calculateSecondsFromHour(date.getHours()) + (date.getMinutes() * 60);
  }

  _calculateSecondsFromHour(hour) {
      return (hour * 60 * 60);
  }

  _isPrayerTime(prayerId) {
      return prayerId === 'fajr' || prayerId === 'dhuhr' || prayerId === 'asr' || prayerId === 'maghrib' || prayerId === 'isha';
  }

  _formatRemainingTimeFromMinutes(diffMinutes) {
      let hours = ~~(diffMinutes / 60);
      let minutes = ~~(diffMinutes % 60);

      let hoursStr = (hours < 10 ? "0" : "") + hours;
      let minutesStr = (minutes < 10 ? "0" : "") + minutes;

      return hoursStr + ":" + minutesStr;
	}

		_formatHijriDate(hijriDate) {
      return this._dayNames[hijriDate[4]] + ", " + hijriDate[5] + " " + this._monthNames[hijriDate[6]] + " " + hijriDate[7];
  	}
  
    stop() {

    	this.menu.removeAll();

			if (this._periodicTimeoutId) {
        Mainloop.source_remove(this._periodicTimeoutId);
  		}
		}
}
);

let azan;

function init() {
}

function enable() {
  azan = new Azan();
  Main.panel.addToStatusArea('azan', azan, 1, 'center');
}

function disable() {
	azan.stop();
  azan.destroy();
}
