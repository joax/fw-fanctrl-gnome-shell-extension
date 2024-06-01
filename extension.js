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
import Clutter from 'gi://Clutter';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

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
        icon: 'network-cellular-signal-acquiring-symbolic',
    },
    {
        mode: "aeolus",
        name: "Take Off",
        icon: 'mail-mark-junk-symbolic',
    },
];

let icon = new St.Icon({
    icon_name: 'network-cellular-connected-symbolic',
    style_class: 'system-status-icon',
})

let text = new St.Label({
    text : "loading...",
});

let currentMode = null;

let foundCommand = true;

const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.Button {
        _init() {
            super._init(0.0, _('fw-fanctrl'));
            
            this.add_child(icon);
            this.add_child(text);
            this.getFan()

            let menuSeparator = new PopupMenu.PopupSeparatorMenuItem('Fan Mode');
            this.menu.addMenuItem(menuSeparator);

            for (let mode in MODES) {
                let item = new PopupMenu.PopupMenuItem(_('Mode ' + MODES[mode].name));
                
                if(MODES[mode].mode === currentMode.mode) {
                    item.setOrnament(PopupMenu.Ornament.CHECK);
                } else {
                    item.setOrnament(PopupMenu.Ornament.NONE);
                }

                item.connect('activate', () => {
                    this.menu.close();
                    this.setFan(MODES[mode].mode)
                    this.getFan()
                    Main.notify('Fan Speed Changed', 'Fans set to ' + MODES[mode].name + ' mode.');
                });

                this.menu.addMenuItem(item);
            };
        }

        changeIconText() {
            if(!foundCommand) {
                logError('fw-fanctrl is not installed')
                Main.notify('Fan Speed not working', "You don't have fw-fanctrl installed!");
                icon.icon_name = 'software-update-urgent-symbolic'
                return false;
            }

            if(currentMode) {
                icon.icon_name = currentMode.icon
                text.text = currentMode.name
            }
        }

        setFan(modeString) {
            try {
                const proc = Gio.Subprocess.new(['fw-fanctrl', modeString],Gio.SubprocessFlags.NONE);
            } catch (e) {
                logError(e);
            }
        }

        getFan() {
            try {
                let fanResult = GLib.spawn_command_line_sync("fw-fanctrl -q")[1].toString();
                fanResult = fanResult.slice(0, -1);
                for ( let i in MODES ) {
                    if(MODES[i].mode == fanResult) {
                        currentMode = MODES[i];
                        this.changeIconText();
                    }
                }
            } catch (e) {
                foundCommand = false;
                logError(e)
            }
        }
});

export default class IndicatorExampleExtension extends Extension {
    enable() {
        this._indicator = new Indicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
    }
}
