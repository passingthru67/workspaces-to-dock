const _DEBUG_ = false;

const IconTheme = imports.gi.Gtk.IconTheme;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Shell = imports.gi.Shell;
const Meta = imports.gi.Meta;
const Mainloop = imports.mainloop;
const Lang = imports.lang;
const Signals = imports.signals;
const Params = imports.misc.params;
const Config = imports.misc.config;
const GnomeSession = imports.misc.gnomeSession;
const AppDisplay = imports.ui.appDisplay;
const AppFavorites = imports.ui.appFavorites;
const Layout = imports.ui.layout;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const DND = imports.ui.dnd;
const IconGrid = imports.ui.iconGrid;

const Util = imports.misc.util;
const ExtensionSystem = imports.ui.extensionSystem;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = imports.misc.extensionUtils.getCurrentExtension();

const PlaceDisplay = Me.imports.placeDisplay;
const Convenience = Me.imports.convenience;
const Separator = Me.imports.separator;

const MENU_POPUP_TIMEOUT = 600;

const ApplicationType = {
    APPLICATION: 0,
    PLACE: 1,
    RECENT: 2,
    APPSBUTTON: 3
};

const ShortcutsPanelOrientation = {
    OUTSIDE: 0,
    INSIDE: 1
};

// Filter out unnecessary windows, for instance nautilus desktop window.
function getInterestingWindows(app) {
    return app.get_windows().filter(function(w) {
        return !w.skip_taskbar;
    });
}

/* Return the actual position reverseing left and right in rtl */
function getPosition(settings) {
    let position = settings.get_enum('dock-position');
    if (Clutter.get_default_text_direction() == Clutter.TextDirection.RTL) {
        if (position == St.Side.LEFT)
            position = St.Side.RIGHT;
        else if (position == St.Side.RIGHT)
            position = St.Side.LEFT;
    }
    return position;
}

function getAppFromSource(source) {
    if (source instanceof AppDisplay.AppIcon) {
        return source.app;
    } else if (source instanceof ShortcutButton) {
        if (source._type == ApplicationType.APPLICATION)
            return source._app;
        else
            return null;
    } else {
        return null;
    }
}

const DragPlaceholderItem = new Lang.Class({
    Name: 'workspacestodock_shortcutsPanel_DragPlaceholderItem',

    _init: function(source) {
        this._settings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');
        this.actor = new St.Bin({ style_class: 'placeholder' });

        let iconSize = this._settings.get_double('shortcuts-panel-icon-size');
        this.actor.set_size(iconSize, iconSize);
    },

    destroy: function() {
        this.actor.destroy();
    }
});

