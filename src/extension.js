/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const MODES = [
    {
        mode: 'laziest',
        name: 'Super Quiet',
        icon: 'network-cellular-signal-none-symbolic',
    },
    {
        mode: 'lazy',
        name: 'Quiet',
        icon: 'network-cellular-signal-weak-symbolic',
    },
    {
        mode: 'medium',
        name: 'Normal',
        icon: 'network-cellular-signal-ok-symbolic',
    },
    {
        mode: 'agile',
        name: 'Somewhat noisy',
        icon: 'network-cellular-signal-good-symbolic',
    },
    {
        mode: 'very-agile',
        name: 'Very Agile',
        icon: 'network-cellular-signal-excellent-symbolic',
    },
    {
        mode: 'deaf',
        name: 'Super Fan',
        icon: 'network-cellular-acquiring-symbolic',
    },
    {
        mode: 'aeolus',
        name: 'Take Off',
        icon: 'weather-windy-symbolic',
    },
];

const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.Button {
        _init() {
            super._init(0.0, _('fw-fanctrl'));

            this.icon = new St.Icon({
                icon_name: 'network-cellular-connected-symbolic',
                style_class: 'system-status-icon',
            });

            this.add_child(this.icon);
        }
    });

function execCommand(argv, input = null, cancellable = null) {
    let flags = Gio.SubprocessFlags.STDOUT_PIPE;

    if (input !== null)
        flags |= Gio.SubprocessFlags.STDIN_PIPE;

    const proc = new Gio.Subprocess({
        argv,
        flags,
    });
    proc.init(cancellable);

    return new Promise((resolve, reject) => {
        proc.communicate_utf8_async(input, cancellable, (procReceived, res) => {
            try {
                resolve(procReceived.communicate_utf8_finish(res)[1]);
            } catch (e) {
                reject(e);
            }
        });
    });
}

export default class FrameworkFanControllerExtension extends Extension {
    enable() {
        this.currentMode = null;
        this.foundCommand = true;
        this.fanSpeed = 0;

        this._indicator = new Indicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        // Refresh period
        this._settings = this.getSettings();
        this.refreshSeconds = this._settings.get_int('refresh-seconds');

        logError(`Refresh Seconds: ${this.refreshSeconds}`);

        const checkFanSpeed = async () => {
            try {
                let fanSpeed = await execCommand(['pkexec', 'ectool', 'pwmgetfanrpm']);
                fanSpeed = fanSpeed.slice(0, -1);
                fanSpeed = fanSpeed.split(' ');
                return fanSpeed[3];
            } catch (e) {
                logError(e);
            }
            return false;
        };

        const setFan = modeString => {
            try {
                Gio.Subprocess.new(['fw-fanctrl', modeString], Gio.SubprocessFlags.NONE);
            } catch (e) {
                logError(e);
            }
        };

        const iconChange = () => {
            if (!this.foundCommand) {
                logError('fw-fanctrl is not installed');
                sendNotification('Fan Speed not working', "You don't have fw-fanctrl installed!");
                this._indicator.icon.icon_name = 'software-update-urgent-symbolic';
                return false;
            }

            if (this.currentMode)
                this._indicator.icon.icon_name = this.currentMode.icon;

            return true;
        };

        const sendNotification = content => {
            const systemSource = MessageTray.getSystemSource();
            const notification = new MessageTray.Notification({
                source: systemSource,
                title: _('Framework Fan Control'),
                body: _(content),
                gicon: new Gio.ThemedIcon({name: 'emblem-generic'}),
                iconName: 'emblem-generic',
                urgency: MessageTray.Urgency.NORMAL,
            });
            systemSource.addNotification(notification);
        };

        const resetMenuItems = menuItems => {
            for (const key in menuItems) {
                if (Object.hasOwn(menuItems, key))
                    menuItems[key].setOrnament(PopupMenu.Ornament.NONE);
            }
        };

        const updateFanSpeed = () => {
            this._indicator.menu.firstMenuItem.label.text = `Speed: ${this.fanSpeed} rpm.`;
        };

        const setMenu = () => {
            this._indicator.menu.removeAll();

            const fanSpeedItem = new PopupMenu.PopupImageMenuItem('loading...', 'weather-windy-symbolic', {});
            fanSpeedItem.active = false;
            this._indicator.menu.addMenuItem(fanSpeedItem);

            const menuSeparator = new PopupMenu.PopupSeparatorMenuItem('Fan Mode');
            this._indicator.menu.addMenuItem(menuSeparator);

            for (const mode in MODES) {
                if (Object.hasOwn(MODES, mode)) {
                    const item = new PopupMenu.PopupMenuItem(_(`${MODES[mode].name}`));

                    if (MODES[mode].mode === this.currentMode.mode)
                        item.setOrnament(PopupMenu.Ornament.CHECK);
                    else
                        item.setOrnament(PopupMenu.Ornament.NONE);

                    item.connect('activate', () => {
                        this._indicator.menu.close();
                        setFan(MODES[mode].mode);
                        getFan();
                        resetMenuItems(this._indicator.menu._getMenuItems());
                        item.setOrnament(PopupMenu.Ornament.CHECK);
                        sendNotification('Fan Speed Changed', `Fans set to ${MODES[mode].name} mode.`);
                    });

                    this._indicator.menu.addMenuItem(item);
                }
            }

            // Open Settings
            const openSettings = new PopupMenu.PopupMenuItem('Settings');
            openSettings.connect('activate', () => {
                this.openPreferences();
            });

            this._indicator.menu.addMenuItem(openSettings);
        };

        const getFan = async () => {
            try {
                let fanResult = await execCommand(['fw-fanctrl', '-q']);
                fanResult = fanResult.slice(0, -1);
                for (const i in MODES) {
                    if (MODES[i].mode === fanResult) {
                        this.foundCommand = true;
                        this.currentMode = MODES[i];
                        setMenu();
                        iconChange();
                    }
                }
            } catch (e) {
                this.foundCommand = false;
                logError(e);
            }
        };

        // Check configuration and reset loop if change detected
        const configChange = () => {
            const newRefreshSeconds = this._settings.get_int('refresh-seconds');
            if (newRefreshSeconds !== this.refreshSeconds) {
                this.refreshSeconds = newRefreshSeconds;
                startLoop();
            }
        };

        // Run loop to get fan speed.
        const startLoop = () => {
            // Reset Loop.
            this.stopLoop();

            // Update Fan Speed based on configuration value
            this._sourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this.refreshSeconds, () => {
                checkFanSpeed()
                    .then(fanSpeed => {
                        this.fanSpeed = fanSpeed;
                        updateFanSpeed();
                    });

                // Reset Loop if config has changed.
                configChange();
                return GLib.SOURCE_CONTINUE;
            });
        };

        // Initialize.
        getFan();
        startLoop();
    }

    stopLoop() {
        // Reset Loop if there is one
        if (this._sourceId) {
            GLib.Source.remove(this._sourceId);
            this._sourceId = null;
        }
    }

    disable() {
        this.stopLoop();
	this.settings = null;
        this._indicator.destroy();
        this._indicator = null;
    }
}
