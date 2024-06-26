import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';


export default class FwFanCtrlPreferences extends ExtensionPreferences {
    getPreferencesWidget() {
        return new Gtk.Label({
            label: this.metadata.name,
        });
    }

    fillPreferencesWindow(window) {
        const settings = window._settings = this.getSettings();
        const refreshSeconds = settings.get_int('refresh-seconds');
        console.log(`Seconds: ${refreshSeconds}`);

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'dialog-information-symbolic',
        });

        const group = new Adw.PreferencesGroup({
            title: _('Time'),
            description: _('Configure the time elapsed between speed checks.'),
        });

        const adjustment = new Gtk.Adjustment({
            value: refreshSeconds,
            lower: 1,
            upper: 600,
            step_increment: 1,
        });

        const seconds = new Adw.SpinRow({
            title: _('Refresh Time'),
            subtitle: _('Period in seconds between refresh.'),
            adjustment,
        });

        adjustment.connect('value-changed', sw => {
            const newVal = sw.get_value();
            if (newVal === settings.get_int('refresh-seconds'))
                return;
            settings.set_int('refresh-seconds', newVal);
        });

        seconds.set_value(refreshSeconds);

        group.add(seconds);
        page.add(group);
        window.add(page);
    }
}