const ShortcutButtonMenu = new Lang.Class({
    Name: 'workspacestodock_shortcutButtonMenu',
    Extends: PopupMenu.PopupMenu,

    _init: function(source) {
        this._settings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');
        let side = getPosition(this._settings);

        this.parent(source.actor, 0.5, side);

        // We want to keep the item hovered while the menu is up
        this.blockSourceEvents = true;

        this._source = source;

        this.actor.add_style_class_name('app-well-menu');

        // Chain our visibility and lifecycle to that of the source
        source.actor.connect('notify::mapped', Lang.bind(this, function () {
            if (!source.actor.mapped)
                this.close();
        }));
        source.actor.connect('destroy', Lang.bind(this, function () { this.actor.destroy(); }));

        Main.uiGroup.add_actor(this.actor);
    },

    _redisplay: function() {
        this.removeAll();

        // passingthru67: appsbutton menu to show extension preferences
        if (this._source._type == ApplicationType.APPSBUTTON) {
            let item = this._appendMenuItem(_("Extension Preferences"));
            item.connect('activate', Lang.bind(this, function () {
                // passingthru67: Should we use commandline or argv?
                // Util.trySpawnCommandLine("gnome-shell-extension-prefs " + Me.metadata.uuid);
                Util.spawn(["gnome-shell-extension-prefs", Me.metadata.uuid]);
            }));
            return;
        }

        let windows = this._source._app.get_windows().filter(function(w) {
            return !w.skip_taskbar;
        });

        // Display the app windows menu items and the separator between windows
        // of the current desktop and other windows.
        let activeWorkspace = global.screen.get_active_workspace();
        let separatorShown = windows.length > 0 && windows[0].get_workspace() != activeWorkspace;

        for (let i = 0; i < windows.length; i++) {
            let window = windows[i];
            if (!separatorShown && window.get_workspace() != activeWorkspace) {
                this._appendSeparator();
                separatorShown = true;
            }
            let item = this._appendMenuItem(window.title);
            item.connect('activate', Lang.bind(this, function() {
                this.emit('activate-window', window);
            }));
        }

        if (!this._source._app.is_window_backed()) {
            this._appendSeparator();

            let appInfo = this._source._app.get_app_info();
            let actions = appInfo.list_actions();
            if (this._source._app.can_open_new_window() &&
                actions.indexOf('new-window') == -1) {
                this._newWindowMenuItem = this._appendMenuItem(_("New Window"));
                this._newWindowMenuItem.connect('activate', Lang.bind(this, function() {
                    this._source._app.open_new_window(-1);
                    this.emit('activate-window', null);
                }));
                this._appendSeparator();
            }

            for (let i = 0; i < actions.length; i++) {
                let action = actions[i];
                let item = this._appendMenuItem(appInfo.get_action_name(action));
                item.connect('activate', Lang.bind(this, function(emitter, event) {
                    this._source._app.launch_action(action, event.get_time(), -1);
                    this.emit('activate-window', null);
                }));
            }

            let canFavorite = global.settings.is_writable('favorite-apps');

            if (canFavorite) {
                this._appendSeparator();

                let isFavorite = AppFavorites.getAppFavorites().isFavorite(this._source._app.get_id());

                if (isFavorite) {
                    let item = this._appendMenuItem(_("Remove from Favorites"));
                    item.connect('activate', Lang.bind(this, function() {
                        let favs = AppFavorites.getAppFavorites();
                        favs.removeFavorite(this._source._app.get_id());
                    }));
                } else {
                    let item = this._appendMenuItem(_("Add to Favorites"));
                    item.connect('activate', Lang.bind(this, function() {
                        let favs = AppFavorites.getAppFavorites();
                        favs.addFavorite(this._source._app.get_id());
                    }));
                }
            }

            if (Shell.AppSystem.get_default().lookup_app('org.gnome.Software.desktop')) {
                this._appendSeparator();
                let item = this._appendMenuItem(_("Show Details"));
                item.connect('activate', Lang.bind(this, function() {
                    let id = this._source._app.get_id();
                    let args = GLib.Variant.new('(ss)', [id, '']);
                    Gio.DBus.get(Gio.BusType.SESSION, null,
                        function(o, res) {
                            let bus = Gio.DBus.get_finish(res);
                            bus.call('org.gnome.Software',
                                     '/org/gnome/Software',
                                     'org.gtk.Actions', 'Activate',
                                     GLib.Variant.new('(sava{sv})',
                                                      ['details', [args], null]),
                                     null, 0, -1, null, null);
                            Main.overview.hide();
                        });
                }));
            }
        }
    },

    _appendSeparator: function () {
        let separator = new PopupMenu.PopupSeparatorMenuItem();
        this.addMenuItem(separator);
    },

    _appendMenuItem: function(labelText) {
        let item = new PopupMenu.PopupMenuItem(labelText);
        this.addMenuItem(item);
        return item;
    },

    popup: function(activatingButton) {
        this._redisplay();

        if (this._settings.get_boolean('shortcuts-panel-popupmenu-arrow-at-top')) {
            this._arrowAlignment = 0.0;
        } else {
            this._arrowAlignment = 0.5;
        }

        this.open();
    }
});
Signals.addSignalMethods(ShortcutButtonMenu.prototype);

let recentlyClickedAppLoopId = 0;
let recentlyClickedApp = null;
let recentlyClickedAppWindows = null;
let recentlyClickedAppIndex = 0;

