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

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const MODES = [
    {
        mode: "laziest",
        name: "Super Quiet",
        icon: 'network-cellular-signal-none-symbolic',
    },
    {
        mode: "lazy",
        name: "Quiet",
        icon: 'network-cellular-signal-weak-symbolic',
    },
    {
        mode: "medium",
        name: "Normal",
        icon: 'network-cellular-signal-ok-symbolic',
    },
    {
        mode: "agile",
        name: "Somewhat noisy",
        icon: 'network-cellular-signal-good-symbolic',
    },
    {
        mode: "very-agile",
        name: "Very Agile",
        icon: 'network-cellular-signal-excellent-symbolic',
    },
    {
        mode: "deaf",
        name: "Super Fan",
        icon: 'network-cellular-acquiring-symbolic',
    },
    {
        mode: "aeolus",
        name: "Take Off",
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
            })

            this.add_child(this.icon);
        }
});

function execCommand(argv, input = null, cancellable = null) {
    let flags = Gio.SubprocessFlags.STDOUT_PIPE;

    if (input !== null)
        flags |= Gio.SubprocessFlags.STDIN_PIPE;

    let proc = new Gio.Subprocess({
        argv: argv,
        flags: flags
    });
    proc.init(cancellable);

    return new Promise((resolve, reject) => {
        proc.communicate_utf8_async(input, cancellable, (proc, res) => {
            try {
                resolve(proc.communicate_utf8_finish(res)[1]);
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
    
        let that = this;

        let checkFanSpeed = async () => {
            try {
                let fanSpeed = await execCommand(['pkexec', 'ectool' ,'pwmgetfanrpm']);
                fanSpeed = fanSpeed.slice(0, -1);
                fanSpeed = fanSpeed.split(" ");
                return fanSpeed[3];
            } catch (e) {
                logError(e);
            }
        }

        let setFan = (modeString) => {
            try {
                const proc = Gio.Subprocess.new(['fw-fanctrl', modeString],Gio.SubprocessFlags.NONE);
            } catch (e) {
                logError(e);
            }
        }

        let iconChange = () => {
            if(!this.foundCommand) {
                logError('fw-fanctrl is not installed')
                Main.notify('Fan Speed not working', "You don't have fw-fanctrl installed!");
                this._indicator.icon.icon_name = 'software-update-urgent-symbolic'
                return false;
            }

            if(this.currentMode) {
                this._indicator.icon.icon_name = this.currentMode.icon
            }
        }

        let resetMenuItems = (menuItems) => {
            for (let i in menuItems) {
                menuItems[i].setOrnament(PopupMenu.Ornament.NONE);
            };
        }

        let updateFanSpeed = () => {
            this._indicator.menu.firstMenuItem.label.text = "Speed: " + this.fanSpeed + " rpm.";
        }

        let setMenu = () => {
            this._indicator.menu.removeAll();

            let fanSpeedItem = new PopupMenu.PopupImageMenuItem('loading...', 'weather-windy-symbolic', {});
            fanSpeedItem.active = false;
            this._indicator.menu.addMenuItem(fanSpeedItem);

            let menuSeparator = new PopupMenu.PopupSeparatorMenuItem('Fan Mode');
            this._indicator.menu.addMenuItem(menuSeparator);

            for (let mode in MODES) {
                let item = new PopupMenu.PopupMenuItem(_('' + MODES[mode].name));
                
                if(MODES[mode].mode === this.currentMode.mode) {
                    item.setOrnament(PopupMenu.Ornament.CHECK);
                } else {
                    item.setOrnament(PopupMenu.Ornament.NONE);
                }

                item.connect('activate', () => {
                    this._indicator.menu.close();
                    setFan(MODES[mode].mode)
                    getFan()
                    resetMenuItems(this._indicator.menu._getMenuItems());
                    item.setOrnament(PopupMenu.Ornament.CHECK);
                    Main.notify('Fan Speed Changed', 'Fans set to ' + MODES[mode].name + ' mode.');
                });

                this._indicator.menu.addMenuItem(item);
            };
        }

        let getFan = async () => {
            try {
                let fanResult = await execCommand(['fw-fanctrl', '-q']);
                fanResult = fanResult.slice(0, -1);
                for ( let i in MODES ) {
                    if(MODES[i].mode == fanResult) {
                        this.foundCommand = true;
                        this.currentMode = MODES[i];
                        setMenu();
                        iconChange();
                    }
                }
            } catch(e) {
                this.foundCommand = false;
                logError(e);
            }
        }

        getFan();

        // Update Fan Speed every 5 seconds
        this._sourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
            checkFanSpeed()
                .then((fanSpeed) => {
                    this.fanSpeed = fanSpeed;
                    updateFanSpeed();
                })
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        if (this._sourceId) {
            GLib.Source.remove(this._sourceId);
            this._sourceId = null;
        }

        this._indicator.destroy();
        this._indicator = null;
    }
}
