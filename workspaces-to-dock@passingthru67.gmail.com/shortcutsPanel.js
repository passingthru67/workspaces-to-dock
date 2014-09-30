const _DEBUG_ = false;

const IconTheme = imports.gi.Gtk.IconTheme;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const GMenu = imports.gi.GMenu;
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
const AppFavorites = imports.ui.appFavorites;
const Layout = imports.ui.layout;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const DND = imports.ui.dnd;
const IconGrid = imports.ui.iconGrid;
const Separator = imports.ui.separator;

const ExtensionSystem = imports.ui.extensionSystem;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = imports.misc.extensionUtils.getCurrentExtension();

const PlaceDisplay = Me.imports.placeDisplay;
const Convenience = Me.imports.convenience;

const MENU_POPUP_TIMEOUT = 600;

const ApplicationType = {
    APPLICATION: 0,
    PLACE: 1,
    RECENT: 2,
    APPSBUTTON: 3
};

const ShortcutButtonMenu = new Lang.Class({
    Name: 'workspacestodock_shortcutButtonMenu',
    Extends: PopupMenu.PopupMenu,

    _init: function(source) {
        this._settings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');

        let side = St.Side.RIGHT;
        if (Clutter.get_default_text_direction() == Clutter.TextDirection.RTL)
            side = St.Side.LEFT;

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

            this._newWindowMenuItem = this._appendMenuItem(_("New Window"));
            this._newWindowMenuItem.connect('activate', Lang.bind(this, function() {
                this._source._app.open_new_window(-1);
                this.emit('activate-window', null);
            }));
            this._appendSeparator();

            let appInfo = this._source._app.get_app_info();
            let actions = appInfo.list_actions();
            for (let i = 0; i < actions.length; i++) {
                let action = actions[i];
                let item = this._appendMenuItem(appInfo.get_action_name(action));
                item.connect('activate', Lang.bind(this, function(emitter, event) {
                    this._source._app.launch_action(action, event.get_time(), -1);
                    this.emit('activate-window', null);
                }));
            }
            this._appendSeparator();

            let isFavorite = AppFavorites.getAppFavorites().isFavorite(this._source._app.get_id());

            if (isFavorite) {
                let item = this._appendMenuItem(_("Remove from Favorites"));
                item.connect('activate', Lang.bind(this, function() {
                    let favs = AppFavorites.getAppFavorites();
                    favs.removeFavorite(this._source._app.get_id());
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

const ShortcutButton = new Lang.Class({
    Name: 'workspacestodock.ShortcutButton',

    _init: function (app, appType, panel) {
        this._app = app;
        this._type = appType;
        this._panel = panel;
        this._stateChangedId = 0;
        this._settings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');

        this.actor = new St.Button({style_class:'app-well-app workspacestodock-shortcut-button'});
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
        this._icon = new IconGrid.BaseIcon(null, iconParams);
        this._icon.actor.add_style_class_name('workspacestodock-shortcut-button-icon');
        if (appType == ApplicationType.PLACE) {
            this._icon.actor.add_style_class_name('workspacestodock-shortcut-button-symbolic-icon');
        }
        this._icon.setIconSize(this._iconSize);
        this.actor.set_child(this._icon.actor);

        this._menu = null;
        this._menuManager = new PopupMenu.PopupMenuManager(this);

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
        }

        // Connect drag-n-drop signals
        if (appType != ApplicationType.APPSBUTTON) {
            this._draggable = DND.makeDraggable(this.actor);
            this._draggable.connect('drag-begin', Lang.bind(this,
                function () {
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
    },

    _onButtonEnter: function(actor, event) {
    },

    _onButtonLeave: function(actor, event) {
    },

    _onButtonPress: function(actor, event) {
        if (this._type == ApplicationType.APPLICATION) {
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
        this._removeMenuTimeout();
        if (button == 1) {
            if (this._type == ApplicationType.APPLICATION) {
                if (this._app.state == Shell.AppState.RUNNING) {
                    this._app.activate();
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
        } else if (button == 2) {
            if (this._type == ApplicationType.APPLICATION) {
                this._app.open_new_window(-1);
            }
        }
        return Clutter.EVENT_PROPAGATE;
    },

    _removeMenuTimeout: function() {
        if (this._menuTimeoutId > 0) {
            Mainloop.source_remove(this._menuTimeoutId);
            this._menuTimeoutId = 0;
        }
    },

    popupMenu: function() {
        if (this._type != ApplicationType.APPLICATION)
             return false;

        this._removeMenuTimeout();
        this.actor.fake_release();
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

        this._panel.hideThumbnails();
        this.actor.set_hover(true);
        this._menu.popup();
        this._menuManager.ignoreRelease();

        return false;
    },

    _onMenuPoppedDown: function() {
        this.actor.sync_hover();
        this.emit('menu-state-changed', false);
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
                this.actor.add_style_class_name('running');
            } else {
                this.actor.remove_style_class_name('running');
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
        this.actor = new St.BoxLayout({ style_class: 'workspace-thumbnails workspacestodock-shortcuts-panel', vertical: true, clip_to_allocation: true });
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
        this._favoritesChangedId = this._appFavorites.connect('changed', Lang.bind(this, this._updateFavoriteApps));

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
        this._settings.connect('changed::shortcuts-panel-appsbutton-at-bottom', Lang.bind(this, function() {
            this.refresh();
        }));
    },

    hideThumbnails: function() {
        if (this._settings.get_boolean('shortcuts-panel-popupmenu-hide-thumbnails')) {
            this._dock._thumbnailsBox.actor.opacity = 0;
            this.actor.remove_style_class_name('workspacestodock-shortcuts-panel');
            this.actor.add_style_class_name('workspacestodock-shortcuts-panel-popupmenu');
            // for (let i = 0; i < this._dock._thumbnailsBox._thumbnails.length; i++) {
            //     this._dock._thumbnailsBox._thumbnails[i].actor.opacity = 0;
            // }
            // this._dock._thumbnailsBox._indicator.opacity = 0;
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

    refresh: function() {
        this._clear();
        this._populate();
    },

    _clear: function() {
        this.actor.destroy_all_children();
    },

    _populate: function() {
        // Add Favorite Apps Box
        this._favoriteAppsBox = new St.BoxLayout({ vertical: true, style_class: 'workspacestodock-shortcuts-panel workspacestodock-shortcuts-panel-favorites' });
        this.actor.add_actor(this._favoriteAppsBox);
        this._updateFavoriteApps();

        // Add Running Apps Box
        if (this._settings.get_boolean('shortcuts-panel-show-running')) {
            this._runningAppsBox = new St.BoxLayout({ vertical: true, style_class: 'workspacestodock-shortcuts-panel workspacestodock-shortcuts-panel-running' });
            this.actor.add_actor(this._runningAppsBox);
            this._updateRunningApps();
        }

        if (this._settings.get_boolean('shortcuts-panel-show-places')) {
            let separator = new Separator.HorizontalSeparator({ style_class: 'popup-separator-menu-item workspacestodock-shortcut-panel-separator' });
            this.actor.add(separator.actor, { expand: false });

            // Get places
            let placesManager = new PlaceDisplay.PlacesManager();
            let special = placesManager.get('special');

            let allPlaces = [];
            allPlaces = allPlaces.concat(special);

            // Populate shortcuts panel with places
            for (let i = 0; i < allPlaces.length; ++i) {
                let app = allPlaces[i];
                let shortcutButton = new ShortcutButton(app, ApplicationType.PLACE);
                this.actor.add_actor(shortcutButton.actor);
            }
        }

        // Add Apps Button to top or bottom of shortcuts panel
        let shortcutButton = new ShortcutButton(null, ApplicationType.APPSBUTTON);
        if (this._settings.get_boolean('shortcuts-panel-appsbutton-at-bottom')) {
            let filler = new Separator.HorizontalSeparator({ style_class: 'popup-separator-menu-item workspacestodock-shortcut-panel-filler' });
            this.actor.add(filler.actor, { expand: true });
            this.actor.add_actor(shortcutButton.actor);
        } else {
            this.actor.insert_child_at_index(shortcutButton.actor, 0);
        }

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
    },

    _createShortcutButton: function(app, appType) {
        let shortcutType = app ? appType : ApplicationType.APPSBUTTON;
        let shortcutButton = new ShortcutButton(app, shortcutType, this);
        return shortcutButton.actor;
    }
});
Signals.addSignalMethods(ShortcutsPanel.prototype);