const ShortcutButton = new Lang.Class({
    Name: 'workspacestodock.ShortcutButton',

    _init: function (app, appType, panel) {
        this._app = app;
        this._type = appType;
        this._panel = panel;
        this._stateChangedId = 0;
        this._countChangedId = 0;
        this._maxN = 4;
        this._settings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');
        this._gDesktopInterfaceSettings = Convenience.getSettings('org.gnome.desktop.interface');

        this.actor = new St.Button({ style_class: 'app-well-app workspacestodock-shortcut-button',
                                     reactive: true,
                                     button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO,
                                     can_focus: true,
                                     x_fill: true,
                                     y_fill: true,
                                     x_expand: false,
                                     y_expand: false });

        this.actor._delegate = this;

        this._iconSize = this._settings.get_double('shortcuts-panel-icon-size');
        let iconParams = {setSizeManually: true, showLabel: false};

        if (appType == ApplicationType.APPLICATION) {
            iconParams['createIcon'] = Lang.bind(this, function(iconSize){ return app.create_icon_texture(iconSize);});
        } else if (appType == ApplicationType.PLACE) {
            // Adjust 'places' symbolic icons by reducing their size
            // and setting a special class for button padding
            this._iconSize -= 4;
            this.actor.add_style_class_name('workspacestodock-shortcut-button-symbolic');
            iconParams['createIcon'] = Lang.bind(this, function(iconSize){ return new St.Icon({gicon: app.icon, icon_size: iconSize});});
        } else if (appType == ApplicationType.RECENT) {
            let gicon = Gio.content_type_get_icon(app.mime);
            iconParams['createIcon'] = Lang.bind(this, function(iconSize){ return new St.Icon({gicon: gicon, icon_size: iconSize});});
        } else if (appType == ApplicationType.APPSBUTTON) {
            iconParams['createIcon'] = Lang.bind(this, function(iconSize){ return new St.Icon({icon_name: 'view-grid-symbolic', icon_size: iconSize});});
        }

        this._dot = new St.Widget({ style_class: 'app-well-app-running-dot',
                                    layout_manager: new Clutter.BinLayout(),
                                    x_expand: true, y_expand: true,
                                    x_align: Clutter.ActorAlign.CENTER,
                                    y_align: Clutter.ActorAlign.END });

        // NOTE: _iconContainer y_expand:false prevents button from growing
        // vertically when _dot is shown and hid
        this._iconContainer = new St.Widget({ layout_manager: new Clutter.BinLayout(),
                                              x_expand: true, y_expand: true });

        this.actor.set_child(this._iconContainer);
        this._iconContainer.add_child(this._dot);

        this._icon = new IconGrid.BaseIcon(null, iconParams);
        this._icon.actor.add_style_class_name('workspacestodock-shortcut-button-icon');
        if (appType == ApplicationType.PLACE) {
            this._icon.actor.add_style_class_name('workspacestodock-shortcut-button-symbolic-icon');
        }
        this._icon.setIconSize(this._iconSize);

        this._iconContainer.add_child(this._icon.actor);

        this._menu = null;
        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._menuTimeoutId = 0;

        // Connect button signals
        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));
        this.actor.connect('enter-event', Lang.bind(this, this._onButtonEnter));
        this.actor.connect('leave-event', Lang.bind(this, this._onButtonLeave));
        this.actor.connect('button-press-event', Lang.bind(this, this._onButtonPress));
        this.actor.connect('clicked', Lang.bind(this, this._onClicked));

        if (appType == ApplicationType.APPSBUTTON) {
            this._stateChangedId = Main.overview.viewSelector._showAppsButton.connect('notify::checked', Lang.bind(this, this._onStateChanged));
        } else if (appType == ApplicationType.APPLICATION) {
            this._stateChangedId = this._app.connect('notify::state', Lang.bind(this, this._onStateChanged));
            this._countChangedId = this._app.connect('windows-changed', Lang.bind(this, this._onCountChanged));
        }

        // Connect drag-n-drop signals
        if (appType != ApplicationType.APPSBUTTON) {
            this._draggable = DND.makeDraggable(this.actor);
            this._draggable.connect('drag-begin', Lang.bind(this,
                function () {
                    this._removeMenuTimeout();
                    Main.overview.beginItemDrag(this);
                }));
            this._draggable.connect('drag-cancelled', Lang.bind(this,
                function () {
                    Main.overview.cancelledItemDrag(this);
                }));
            this._draggable.connect('drag-end', Lang.bind(this,
                function () {
                   Main.overview.endItemDrag(this);
                }));
        }

        // Check if running state
        this._dot.opacity = 0;
        this._onStateChanged();
    },

    _onDestroy: function() {
        if (this._stateChangedId > 0) {
            if (this._type == ApplicationType.APPSBUTTON) {
                Main.overview.viewSelector._showAppsButton.disconnect(this._stateChangedId);
            } else {
                this._app.disconnect(this._stateChangedId);
            }
        }
        this._stateChangedId = 0;

        if (this._countChangedId > 0) {
            if (this._type == ApplicationType.APPLICATION) {
                this._app.disconnect(this._countChangedId);
            }
        }
        this._countChangedId = 0;

        this._removeMenuTimeout();
    },

    _onButtonEnter: function(actor, event) {
    },

    _onButtonLeave: function(actor, event) {
    },

    _onButtonPress: function(actor, event) {
        if (this._type == ApplicationType.APPSBUTTON || this._type == ApplicationType.APPLICATION) {
            let button = event.get_button();
            if (button == 1) {
                this._removeMenuTimeout();
                this._menuTimeoutId = Mainloop.timeout_add(MENU_POPUP_TIMEOUT,
                    Lang.bind(this, function() {
                        this._menuTimeoutId = 0;
                        return GLib.SOURCE_REMOVE;
                    }));
            } else if (button == 3) {
                this.popupMenu();
                return Clutter.EVENT_STOP;
            }
        }
        return Clutter.EVENT_PROPAGATE;
    },

    _onClicked: function(actor, button) {
        //let event = Clutter.get_current_event();
        let tracker = Shell.WindowTracker.get_default();
        this._removeMenuTimeout();

        if (button == 1) {
            if (this._type == ApplicationType.APPLICATION) {
                if (this._app.state == Shell.AppState.RUNNING) {
                    if (this._app == tracker.focus_app && !Main.overview._shown) {
                        this._cycleThroughWindows();
                    } else {
                        // If we activate the app (this._app.activate), all app
                        // windows will come to the foreground. We only want to
                        // activate one window at a time
                        let windows = getInterestingWindows(this._app);
                        let w = windows[0];
                        Main.activateWindow(w);
                    }
                } else {
                    this._app.open_new_window(-1);
                }
            } else if (this._type == ApplicationType.PLACE) {
                this._app.launch(global.get_current_time());
            } else if (this._type == ApplicationType.RECENT) {
                Gio.app_info_launch_default_for_uri(this._app.uri, global.create_app_launch_context());
            } else if (this._type == ApplicationType.APPSBUTTON) {
                if (Main.overview.visible) {
                    if (Main.overview.viewSelector._showAppsButton.checked) {
                        Main.overview.viewSelector._showAppsButton.checked = false;
                        Main.overview.hide();
                    } else {
                        Main.overview.viewSelector._showAppsButton.checked = true;
                    }
                } else {
                    // passingthru67: ISSUES #49 & #50
                    // Workaround issue by detecting animation status
                    // Showing the overview after checking the showAppsButton fails
                    // to animate when Gnome animations are enabled. On the other hand,
                    // showing the overview before checking the showAppsButton fails
                    // to scroll when Gnome animations are disabled.
                    if (this._gDesktopInterfaceSettings.get_boolean('enable-animations')) {
                        Main.overview.show();
                        Main.overview.viewSelector._showAppsButton.checked = true;
                    } else {
                        Main.overview.viewSelector._showAppsButton.checked = true;
                        Main.overview.show();
                    }
                }
            }
        } else if (button == 2) {
            if (this._type == ApplicationType.APPLICATION) {
                this._app.open_new_window(-1);
            }
        }
        return Clutter.EVENT_PROPAGATE;
    },

    _cycleThroughWindows: function() {
        // Store for a little amount of time last time app was clicked
        // since the order changes upon window interaction
        let MEMORY_TIME = 3000;

        let appWindows = getInterestingWindows(this._app);

        if(recentlyClickedAppLoopId>0)
            Mainloop.source_remove(recentlyClickedAppLoopId);

        recentlyClickedAppLoopId = Mainloop.timeout_add(MEMORY_TIME, this._resetClickedApp);

        // If there isn't already a list of windows for the current app,
        // or the stored list is outdated, use the current windows list.
        if (!recentlyClickedApp ||
            recentlyClickedApp.get_id() != this._app.get_id() ||
            recentlyClickedAppWindows.length != appWindows.length
          ) {

            recentlyClickedApp = this._app;
            recentlyClickedAppWindows = appWindows;
            recentlyClickedAppIndex = 0;
        }

        recentlyClickedAppIndex ++;
        let index = recentlyClickedAppIndex % recentlyClickedAppWindows.length;
        let window = recentlyClickedAppWindows[index];
        Main.activateWindow(window);
    },

    _resetClickedApp: function() {
        if(recentlyClickedAppLoopId>0)
            Mainloop.source_remove(recentlyClickedAppLoopId);

        recentlyClickedAppLoopId=0;
        recentlyClickedApp =null;
        recentlyClickedAppWindows = null;
        recentlyClickedAppIndex = 0;

        return false;
    },

    _removeMenuTimeout: function() {
        if (this._menuTimeoutId > 0) {
            Mainloop.source_remove(this._menuTimeoutId);
            this._menuTimeoutId = 0;
        }
    },

    popupMenu: function() {
        if (this._type != ApplicationType.APPSBUTTON && this._type != ApplicationType.APPLICATION)
             return false;

        this._removeMenuTimeout();
        this.actor.fake_release();
        if (this._draggable)
            this._draggable.fakeRelease();

        if (!this._menu) {
            this._menu = new ShortcutButtonMenu(this);
            this._menu.connect('activate-window', Lang.bind(this, function (menu, window) {
                this._activateWindowFromMenu(window);
            }));
            this._menu.connect('open-state-changed', Lang.bind(this, function (menu, isPoppedUp) {
                if (!isPoppedUp)
                    this._onMenuPoppedDown();
            }));
            Main.overview.connect('hiding', Lang.bind(this, function () { this._menu.close(); }));

            this._menuManager.addMenu(this._menu);
        }

        this.emit('menu-state-changed', true);

        this._panel.setPopupMenuFlag(true);
        this._panel.hideThumbnails();
        this.actor.set_hover(true);
        this._menu.popup(this);
        this._menuManager.ignoreRelease();

        return false;
    },

    _onMenuPoppedDown: function() {
        this.actor.sync_hover();
        this.emit('menu-state-changed', false);
        this._panel.setPopupMenuFlag(false);
        this._panel.showThumbnails();
    },

    _activateWindowFromMenu: function(metaWindow) {
        if (metaWindow) {
            Main.activateWindow(metaWindow);
        }
    },

    _onStateChanged: function() {
        if (this._type == ApplicationType.APPSBUTTON) {
            if (Main.overview.viewSelector._showAppsButton.checked) {
                this.actor.add_style_pseudo_class('checked');
            } else {
                this.actor.remove_style_pseudo_class('checked');
            }
        } else if (this._type == ApplicationType.APPLICATION) {
            if (this._app.state != Shell.AppState.STOPPED) {
                if (!this._settings.get_boolean('shortcuts-panel-show-window-count-indicators')) {
                    this._dot.opacity = 255;
                }
                this._onCountChanged();
            } else {
                this._dot.opacity = 0;
                this._onCountChanged();
            }
        }
    },

    _onCountChanged: function() {
        if (!this._settings.get_boolean('shortcuts-panel-show-window-count-indicators'))
            return;

        let appWindows = this._app.get_windows().filter(function(w) {
            return !w.skip_taskbar;
        });

        let n = appWindows.length;
        if (n > this._maxN)
             n = this._maxN;

        for (let i = 1; i <= this._maxN; i++) {
            let className = 'workspacestodock-shortcut-button-windowcount-image-'+i;
            if (i != n) {
                this.actor.remove_style_class_name(className);
            } else {
                this.actor.add_style_class_name(className);
            }
        }
    },

    getDragActor: function() {
        let appIcon;
        if (this._type == ApplicationType.APPLICATION) {
            appIcon = this._app.create_icon_texture(this._iconSize);
        } else if (this._type == ApplicationType.PLACE) {
            appIcon = new St.Icon({gicon: this._app.icon, icon_size: this._iconSize});
        } else if (this._type == ApplicationType.RECENT) {
            let gicon = Gio.content_type_get_icon(this._app.mime);
            appIcon = new St.Icon({gicon: gicon, icon_size: this._iconSize});
        } else if (this._type == ApplicationType.APPSBUTTON) {
            appIcon = new St.Icon({icon_name: 'view-grid-symbolic', icon_size: iconSize});
        }
        return appIcon;
    },

    // Returns the original actor that should align with the actor
    // we show as the item is being dragged.
    getDragActorSource: function() {
        return this._icon.actor;
    },

    shellWorkspaceLaunch : function(params) {
        params = Params.parse(params, { workspace: -1,
                                        timestamp: 0 });

        if (this._type == ApplicationType.APPLICATION) {
            this._app.open_new_window(params.workspace);
        } else if (this._type == ApplicationType.PLACE) {
            this._app.launch(global.get_current_time(), params.workspace);
        } else if (this._type == ApplicationType.RECENT) {
            Gio.app_info_launch_default_for_uri(this._app.uri, global.create_app_launch_context());
        } else if (this._type == ApplicationType.APPSBUTTON) {
            if (Main.overview.visible) {
                if (Main.overview.viewSelector._showAppsButton.checked) {
                    Main.overview.hide();
                    Main.overview.viewSelector._showAppsButton.checked = false;
                } else {
                    Main.overview.viewSelector._showAppsButton.checked = true;
                }
            } else {
                Main.overview.show();
                Main.overview.viewSelector._showAppsButton.checked = true;
            }
        }
    }
});
Signals.addSignalMethods(ShortcutButton.prototype);

