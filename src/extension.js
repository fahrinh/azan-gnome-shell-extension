
const St = imports.gi.St;
const Main = imports.ui.main;
const Soup = imports.gi.Soup;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const MessageTray = imports.ui.messageTray;
const Util = imports.misc.util;

const Extension = imports.misc.extensionUtils.getCurrentExtension();

const PrayTimes = Extension.imports.PrayTimes;
const HijriCalendarKuwaiti = Extension.imports.HijriCalendarKuwaiti;
const Convenience = Extension.imports.convenience;
const PrefsKeys = Extension.imports.prefs_keys;

// const PrayMenuItem = new Lang.Class({
//     Name: 'PrayMenuItem',
//     Extends: PopupMenu.PopupBaseMenuItem,

//     _init: function(label, value) {
//         this.parent();

//         this.actor.add(new St.Icon({
//             style_class: 'system-status-icon',
//             icon_name: 'sensors-fan-symbolic',
//             icon_size: 16
//         }));
//         this.actor.add(new St.Label({text: label}));
//         this.actor.add(value, {align: St.Align.END});
//     }});


const Azan = new Lang.Class({
    Name: 'Azan',
  Extends: PanelMenu.Button,

  _init: function () {
    this.parent(0.0, "Azan", false);
    this.indicatorText = new St.Label({
      text: _("Loading..."),
      y_align: Clutter.ActorAlign.CENTER
    });
    this.actor.add_actor(this.indicatorText);


    // this._item = new PopupMenu.PopupMenuItem('test');
    // this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    // this.menu.addMenuItem(this._item);

    this._opt_calculationMethod = null;
    this._opt_latitude = null;
    this._opt_longitude = null;
    this._opt_timezone = null;

      this._settings = Convenience.getSettings();
      this._bindSettings();

    this._dateFormatFull = _("%A %B %e, %Y");

    this._prayTimes = new PrayTimes.PrayTimes('ISNA');   


    this._dayNames = new Array("Ahad", "Ithnin", "Thulatha", "Arbaa", "Khams", "Jumuah", "Sabt");
    this._monthNames = new Array("Muharram", "Safar", "Rabi'ul Awwal", "Rabi'ul Akhir",
        "Jumadal Ula", "Jumadal Akhira", "Rajab", "Sha'ban",
        "Ramadan", "Shawwal", "Dhul Qa'ada", "Dhul Hijja");

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

    this._prayItems = {};

    this._dateMenuItem = new PopupMenu.PopupMenuItem(_("TODO"), {
        reactive: true, hover: false, activate: false
    });

    this.menu.addMenuItem(this._dateMenuItem);

    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());


    // this.menu.addMenuItem(this._dateMenuItem);
    // this.menu.addMenuItem(new PopupMenu.PopupMenuItem(_("Fajr"), {
    //     reactive: false
    // }));

    for (let prayerId in this._timeNames) {

        let prayerName = this._timeNames[prayerId];

        // ================================
        let prayMenuItem = new PopupMenu.PopupMenuItem(_(prayerName), {
            reactive: true, hover: false, activate: false
        });

        let bin = new St.Bin({
            x_align: St.Align.END,
            x_expand: true
        });

        let prayLabel = new St.Label();
        bin.add_actor(prayLabel);

        prayMenuItem.actor.add_actor(bin);
        
        //==============================
        // let prayLabel = new St.Label();
        // prayMenuItem.actor.add_actor(prayLabel, {align: St.Align.END});
        //==============================

        // let prayLabel = new St.Label();
        // let prayMenuItem = new PrayMenuItem(_(prayerName), prayLabel);
        //=============================

        this.menu.addMenuItem(prayMenuItem);

        this._prayItems[prayerId] = {
            menuItem: prayMenuItem,
            label: prayLabel
        };

    };

    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    this.menu.addAction(_("Settings"), Lang.bind(this, function() {

        // this._notify('Title Hello', 'body world');

            Util.spawn(["gnome-shell-extension-prefs", Extension.metadata.uuid]);
    }));

    this._updateLabelPeriodic();


      // this._notifSource = new MessageTray.SystemNotificationSource();
      // Main.messageTray.add(this._notifSource);

  },

    _bindSettings: function() {
        this._settings.connect('changed::' + PrefsKeys.CALCULATION_METHOD, Lang.bind(this, function(settings, key) {
            this._opt_calculationMethod = settings.get_string(key);
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
        this._settings.connect('changed::' + PrefsKeys.TIMEZONE, Lang.bind(this, function(settings, key) {
            this._opt_timezone = settings.get_string(key);
            this._updateLabel();
        }));
    },

    _notify: function(title, message) {
        let notification = new MessageTray.Notification(this._notifSource, title, message);
        notification.setTransient(false);
        this._notifSource.notify(notification);
    },

  _updateLabelPeriodic: function() {
      this._updateLabel();
      this._periodicTimeoutId = Mainloop.timeout_add_seconds(60, Lang.bind(this, this._updateLabelPeriodic));
  },

  _updateLabel: function() {
      let displayDate = GLib.DateTime.new_now_local();
      let dateFormattedFull = displayDate.format(this._dateFormatFull);

      // let myLocation = [-6.3365403, 106.8524694];
      // let myTimezone = 'auto';

      let myLocation = [this._opt_latitude, this._opt_longitude];
      let myTimezone = this._opt_timezone;
      this._prayTimes.setMethod(this._opt_calculationMethod);

      let currentDate = new Date();

      let currentSeconds = this._calculateSecondsFromDate(currentDate);

      let timesStr = this._prayTimes.getTimes(currentDate, myLocation, myTimezone, 'auto', '24h');
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

              if (diffSeconds > 0) {
                  let diffMinutes = ~~(diffSeconds / 60);

                  if (diffMinutes == 0) {
                      isTimeForPraying = true;
                      nearestPrayerId = prayerId;
                      break;
                  } else if (diffMinutes <= minDiffMinutes) {
                      minDiffMinutes = diffMinutes;
                      nearestPrayerId = prayerId;
                  }

                  // global.logError("prayerId: %s, diffSeconds: %s, diffMinutes: %s, minDiffMinutes: %s, isTimeForPraying: %s, nearestPrayerId: %s".format(
                  //     prayerId, diffSeconds, diffMinutes, minDiffMinutes, isTimeForPraying, nearestPrayerId
                  //     ));
              }

          }
      };


      let hijriDate = HijriCalendarKuwaiti.KuwaitiCalendar();

      let outputIslamicDate = this._formatHijriDate(hijriDate);

      this._dateMenuItem.label.text = outputIslamicDate;

      // this._dateLabel.text = outputIslamicDate;

      // global.logError(Moment.moment().format('iYYYY/iM/iD'));

      // global.logError('date : ' + currentSeconds + ' , dhuhr : ' + timesFloat.dhuhr + ' -> ' + this._calculateSecondsFromHour(timesFloat.dhuhr));


      // Main.notify(_("It's time for " + this._timeNames[nearestPrayerId]));

      if (isTimeForPraying) {
          Main.notify(_("It's time for " + this._timeNames[nearestPrayerId]));
          this.indicatorText.set_text(_("Now : " + this._timeNames[nearestPrayerId]));

      } else {
          this.indicatorText.set_text(this._timeNames[nearestPrayerId] + ' -' + this._formatRemainingTimeFromMinutes(minDiffMinutes));
      }

  },

  _calculateSecondsFromDate: function(date) {
      return this._calculateSecondsFromHour(date.getHours()) + (date.getMinutes() * 60) + date.getSeconds();
  },

  _calculateSecondsFromHour: function(hour) {
      return (hour * 60 * 60);
  },

  _isPrayerTime: function(prayerId) {
      return prayerId === 'fajr' || prayerId === 'dhuhr' || prayerId === 'asr' || prayerId === 'maghrib' || prayerId === 'isha';
  },

  _formatRemainingTimeFromMinutes: function(diffMinutes) {
      // let diffMinutes = diffSeconds / (60);

      let hours = ~~(diffMinutes / 60);
      let minutes = ~~(diffMinutes % 60);

      let hoursStr = (hours < 10 ? "0" : "") + hours;
      let minutesStr = (minutes < 10 ? "0" : "") + minutes;

      return hoursStr + ":" + minutesStr;
  },

  _formatHijriDate: function(hijriDate) {
      return this._dayNames[hijriDate[4]] + ", " + hijriDate[5] + " " + this._monthNames[hijriDate[6]] + " " + hijriDate[7];
  },

  stop: function () {

    this.menu.removeAll();

    if (this._periodicTimeoutId) {
        Mainloop.source_remove(this._periodicTimeoutId);
    }
  }
});

let azan;

function init() {
}

function enable() {
  azan = new Azan;
  Main.panel.addToStatusArea('azan', azan);
}

function disable() {
  azan.stop();
  azan.destroy();
}
