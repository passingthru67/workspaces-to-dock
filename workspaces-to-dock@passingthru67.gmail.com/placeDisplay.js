/* ========================================================================================================
 * placeDisplay.js
 * --------------------------------------------------------------------------------------------------------
 *  CREDITS:  This code was copied from the places status indicator extension by gcampax,
 *  and modified as necessary to provide places functionality for the shortcuts panel.
 *  https://git.gnome.org/browse/gnome-shell-extensions
 * ========================================================================================================
 */

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Shell = imports.gi.Shell;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Signals = imports.signals;
const St = imports.gi.St;

const DND = imports.ui.dnd;
const Main = imports.ui.main;
const Params = imports.misc.params;
const Search = imports.ui.search;
const Util = imports.misc.util;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;
const N_ = function(x) { return x; }

const Hostname1Iface = '<node> \
<interface name="org.freedesktop.hostname1"> \
<property name="PrettyHostname" type="s" access="read" /> \
</interface> \
</node>';
const Hostname1 = Gio.DBusProxy.makeProxyWrapper(Hostname1Iface);

const PlaceInfo = new Lang.Class({
    Name: 'PlaceInfo',

    _init: function(kind, file, name, icon) {
        this.kind = kind;
        this.file = file;
        this.name = name || this._getFileName();
        this.icon = icon ? new Gio.ThemedIcon({ name: icon }) : this.getIcon();
    },

    destroy: function() {
    },

    isRemovable: function() {
        return false;
    },

    launch: function(timestamp, workspace) {
        let targetWorkspace = workspace ? workspace : -1;
        let launchContext = global.create_app_launch_context(timestamp, targetWorkspace);

        try {
            Gio.AppInfo.launch_default_for_uri(this.file.get_uri(),
                                               launchContext);
        } catch(e if e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_MOUNTED)) {
            this.file.mount_enclosing_volume(0, null, null, function(file, result) {
                file.mount_enclosing_volume_finish(result);
                Gio.AppInfo.launch_default_for_uri(file.get_uri(), launchContext);
            });
        } catch(e) {
            Main.notifyError(_("Failed to launch \"%s\"").format(this.name), e.message);
        }
    },

    getIcon: function() {
        try {
            let info = this.file.query_info('standard::symbolic-icon', 0, null);
	    return info.get_symbolic_icon();
        } catch(e if e instanceof Gio.IOErrorEnum) {
            // return a generic icon for this kind
            switch (this.kind) {
            case 'network':
                return new Gio.ThemedIcon({ name: 'folder-remote-symbolic' });
            case 'devices':
                return new Gio.ThemedIcon({ name: 'drive-harddisk-symbolic' });
            case 'special':
            case 'bookmarks':
            default:
                if (!this.file.is_native())
                    return new Gio.ThemedIcon({ name: 'folder-remote-symbolic' });
                else
                    return new Gio.ThemedIcon({ name: 'folder-symbolic' });
            }
        }
    },

    _getFileName: function() {
        try {
            let info = this.file.query_info('standard::display-name', 0, null);
            return info.get_display_name();
        } catch(e if e instanceof Gio.IOErrorEnum) {
            return this.file.get_basename();
        }
    },
});
Signals.addSignalMethods(PlaceInfo.prototype);

const DEFAULT_DIRECTORIES = [
    GLib.UserDirectory.DIRECTORY_DOCUMENTS,
    GLib.UserDirectory.DIRECTORY_PICTURES,
    GLib.UserDirectory.DIRECTORY_MUSIC,
    GLib.UserDirectory.DIRECTORY_DOWNLOAD,
    GLib.UserDirectory.DIRECTORY_VIDEOS,
];

const PlacesManager = new Lang.Class({
    Name: 'PlacesManager',

    _init: function() {
        this._places = {
            special: [],
            devices: [],
            bookmarks: [],
            network: [],
        };

        let homePath = GLib.get_home_dir();

        this._places.special.push(new PlaceInfo('special',
                                                Gio.File.new_for_path(homePath),
                                                _("Home")));

        let specials = [];
        for (let i = 0; i < DEFAULT_DIRECTORIES.length; i++) {
            let specialPath = GLib.get_user_special_dir(DEFAULT_DIRECTORIES[i]);
            if (!specialPath || specialPath == homePath) // passingthru67: BUG FIX - specialPath cannot be null
                continue;

            let file = Gio.File.new_for_path(specialPath), info;
            try {
                info = new PlaceInfo('special', file);
            } catch(e if e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
                continue;
            }

            specials.push(info);
        }

        specials.sort(function(a, b) {
            return GLib.utf8_collate(a.name, b.name);
        });
        this._places.special = this._places.special.concat(specials);
    },

    destroy: function() {
    },

    get: function (kind) {
        return this._places[kind];
    }
});
Signals.addSignalMethods(PlacesManager.prototype);