const ShortcutsPanel = new Lang.Class({
    Name: 'workspacestodock.ShortcutsPanel',

    _init: function (dock) {
        this._dock = dock;
        this._settings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');
        this._position = getPosition(this._settings);
        this._isHorizontal = (this._position == St.Side.TOP ||
                              this._position == St.Side.BOTTOM);

        let packVertical = true;
        if (this._isHorizontal)
            packVertical = false;

        this.actor = new St.BoxLayout({ style_class: 'workspace-thumbnails workspacestodock-shortcuts-panel', vertical: packVertical, clip_to_allocation: true });
        this.actor._delegate = this;

        this._appSystem = Shell.AppSystem.get_default();
        this._appFavorites = AppFavorites.getAppFavorites();

        this._installedChangedId = this._appSystem.connect('installed-changed', Lang.bind(this, function() {
            this._appFavorites.reload();
            this.refresh();
        }));

        // Connect to AppSystem and listen for app state changes
        this._appStateChangedId = this._appSystem.connect('app-state-changed', Lang.bind(this, this._updateRunningApps));

        // Connect to AppFavorites and listen for favorites changes
        this._favoritesChangedId = this._appFavorites.connect('changed', Lang.bind(this, this._queueUpdateFavoriteApps));

        // Connect to item drag signals
        this._dragPlaceholder = null;
        this._dragPlaceholderPos = -1;
        Main.overview.connect('item-drag-begin', Lang.bind(this, this._onDragBegin));
        Main.overview.connect('item-drag-end', Lang.bind(this, this._onDragEnd));
        Main.overview.connect('item-drag-cancelled', Lang.bind(this, this._onDragCancelled));

        // Bind Preference Settings
        this._bindSettingsChanges();

        // Populate panel
        this._populate();
    },

    destroy: function() {
        // Disconnect global signals
        if (this._installedChangedId > 0) this._appSystem.disconnect(this._installedChangedId);
        if (this._appStateChangedId > 0) this._appSystem.disconnect(this._appStateChangedId);
        if (this._favoritesChangedId > 0) this._appFavorites.disconnect(this._favoritesChangedId);

        // Disconnect GSettings signals
        this._settings.run_dispose();

        // Destroy main clutter actor
        this.actor.destroy();
    },

    _bindSettingsChanges: function() {
        this._settings.connect('changed::shortcuts-panel-show-running', Lang.bind(this, function() {
            this.refresh();
        }));
        this._settings.connect('changed::shortcuts-panel-show-places', Lang.bind(this, function() {
            this.refresh();
        }));
        this._settings.connect('changed::shortcuts-panel-show-window-count-indicators', Lang.bind(this, function() {
            this.refresh();
        }));
        this._settings.connect('changed::shortcuts-panel-appsbutton-at-bottom', Lang.bind(this, function() {
            this.refresh();
        }));
    },

    _onDragBegin: function() {
        this._dragCancelled = false;
        this._dragMonitor = {
            dragMotion: Lang.bind(this, this._onDragMotion)
        };
        DND.addDragMonitor(this._dragMonitor);
    },

    _onDragCancelled: function() {
        this._dragCancelled = true;
        this._endDrag();
    },

    _onDragEnd: function() {
        if (this._dragCancelled)
            return;

        this._endDrag();
    },

    _endDrag: function() {
        this._clearDragPlaceholder();
        DND.removeDragMonitor(this._dragMonitor);
    },

    _onDragMotion: function(dragEvent) {
        let app = getAppFromSource(dragEvent.source);
        if (app == null)
            return DND.DragMotionResult.CONTINUE;

        if (!this.actor.contains(dragEvent.targetActor))
            this._clearDragPlaceholder();

        return DND.DragMotionResult.CONTINUE;
    },

    _clearDragPlaceholder: function() {
        if (this._dragPlaceholder) {
            this._dragPlaceholder.destroy();
            this._dragPlaceholder = null;
        }
        this._dragPlaceholderPos = -1;
    },

    handleDragOver : function(source, actor, x, y, time) {
        let app = getAppFromSource(source);

        // Don't allow favoriting of transient apps
        if (app == null || app.is_window_backed())
            return DND.DragMotionResult.NO_DROP;

        if (!global.settings.is_writable('favorite-apps'))
            return DND.DragMotionResult.NO_DROP;

        let favorites = AppFavorites.getAppFavorites().getFavorites();
        let numFavorites = favorites.length;

        let favPos = favorites.indexOf(app);

        let children = this._favoriteAppsBox.get_children();
        let numChildren = children.length;
        let boxH;
        let boxY;
        if (this._isHorizontal) {
            boxY = this._favoriteAppsBox.x;
            boxH = this._favoriteAppsBox.width;
        } else {
            boxY = this._favoriteAppsBox.y;
            boxH = this._favoriteAppsBox.height;
        }

        // Keep the placeholder out of the index calculation; assuming that
        // the remove target has the same size as "normal" items, we don't
        // need to do the same adjustment there.
        if (this._dragPlaceholder) {
            if (this._isHorizontal) {
                boxH -= this._dragPlaceholder.actor.width;
            } else {
                boxH -= this._dragPlaceholder.actor.height;
            }
            numChildren--;
        }

        let pos;
        let posY;
        if (this._isHorizontal) {
            posY = x - boxY;
        } else {
            posY = y - boxY;
        }
        pos = Math.floor(posY * numChildren / boxH);

        if (pos != this._dragPlaceholderPos && pos <= numFavorites) {
            this._dragPlaceholderPos = pos;

            // Don't allow positioning before or after self
            if (favPos != -1 && (pos == favPos || pos == favPos + 1)) {
                this._clearDragPlaceholder();
                return DND.DragMotionResult.CONTINUE;
            }

            // If the placeholder already exists, we just move
            // it, but if we are adding it, expand its size in
            // an animation
            let fadeIn;
            if (this._dragPlaceholder) {
                this._dragPlaceholder.destroy();
                fadeIn = false;
            } else {
                fadeIn = true;
            }

            this._dragPlaceholder = new DragPlaceholderItem();
            this._favoriteAppsBox.insert_child_at_index(this._dragPlaceholder.actor,
                                            this._dragPlaceholderPos);
            this._dragPlaceholder.actor.show(fadeIn);
        }

        // Remove the drag placeholder if we are not in the
        // "favorites zone"
        if (pos > numFavorites)
            this._clearDragPlaceholder();

        if (!this._dragPlaceholder)
            return DND.DragMotionResult.NO_DROP;

        let srcIsFavorite = (favPos != -1);
        if (srcIsFavorite) {
            return DND.DragMotionResult.MOVE_DROP;
        }

        return DND.DragMotionResult.COPY_DROP;
    },

    // Draggable target interface
    acceptDrop : function(source, actor, x, y, time) {
        let app = getAppFromSource(source);

        // Don't allow favoriting of transient apps
        if (app == null || app.is_window_backed()) {
            return false;
        }

        if (!global.settings.is_writable('favorite-apps'))
            return false;

        let id = app.get_id();

        let favorites = AppFavorites.getAppFavorites().getFavoriteMap();

        let srcIsFavorite = (id in favorites);

        let favPos = 0;
        let children = this._favoriteAppsBox.get_children();
        for (let i = 0; i < this._dragPlaceholderPos; i++) {
            if (this._dragPlaceholder &&
                children[i] == this._dragPlaceholder)
                continue;

            let childId = children[i]._delegate._app.get_id();
            if (childId == id) {
                continue;
            }
            if (childId in favorites) {
                favPos++;
            }
        }

        // No drag placeholder means we don't wan't to favorite the app
        // and we are dragging it to its original position
        if (!this._dragPlaceholder)
            return true;

        Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this,
            function () {
                let appFavorites = AppFavorites.getAppFavorites();
                if (srcIsFavorite)
                    appFavorites.moveFavoriteToPos(id, favPos);
                else
                    appFavorites.addFavoriteAtPos(id, favPos);
                return false;
            }));

        this._clearDragPlaceholder();
        return true;
    },

    setPopupMenuFlag: function(showing) {
        this._dock.setPopupMenuFlag(showing);
    },

    hideThumbnails: function() {
        if (this._settings.get_boolean('shortcuts-panel-popupmenu-hide-thumbnails')) {
            if (this._settings.get_enum('shortcuts-panel-orientation') == ShortcutsPanelOrientation.OUTSIDE) {
                this._dock._thumbnailsBox.actor.opacity = 0;
                this.actor.remove_style_class_name('workspacestodock-shortcuts-panel');
                this.actor.add_style_class_name('workspacestodock-shortcuts-panel-popupmenu');
                // for (let i = 0; i < this._dock._thumbnailsBox._thumbnails.length; i++) {
                //     this._dock._thumbnailsBox._thumbnails[i].actor.opacity = 0;
                // }
                // this._dock._thumbnailsBox._indicator.opacity = 0;
            }
        }
    },

    showThumbnails: function() {
        if (this._settings.get_boolean('shortcuts-panel-popupmenu-hide-thumbnails')) {
            this._dock._thumbnailsBox.actor.opacity = 255;
            this.actor.remove_style_class_name('workspacestodock-shortcuts-panel-popupmenu');
            this.actor.add_style_class_name('workspacestodock-shortcuts-panel');
            // for (let i = 0; i < this._dock._thumbnailsBox._thumbnails.length; i++) {
            //     this._dock._thumbnailsBox._thumbnails[i].actor.opacity = 255;
            // }
            // this._dock._thumbnailsBox._indicator.opacity = 255;
        }
    },

    setReactiveState: function (state) {
        if (state == null)
            return;

        // Deactive Apps button
        this._appsButton.actor.reactive = state;

        // Deactivate favorites
        if (this._favoriteAppsBox) {
            let children = this._favoriteAppsBox.get_children();
            for (let i = 0; i < children.length; i++) {
                children[i].reactive = state;
            }
        }

        // Deactivate running apps
        if (this._runningAppsBox) {
            let children = this._runningAppsBox.get_children();
            for (let i = 0; i < children.length; i++) {
                children[i].reactive = state;
            }
        }

        // Deactivate places
        if (this._placesBox) {
            let children = this._placesBox.get_children();
            for (let i = 0; i < children.length; i++) {
                children[i].reactive = state;
            }
        }
    },

    refresh: function() {
        this._clear();
        this._populate();
    },

    _clear: function() {
        this.actor.destroy_all_children();
    },

    _populate: function() {
        let packVertical = true;
        if (this._isHorizontal)
            packVertical = false;

        // Add Favorite Apps Box
        this._favoriteAppsBox = new St.BoxLayout({ vertical: packVertical, style_class: 'workspacestodock-shortcuts-panel workspacestodock-shortcuts-panel-favorites' });
        this.actor.add_actor(this._favoriteAppsBox);
        this._favoriteAppsWorkId = Main.initializeDeferredWork(this._favoriteAppsBox, Lang.bind(this, this._updateFavoriteApps));

        // Add Running Apps Box
        if (this._settings.get_boolean('shortcuts-panel-show-running')) {
            this._runningAppsBox = new St.BoxLayout({ vertical: packVertical, style_class: 'workspacestodock-shortcuts-panel workspacestodock-shortcuts-panel-running' });
            this.actor.add_actor(this._runningAppsBox);
            this._updateRunningApps();
        }

        if (this._settings.get_boolean('shortcuts-panel-show-places')) {
            this._placesBox = new St.BoxLayout({ vertical: packVertical, style_class: 'workspacestodock-shortcuts-panel workspacestodock-shortcuts-panel-places' });
            this.actor.add_actor(this._placesBox);

            // Get places
            let placesManager = new PlaceDisplay.PlacesManager();
            let special = placesManager.get('special');

            let allPlaces = [];
            allPlaces = allPlaces.concat(special);

            // Add places to Places Box
            for (let i = 0; i < allPlaces.length; ++i) {
                let app = allPlaces[i];
                let shortcutButton = new ShortcutButton(app, ApplicationType.PLACE);
                this._placesBox.add_actor(shortcutButton.actor);
            }
        }

        // Add Apps Button to top or bottom of shortcuts panel
        this._appsButton = new ShortcutButton(null, ApplicationType.APPSBUTTON, this);
        if (this._settings.get_boolean('shortcuts-panel-appsbutton-at-bottom')) {
            let filler = new St.Widget({ style_class: 'popup-separator-menu-item workspacestodock-shortcut-panel-filler' });
            this.actor.add(filler, { expand: true });
            this.actor.add_actor(this._appsButton.actor);
        } else {
            this.actor.insert_child_at_index(this._appsButton.actor, 0);
        }
    },

    _queueUpdateFavoriteApps: function () {
        Main.queueDeferredWork(this._favoriteAppsWorkId);
    },

    _updateFavoriteApps: function() {
        if (!this._favoriteAppsBox)
            return;

        // Clear favorite apps box
        this._favoriteAppsBox.destroy_all_children();

        // Apps supposed to be in the favorite apps box
        let newApps = [];

        // Get favorites
        let favorites = this._appFavorites.getFavoriteMap();
        for (let id in favorites) {
            newApps.push(favorites[id]);
        }

        // Populate shortcuts panel with favorites
        for (let i = 0; i < newApps.length; ++i) {
            let app = newApps[i];
            let shortcutButton = new ShortcutButton(app, ApplicationType.APPLICATION, this);
            this._favoriteAppsBox.add_actor(shortcutButton.actor);
        }

        this.emit('update-favorite-apps');
        this._updateRunningApps();
    },

    _updateRunningApps: function() {
        if (!this._runningAppsBox)
            return;

        let children = this._runningAppsBox.get_children().filter(function(actor) {
                return actor &&
                      actor._delegate &&
                      actor._delegate._app && actor._delegate._type == ApplicationType.APPLICATION;
            });

        // Apps currently in running apps box
        let oldApps = children.map(function(actor) {
            return actor._delegate._app;
        });

        // Apps supposed to be in the running apps box
        let newApps = [];

        // Get favorites
        let favorites = this._appFavorites.getFavoriteMap();

        // Get running apps
        let running = this._appSystem.get_running();
        for (let i = 0; i < running.length; i++) {
            let app = running[i];
            if (app.get_id() in favorites)
                continue;
            newApps.push(app);
        }

        // Figure out the actual changes to the list of items; we iterate
        // over both the list of items currently in the dash and the list
        // of items expected there, and collect additions and removals.
        // Moves are both an addition and a removal, where the order of
        // the operations depends on whether we encounter the position
        // where the item has been added first or the one from where it
        // was removed.
        // There is an assumption that only one item is moved at a given
        // time; when moving several items at once, everything will still
        // end up at the right position, but there might be additional
        // additions/removals (e.g. it might remove all the launchers
        // and add them back in the new order even if a smaller set of
        // additions and removals is possible).
        // If above assumptions turns out to be a problem, we might need
        // to use a more sophisticated algorithm, e.g. Longest Common
        // Subsequence as used by diff.
        let addedItems = [];
        let removedActors = [];

        let newIndex = 0;
        let oldIndex = 0;
        while (newIndex < newApps.length || oldIndex < oldApps.length) {
            // No change at oldIndex/newIndex
            if (oldApps[oldIndex] == newApps[newIndex]) {
                oldIndex++;
                newIndex++;
                continue;
            }

            // App removed at oldIndex
            if (oldApps[oldIndex] &&
                newApps.indexOf(oldApps[oldIndex]) == -1) {
                removedActors.push(children[oldIndex]);
                oldIndex++;
                continue;
            }

            // App added at newIndex
            if (newApps[newIndex] &&
                oldApps.indexOf(newApps[newIndex]) == -1) {
                addedItems.push({ app: newApps[newIndex],
                                  item: this._createShortcutButton(newApps[newIndex], ApplicationType.APPLICATION),
                                  pos: newIndex });
                newIndex++;
                continue;
            }

            // App moved
            let insertHere = newApps[newIndex + 1] &&
                             newApps[newIndex + 1] == oldApps[oldIndex];
            let alreadyRemoved = removedActors.reduce(function(result, actor) {
                let removedApp = actor.child._delegate.app;
                return result || removedApp == newApps[newIndex];
            }, false);

            if (insertHere || alreadyRemoved) {
                let newItem = this._createShortcutButton(newApps[newIndex], shortcutType);
                addedItems.push({ app: newApps[newIndex],
                                  item: newItem,
                                  pos: newIndex + removedActors.length });
                newIndex++;
            } else {
                removedActors.push(children[oldIndex]);
                oldIndex++;
            }
        }

        for (let i = 0; i < addedItems.length; i++)
            this._runningAppsBox.insert_child_at_index(addedItems[i].item,
                                            addedItems[i].pos);

        for (let i = 0; i < removedActors.length; i++) {
            let item = removedActors[i];
            item.destroy();
        }

        this.emit('update-running-apps');
    },

    _createShortcutButton: function(app, appType) {
        let shortcutType = app ? appType : ApplicationType.APPSBUTTON;
        let shortcutButton = new ShortcutButton(app, shortcutType, this);
        return shortcutButton.actor;
    }
});
Signals.addSignalMethods(ShortcutsPanel.prototype);
