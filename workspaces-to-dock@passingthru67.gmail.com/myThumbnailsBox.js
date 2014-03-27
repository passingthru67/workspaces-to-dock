/* ========================================================================================================
 * myThumbnailsBox.js - thumbnailsbox object
 * --------------------------------------------------------------------------------------------------------
 *  CREDITS:  Part of this code was copied from the gnome-shell-extensions framework
 *  http://git.gnome.org/browse/gnome-shell-extensions/
  * ========================================================================================================
 */

const _DEBUG_ = false;

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Signals = imports.signals;
const St = imports.gi.St;
const Mainloop = imports.mainloop;

const Main = imports.ui.main;
const Dash = imports.ui.dash;
const WorkspacesView = imports.ui.workspacesView;
const Workspace = imports.ui.workspace;
const WorkspaceThumbnail = imports.ui.workspaceThumbnail;
const Overview = imports.ui.overview;
const Tweener = imports.ui.tweener;
const IconGrid = imports.ui.iconGrid;
const PopupMenu = imports.ui.popupMenu;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

// The maximum size of a thumbnail is 1/8 the width and height of the screen
let MAX_THUMBNAIL_SCALE = 1/8.;

const RESCALE_ANIMATION_TIME = 0.2;
const SLIDE_ANIMATION_TIME = 0.2;

// When we create workspaces by dragging, we add a "cut" into the top and
// bottom of each workspace so that the user doesn't have to hit the
// placeholder exactly.
const WORKSPACE_CUT_SIZE = 10;

const WORKSPACE_KEEP_ALIVE_TIME = 100;

const OVERRIDE_SCHEMA = 'org.gnome.shell.overrides';

const CAPTION_HEIGHT = 40; // NOTE: Must be larger than CAPTION_APP_ICON_SIZE_ZOOMED + css icon padding + css icon border
const CAPTION_BACKGROUND_HEIGHT = 22;
const CAPTION_APP_ICON_NORMAL_SIZE = 16;
const CAPTION_APP_ICON_NORMAL_SIZE_ZOOMED = 24;
const CAPTION_APP_ICON_LARGE_SIZE = 24;
const CAPTION_APP_ICON_LARGE_SIZE_ZOOMED = 32;
const CAPTION_APP_ICON_MENU_SIZE = 20;

const PREFS_DIALOG = 'gnome-shell-extension-prefs workspaces-to-dock@passingthru67.gmail.com';

const ThumbnailState = {
    NEW: 0,
    ANIMATING_IN: 1,
    NORMAL: 2,
    REMOVING: 3,
    ANIMATING_OUT: 4,
    ANIMATED_OUT: 5,
    COLLAPSING: 6,
    DESTROYED: 7
};

const WindowAppsUpdateAction = {
    ADD: 0,
    REMOVE: 1,
    CLEARALL: 2
}

const WindowAppIcon = new Lang.Class({
    Name: 'workspacesToDock.windowAppIcon',

    _init: function(app, metaWin, thumbnail) {
        this._thumbnail = thumbnail;
        this._gsCurrentVersion = thumbnail._gsCurrentVersion;
        this._mySettings = thumbnail._mySettings;

        this._app = app;
        this._metaWin = metaWin;

        let iconParams = {setSizeManually: true, showLabel: false};
        iconParams['createIcon'] = Lang.bind(this, function(iconSize){ return app.create_icon_texture(iconSize);});

        this._icon = new IconGrid.BaseIcon(app.get_name(), iconParams);
        this._icon.actor.add_style_class_name('workspacestodock-caption-windowapps-button-icon');
        if (this._mySettings.get_boolean('workspace-caption-large-icons')) {
            this._icon.setIconSize(CAPTION_APP_ICON_LARGE_SIZE);
        } else {
            this._icon.setIconSize(CAPTION_APP_ICON_NORMAL_SIZE);
        }

        this.actor = new St.Button({style_class:'workspacestodock-caption-windowapps-button'});
        this.actor.set_child(this._icon.actor);
        this.actor._delegate = this;

        // Connect signals
        this.actor.connect('button-release-event', Lang.bind(this, thumbnail.activateMetaWindow, thumbnail, metaWin));
        this.actor.connect('enter-event', Lang.bind(this, this._onButtonEnter));
        this.actor.connect('leave-event', Lang.bind(this, this._onButtonLeave));
    },

    _onButtonEnter: function(actor, event) {
        if (_DEBUG_) global.log("windowAppIcon: _onButtonEnter");
        let icon = actor._delegate._icon;
        if (this._mySettings.get_boolean('workspace-caption-large-icons')) {
            icon.setIconSize(CAPTION_APP_ICON_LARGE_SIZE_ZOOMED);
        } else {
            icon.setIconSize(CAPTION_APP_ICON_NORMAL_SIZE_ZOOMED);
        }
    },

    _onButtonLeave: function(actor, event) {
        if (_DEBUG_) global.log("windowAppIcon: _onButtonLeave");
        let icon = actor._delegate._icon;
        if (this._mySettings.get_boolean('workspace-caption-large-icons')) {
            icon.setIconSize(CAPTION_APP_ICON_LARGE_SIZE);
        } else {
            icon.setIconSize(CAPTION_APP_ICON_NORMAL_SIZE);
        }
    }

});

const WindowAppMenuItem = new Lang.Class({
    Name: 'workspacesToDock.windowAppMenuItem',

    _init: function(app, metaWin, thumbnail) {
        this._gsCurrentVersion = thumbnail._gsCurrentVersion;
        let iconParams = {setSizeManually: true, showLabel: false};
        iconParams['createIcon'] = Lang.bind(this, function(iconSize){ return app.create_icon_texture(iconSize);});

        this._icon = new IconGrid.BaseIcon(app.get_name(), iconParams);
        this._icon.actor.add_style_class_name('workspacestodock-caption-windowapps-menu-icon');
        this._icon.setIconSize(CAPTION_APP_ICON_MENU_SIZE);
        this._label = new St.Label({ text: app.get_name(), style_class: 'workspacestodock-caption-windowapps-menu-label' });

        this._buttonBox = new St.BoxLayout({style_class:'workspacestodock-caption-windowapps-menu-button'});
        this._buttonBox.add(this._icon.actor, {x_fill: false, y_fill: false, x_align: St.Align.START, y_align: St.Align.MIDDLE});
        this._buttonBox.add(this._label, {x_fill: true, y_fill: false, x_align: St.Align.START, y_align: St.Align.MIDDLE, expand: true});

        //this._closeIcon = new St.Icon({ icon_name: 'window-close-symbolic', style_class: 'popup-menu-icon' });

        this._closeButton = new St.Button({style_class:'workspacestodock-caption-windowapps-menu-close'});
        this._closeButton.add_style_class_name('window-close');
        //this._closeButton.set_size(CAPTION_APP_ICON_MENU_SIZE, CAPTION_APP_ICON_MENU_SIZE);
        //this._closeButton.set_child(this._closeIcon);

        this.actor = new St.BoxLayout({reactive: true, style_class: 'popup-menu-item workspacestodock-caption-windowapps-menu-item'});
        this.actor._delegate = this;

        this._ornament = 0;
        this._ornamentLabel = new St.Label({ style_class: 'popup-menu-ornament' });
        this.actor.add(this._ornamentLabel);
        this.actor.add(this._buttonBox, {x_fill: false, y_fill: false, x_align: St.Align.START, y_align: St.Align.MIDDLE, expand: true});
        this.actor.add(this._closeButton, {x_fill: true, y_fill: true, x_align: St.Align.END, y_align: St.Align.MIDDLE});

        // Connect signals
        this._closeButton.connect('button-release-event', Lang.bind(this, thumbnail.closeMetaWindow, thumbnail, metaWin, this));
        this.actor.connect('button-release-event', Lang.bind(this, thumbnail.activateMetaWindow, thumbnail, metaWin));
        this.actor.connect('enter-event', Lang.bind(this, this._onItemEnter));
        this.actor.connect('leave-event', Lang.bind(this, this._onItemLeave));
    },

    _onItemEnter: function(actor, event) {
        if (_DEBUG_) global.log("windowAppMenuItem: _onButtonEnter");
        this.actor.add_style_pseudo_class('active');
    },

    _onItemLeave: function(actor, event) {
        if (_DEBUG_) global.log("windowAppMenuItem: _onButtonLeave");
        this.actor.remove_style_pseudo_class('active');
    }

});

const myWorkspaceThumbnail = new Lang.Class({
    Name: 'workspacesToDock.myWorkspaceThumbnail',
    Extends: WorkspaceThumbnail.WorkspaceThumbnail,

    _init: function(metaWorkspace, thumbnailsBox) {
        this._windowsOnAllWorkspaces = [];
        this.parent(metaWorkspace);

        this._thumbnailsBox = thumbnailsBox;
        this._gsCurrentVersion = thumbnailsBox._gsCurrentVersion;
        this._mySettings = thumbnailsBox._mySettings;
        this._wsWindowApps = [];
        this._wsWindowAppsBox = null;
        this._windowAppsMenuListBox = null;
        this._windowAppsRealizeId = 0;

        this._afterWindowAddedId = this.metaWorkspace.connect_after('window-added',
                                                          Lang.bind(this, this._onAfterWindowAdded));
        this._afterWindowRemovedId = this.metaWorkspace.connect_after('window-removed',
                                                           Lang.bind(this, this._onAfterWindowRemoved));

        this._switchWorkspaceNotifyId =
            global.window_manager.connect('switch-workspace',
                                          Lang.bind(this, this._activeWorkspaceChanged));

        this._menuManager = new PopupMenu.PopupMenuManager(this);

        this._initCaption();
        this._windowAppsRealizeId = this.actor.connect("realize", Lang.bind(this, this._initWindowApps));
    },

    refreshWindowClones: function() {
        if (_DEBUG_ && !this._removed) global.log("myWorkspaceThumbnail: refreshWindowClones for metaWorkspace "+this.metaWorkspace.index());
        // Disconnect window signals
        for (let i = 0; i < this._allWindows.length; i++) {
            this._allWindows[i].disconnect(this._minimizedChangedIds[i]);
        }
        // Destroy window clones
        for (let i = 0; i < this._windows.length; i++) {
            this._windows[i].destroy();
        }
        // Create clones for windows that should be visible in the Overview
        this._windows = [];
        this._allWindows = [];
        this._minimizedChangedIds = [];
        let windows = global.get_window_actors().filter(Lang.bind(this, function(actor) {
            let win = actor.meta_window;
            return win.located_on_workspace(this.metaWorkspace);
        }));
        for (let i = 0; i < windows.length; i++) {
            let minimizedChangedId =
                windows[i].meta_window.connect('notify::minimized',
                                               Lang.bind(this,
                                                         this._updateMinimized));
            this._allWindows.push(windows[i].meta_window);
            this._minimizedChangedIds.push(minimizedChangedId);

            if (this._isMyWindow(windows[i]) && this._isOverviewWindow(windows[i])) {
                this._addWindowClone(windows[i]);
            }
        }
    },

    _onDestroy: function(actor) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _onDestroy");
        // passingthru67 - destroy caption taskbar and associated objects
        if (this._switchWorkspaceNotifyId > 0) {
            global.window_manager.disconnect(this._switchWorkspaceNotifyId);
            this._switchWorkspaceNotifyId = 0;
        }
        for (let i = 0; i < this._wsWindowApps.length; i++) {
            this._wsWindowApps[i].metaWin.disconnect(this._wsWindowApps[i].signalFocusedId);
        }
        this._wsWindowApps = [];
        if (this._wsWindowAppsBox) {
            this._wsWindowAppsBox.destroy_all_children();
            this._wsWindowAppsBox = null;
        }
        if (this._menu) {
            this._menu.close();
            this._menu.destroy();
        }
        this.parent(actor);
    },

    // Tests if @actor belongs to this workspace and monitor
    _isMyWindow : function (actor, isMetaWin) {
        let win;
        if (isMetaWin) {
            win = actor;
        } else {
            win = actor.meta_window;
        }
        return win.located_on_workspace(this.metaWorkspace) &&
            (win.get_monitor() == this.monitorIndex);
    },

    // Tests if @win should be shown in the Overview
    _isOverviewWindow : function (window, isMetaWin) {
        let win;
        if (isMetaWin) {
            win = window;
        } else {
            win = window.get_meta_window();
        }
        return !win.skip_taskbar &&
               win.showing_on_its_workspace();
    },

    // Tests if window app should be shown on this workspace
    _isMinimizedWindow : function (actor, isMetaWin) {
        let win;
        if (isMetaWin) {
            win = actor;
        } else {
            win = actor.meta_window;
        }
        return (!win.skip_taskbar && win.minimized);
    },

    // Tests if window app should be shown on this workspace
    _showWindowAppOnThisWorkspace : function (actor, isMetaWin) {
        let win;
        if (isMetaWin) {
            win = actor;
        } else {
            win = actor.meta_window;
        }
        let activeWorkspace = global.screen.get_active_workspace();
        return (this.metaWorkspace == activeWorkspace && !win.skip_taskbar && win.is_on_all_workspaces());
    },

    _doAddWindow : function(metaWin) {
        if (_DEBUG_ && !this._removed) global.log("myWorkspaceThumbnail: _doAddWindow for metaWorkspace "+this.metaWorkspace.index());
        if (this._removed)
            return;

        let win = metaWin.get_compositor_private();

        if (!win) {
            // Newly-created windows are added to a workspace before
            // the compositor finds out about them...
            Mainloop.idle_add(Lang.bind(this,
                                        function () {
                                            if (!this._removed &&
                                                metaWin.get_compositor_private() &&
                                                metaWin.get_workspace() == this.metaWorkspace)
                                                this._doAddWindow(metaWin);
                                            return GLib.SOURCE_REMOVE;
                                        }));
            return;
        }

        if (this._allWindows.indexOf(metaWin) == -1) {
            let minimizedChangedId = metaWin.connect('notify::minimized',
                                                     Lang.bind(this,
                                                               this._updateMinimized));
            this._allWindows.push(metaWin);
            this._minimizedChangedIds.push(minimizedChangedId);
        }

        // We might have the window in our list already if it was on all workspaces and
        // now was moved to this workspace
        if (this._lookupIndex (metaWin) != -1)
            return;

        if (!this._isMyWindow(win))
            return;

        if (this._isOverviewWindow(win)) {
            // passingthru67 - force thumbnail refresh if window is on all workspaces
            // note: _addWindowClone checks if metawindow is on all workspaces
            this._addWindowClone(win, true);
        } else if (metaWin.is_attached_dialog()) {
            let parent = metaWin.get_transient_for();
            while (parent.is_attached_dialog())
                parent = metaWin.get_transient_for();

            let idx = this._lookupIndex (parent);
            if (idx < 0) {
                // parent was not created yet, it will take care
                // of the dialog when created
                return;
            }

            let clone = this._windows[idx];
            clone.addAttachedDialog(metaWin);
        }
    },

    _doRemoveWindow : function(metaWin) {
        if (_DEBUG_ && !this._removed) global.log("myWorkspaceThumbnail: _doRemoveWindow for metaWorkspace "+this.metaWorkspace.index());
        let win = metaWin.get_compositor_private();

        // find the position of the window in our list
        let index = this._lookupIndex (metaWin);

        if (index == -1)
            return;

        // Check if window still should be here
        if (win && this._isMyWindow(win) && this._isOverviewWindow(win))
            return;

        let clone = this._windows[index];
        this._windows.splice(index, 1);

        // passingthru67 - refresh thumbnails is metaWin being removed is on all workspaces
        //if (win && this._isMyWindow(win) && metaWin.is_on_all_workspaces()) {
        if (win && metaWin.is_on_all_workspaces()) {
            for (let j = 0; j < this._windowsOnAllWorkspaces.length; j++) {
                if (metaWin == this._windowsOnAllWorkspaces[j]) {
                    this._windowsOnAllWorkspaces.splice(j, 1);
                }
            }
            this._thumbnailsBox.refreshThumbnails();
        }

        clone.destroy();
    },

    // Create a clone of a (non-desktop) window and add it to the window list
    _addWindowClone : function(win, refresh) {
        if (_DEBUG_ && !this._removed) global.log("myWorkspaceThumbnail: _addWindowClone for metaWorkspace "+this.metaWorkspace.index());
        let clone = new WorkspaceThumbnail.WindowClone(win);

        clone.connect('selected',
                      Lang.bind(this, function(clone, time) {
                          this.activate(time);
                      }));
        clone.connect('drag-begin',
                      Lang.bind(this, function() {
                          Main.overview.beginWindowDrag(clone);
                      }));
        clone.connect('drag-cancelled',
                      Lang.bind(this, function() {
                          Main.overview.cancelledWindowDrag(clone);
                      }));
        clone.connect('drag-end',
                      Lang.bind(this, function() {
                          Main.overview.endWindowDrag(clone);
                      }));
        this._contents.add_actor(clone.actor);

        if (this._windows.length == 0)
            clone.setStackAbove(this._bgManager.background.actor);
        else
            clone.setStackAbove(this._windows[this._windows.length - 1].actor);

        this._windows.push(clone);

        // passingthru67 - need to refresh thumbnails if new added window is on all workspaces
        // NOTE: refresh is only forced when a new window is added and not during myWorkspaceThumbnail initialization
        if (clone.metaWindow.is_on_all_workspaces()) {
            let alreadyPushed = false;
            for (let j = 0; j < this._windowsOnAllWorkspaces.length; j++) {
                if (clone.metaWindow == this._windowsOnAllWorkspaces[j]) {
                    alreadyPushed = true;
                }
            }
            if (!alreadyPushed) {
                this._windowsOnAllWorkspaces.push(clone.metaWindow);
            }
            if (refresh) {
                this._thumbnailsBox.refreshThumbnails();
            }
        }

        return clone;
    },

    // function initializes the WorkspaceThumbnails captions
    _initCaption: function() {
        if (_DEBUG_ && !this._removed) global.log("myWorkspaceThumbnail: _initCaption for metaWorkspace "+this.metaWorkspace.index());
        if (this._mySettings.get_boolean('workspace-captions')) {

            this._wsCaptionContainer = new St.Bin({
                name: 'workspacestodockCaptionContainer',
                reactive: false,
                style_class: 'workspacestodock-workspace-caption-container',
                x_fill: true,
                y_align: St.Align.END,
                x_align: St.Align.START
            });

            this._wsCaptionBackground = new St.Bin({
                name: 'workspacestodockCaptionBackground',
                reactive: false,
                style_class: 'workspacestodock-workspace-caption-background'
            });

            this._wsCaption = new St.BoxLayout({
                name: 'workspacestodockCaption',
                reactive: true,
                style_class: 'workspacestodock-workspace-caption',
                pack_start: true
            });

            let currentItems = this._mySettings.get_strv('workspace-caption-items');

            for (let i = 0; i < currentItems.length; i++) {
                let elements = currentItems[i].split(':');
                let item = elements[0]
                let expandState = (elements[1] == "true"? true: false);

                switch (item) {
                    case "number":
                        this._wsNumber = new St.Label({
                            name: 'workspacestodockCaptionNumber',
                            text: ''
                        });
                        this._wsNumberBox = new St.BoxLayout({
                            name: 'workspacestodockCaptionNumberBox',
                            style_class: 'workspacestodock-caption-number'
                        });
                        this._wsNumberBox.add(this._wsNumber, {x_fill: false, x_align: St.Align.MIDDLE, y_fill: false, y_align: St.Align.MIDDLE});
                        this._wsCaption.add(this._wsNumberBox, {x_fill: false, x_align: St.Align.START, y_fill: false, y_align: St.Align.END, expand: expandState});
                        break;
                    case "name":
                        this._wsName = new St.Label({
                            name: 'workspacestodockCaptionName',
                            text: ''
                        });
                        this._wsNameBox = new St.BoxLayout({
                            name: 'workspacestodockCaptionNameBox',
                            style_class: 'workspacestodock-caption-name'
                        });
                        this._wsNameBox.add(this._wsName, {x_fill: false, x_align: St.Align.MIDDLE, y_fill: false, y_align: St.Align.MIDDLE});
                        this._wsCaption.add(this._wsNameBox, {x_fill: false, x_align: St.Align.START, y_fill: false, y_align: St.Align.END, expand: expandState});
                        break;
                    case "windowcount":
                        this._wsWindowCount = new St.Label({
                            name: 'workspacestodockCaptionWindowCount',
                            text: ''
                        });
                        this._wsWindowCountBox = new St.BoxLayout({
                            name: 'workspacestodockCaptionWindowCountBox',
                            style_class: 'workspacestodock-caption-windowcount'
                        });
                        if (this._mySettings.get_boolean('workspace-caption-windowcount-image')) {
                            this._wsWindowCountBox.remove_style_class_name("workspacestodock-caption-windowcount");
                            this._wsWindowCountBox.add_style_class_name("workspacestodock-caption-windowcount-image");
                        }
                        this._wsWindowCountBox.add(this._wsWindowCount, {x_fill: false, x_align: St.Align.MIDDLE, y_fill: false, y_align: St.Align.MIDDLE});
                        this._wsCaption.add(this._wsWindowCountBox, {x_fill: false, x_align: St.Align.START, y_fill: false, y_align: St.Align.END, expand: expandState});
                        break;
                    case "windowapps":
                        this._wsWindowAppsBox = new St.BoxLayout({
                            name: 'workspacestodockCaptionWindowApps',
                            reactive: false,
                            style_class: 'workspacestodock-caption-windowapps'
                        });
                        this._wsCaption.add(this._wsWindowAppsBox, {x_fill: false, x_align: St.Align.START, y_fill: false, y_align: St.Align.END, expand: expandState});
                        break;
                    case "spacer":
                        this._wsSpacer = new St.Label({
                            name: 'workspacestodockCaptionSpacer',
                            text: ''
                        });
                        this._wsSpacerBox = new St.BoxLayout({
                            name: 'workspacestodockCaptionSpacerBox',
                            style_class: 'workspacestodock-caption-spacer'
                        });
                        this._wsSpacerBox.add(this._wsSpacer, {x_fill: false, x_align: St.Align.MIDDLE, y_fill: false, y_align: St.Align.MIDDLE});
                        this._wsCaption.add(this._wsSpacerBox, {x_fill: false, x_align: St.Align.START, y_fill: false, y_align: St.Align.END, expand: expandState});
                        break;
                }

            }

            // Add caption to thumbnail actor
            this._wsCaptionContainer.add_actor(this._wsCaption);
            this.actor.add_actor(this._wsCaptionBackground);
            this.actor.add_actor(this._wsCaptionContainer);

            // Make thumbnail background transparent so that it doesn't show through
            // on edges where border-radius is set on caption
            this.actor.set_style("background-color: rgba(0,0,0,0.0)");

            // Create menu and menuitems
            let rtl = Clutter.get_default_text_direction() == Clutter.TextDirection.RTL;
            if (rtl) {
                this._menu = new PopupMenu.PopupMenu(this._wsCaption, 0.5, St.Side.LEFT);
            } else {
                this._menu = new PopupMenu.PopupMenu(this._wsCaption, 0.5, St.Side.RIGHT);
            }

            // Set popup menu boxpointer point to center vertically on caption background
            // Otherwise the point lands at the top of the caption background because
            // the caption actually extends up another 18px.
            this._menu.setSourceAlignment(.8);

            this._menu.actor.add_style_class_name('workspacestodock-caption-windowapps-menu');
            this._menu.connect('open-state-changed', Lang.bind(this, function(menu, open) {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _onWindowAppsButtonClick - menu open-state-changed - open = "+open);
                if (open) {
                    // Set popup menu flag so that dock knows not to hide
                    this._thumbnailsBox.setPopupMenuFlag(true);

                    // Set windowAppsBox icons back to normal (not zoomed)
                    if (this._wsWindowAppsBox) {
                        let children = this._wsWindowAppsBox.get_children();
                        for (let i=0; i < children.length; i++) {
                            if (this._mySettings.get_boolean('workspace-caption-large-icons')) {
                                children[i]._delegate._icon.setIconSize(CAPTION_APP_ICON_LARGE_SIZE);
                            } else {
                                children[i]._delegate._icon.setIconSize(CAPTION_APP_ICON_NORMAL_SIZE);
                            }
                        }
                    }
                } else {
                    // Unset popup menu flag
                    this._thumbnailsBox.setPopupMenuFlag(false);
                }
            }));

            let item = new PopupMenu.PopupMenuItem(_("Extension Preferences"));
            item.connect('activate', Lang.bind(this, this._showExtensionPreferences));
            this._menu.addMenuItem(item);

            // Add to chrome and hide
            //Main.layoutManager.addChrome(this._menu.actor);
            Main.uiGroup.add_actor(this._menu.actor);
            this._menu.actor.hide();

            // Add menu to menu manager
            this._menuManager.addMenu(this._menu);

            // Connect signals
            this._wsCaption.connect('button-release-event', Lang.bind(this, this._onWorkspaceCaptionClick, this));
        }

    },

    // function initializes the window app icons for the caption taskbar
    _initWindowApps: function() {
        if (_DEBUG_ && !this._removed) global.log("myWorkspaceThumbnail: _initWindowApps for metaWorkspace "+this.metaWorkspace.index());
        if(this._windowAppsRealizeId > 0){
            this.actor.disconnect(this._windowAppsRealizeId);
            this._windowAppsRealizeId = 0;
        } else {
            return;
        }

        // Create initial buttons for windows on workspace
        let windows = global.get_window_actors();
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _initWindowApps - window count = "+windows.length);
        for (let i = 0; i < windows.length; i++) {
            let metaWin = windows[i].get_meta_window();
            if (!metaWin)
                continue;

            if (_DEBUG_) global.log("myWorkspaceThumbnail: _initWindowApps - add window buttons");
            let tracker = Shell.WindowTracker.get_default();
            let app = tracker.get_window_app(metaWin);
            if (app) {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _initWindowApps - window button app = "+app.get_name());
                let button = new WindowAppIcon(app, metaWin, this);
                if (metaWin.has_focus()) {
                    button.actor.add_style_class_name('workspacestodock-caption-windowapps-button-active');
                }

                if ((this._isMyWindow(windows[i]) && this._isOverviewWindow(windows[i])) ||
                    (this._isMyWindow(windows[i]) && this._isMinimizedWindow(windows[i])) ||
                    this._showWindowAppOnThisWorkspace(windows[i])) {
                    button.actor.visible = true;
                } else {
                    button.actor.visible = false;
                }

                if (this._wsWindowAppsBox) {
                    this._wsWindowAppsBox.add(button.actor, {x_fill: false, x_align: St.Align.START, y_fill: false, y_align: St.Align.END});
                }
                let winInfo = {};
                winInfo.app = app;
                winInfo.metaWin = metaWin;
                winInfo.signalFocusedId = metaWin.connect('notify::appears-focused', Lang.bind(this, this._onWindowChanged, metaWin));
                this._wsWindowApps.push(winInfo);
            }
        }

        // Update window count
        this._updateWindowCount();
    },

    workspaceRemoved: function() {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: workspaceRemoved");
        this.metaWorkspace.disconnect(this._afterWindowAddedId);
        this.metaWorkspace.disconnect(this._afterWindowRemovedId);
        this.parent();
    },

    // function called when the active workspace is changed
    // windows visible on all workspaces are moved to active workspace
    _activeWorkspaceChanged: function() {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _activeWorkspaceChanged");
        let windows = global.get_window_actors();
        let activeWorkspace = global.screen.get_active_workspace();
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _activeWorkspaceChanged - window count = "+windows.length);
        for (let i = 0; i < windows.length; i++) {
            let metaWin = windows[i].get_meta_window();
            if (!metaWin)
                continue;

            if ((this._isMyWindow(windows[i]) && this._isOverviewWindow(windows[i])) ||
                (this._isMyWindow(windows[i]) && this._isMinimizedWindow(windows[i])) ||
                this._showWindowAppOnThisWorkspace(windows[i])) {

                // Show taskbar icon if already present
                let index = -1;
                for (let i = 0; i < this._wsWindowApps.length; i++) {
                    if (this._wsWindowApps[i].metaWin == metaWin) {
                        index = i;
                        if (this._wsWindowAppsBox) {
                            let buttonActor = this._wsWindowAppsBox.get_child_at_index(index);
                            buttonActor.visible = true;
                        }
                        break;
                    }
                }
                if (index > -1)
                    continue;

            } else {
                // Hide taskbar icon
                let index = -1;
                for (let i = 0; i < this._wsWindowApps.length; i++) {
                    if (this._wsWindowApps[i].metaWin == metaWin) {
                        index = i;
                        if (this._wsWindowAppsBox) {
                            let buttonActor = this._wsWindowAppsBox.get_child_at_index(index);
                            buttonActor.visible = false;
                        }
                        break;
                    }
                }
            }
        }

        // Update window count
        this._updateWindowCount();
    },

    _onAfterWindowAdded: function(metaWorkspace, metaWin) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _onAfterWindowAdded");
        this._thumbnailsBox.updateTaskbars(metaWin, WindowAppsUpdateAction.ADD);
    },

    _onAfterWindowRemoved: function(metaWorkspace, metaWin) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _onAfterWindowRemoved - metaWin = "+metaWin.get_wm_class()+" metaWorkspace = "+metaWorkspace.index());
        this._thumbnailsBox.updateTaskbars(metaWin, WindowAppsUpdateAction.REMOVE);
    },

    _onWindowChanged: function(metaWin) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _onWindowChanged - metaWin = "+metaWin.get_wm_class());
        if (!this._wsWindowAppsBox)
            return;

        let index = -1;
        for (let i = 0; i < this._wsWindowApps.length; i++) {
            if (this._wsWindowApps[i].metaWin == metaWin) {
                index = i;
                break;
            }
        }
        if (index > -1) {
            let buttonActor = this._wsWindowAppsBox.get_child_at_index(index);
            if (metaWin.appears_focused) {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _onWindowChanged - button app is focused");
                buttonActor.add_style_class_name('workspacestodock-caption-windowapps-button-active');
            } else {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _onWindowChanged - button app is not focused");
                buttonActor.remove_style_class_name('workspacestodock-caption-windowapps-button-active');
            }
        }
    },

    _onWorkspaceCaptionClick: function(actor, event, thumbnail) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _onWorkspaceCaptionClick");
        if (thumbnail._menu.isOpen) {
            thumbnail._menu.close();
            return true;
        }

        let mouseButton = event.get_button();
        if (mouseButton == 3) {
            thumbnail._menu.removeAll();

            this._windowAppsMenuListBox = new St.BoxLayout({vertical: true});
            for (let i=0; i < thumbnail._wsWindowApps.length; i++) {
                let metaWin = thumbnail._wsWindowApps[i].metaWin;
                let app = thumbnail._wsWindowApps[i].app;
                let item = new WindowAppMenuItem(app, metaWin, thumbnail);
                this._windowAppsMenuListBox.add_actor(item.actor);
            }

            let windowAppsListsection = new PopupMenu.PopupMenuSection();
            windowAppsListsection.actor.add_actor(this._windowAppsMenuListBox);
            if (thumbnail._wsWindowApps.length > 0) {
                this._menu.addMenuItem(windowAppsListsection);
            }

            if (thumbnail._wsWindowApps.length > 1) {
                let item1 = new PopupMenu.PopupMenuItem(_('Close All Applications'));
                item1.connect('activate', Lang.bind(this, this._closeAllMetaWindows, this));
                this._menu.addMenuItem(item1);
            }

            this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            let item2 = new PopupMenu.PopupMenuItem(_("Extension preferences"));
            item2.connect('activate', Lang.bind(this, this._showExtensionPreferences));
            this._menu.addMenuItem(item2);

            thumbnail._menu.open();
            return true;
        }
        return false;
    },

    activateMetaWindow: function(actor, event, thumbnail, metaWin) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: activateMetaWindow");
        let mouseButton = event.get_button();
        if (mouseButton == 1) {
            if (actor._delegate instanceof WindowAppIcon && thumbnail._menu.isOpen) {
                thumbnail._menu.close();
            }
            let activeWorkspace = global.screen.get_active_workspace();
            if (_DEBUG_) global.log("_myWorkspaceThumbnail: activateMetaWindow - activeWorkspace = "+activeWorkspace);
            if (_DEBUG_) global.log("_myWorkspaceThumbnail: activateMetaWindow - metaWorkspace = "+thumbnail.metaWorkspace);
            if (activeWorkspace != thumbnail.metaWorkspace) {
                if (_DEBUG_) global.log("_myWorkspaceThumbnail: activateMetaWindow - activeWorkspace is not metaWorkspace");
                thumbnail.activate(event.get_time());
                metaWin.activate(global.get_current_time());
            } else {
                if (!metaWin.has_focus()) {
                    metaWin.activate(global.get_current_time());
                } else {
                    metaWin.minimize(global.get_current_time());
                }
            }
        }
        return false;
    },

    _showExtensionPreferences: function(menuItem, event) {
        Main.Util.trySpawnCommandLine(PREFS_DIALOG);
    },

    closeMetaWindow: function(actor, event, thumbnail, metaWin) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: closeMetaWindow");
        let metaWindow = metaWin;
        for (let i = 0; i < thumbnail._wsWindowApps.length; i++) {
            if (thumbnail._wsWindowApps[i].metaWin == metaWindow) {
                // Delete metaWindow
                metaWindow.delete(global.get_current_time());
            }
        }
    },

    _closeAllMetaWindows: function(menuItem, event, thumbnail) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _closeAllMetaWindows");
        for (let i = 0; i < thumbnail._wsWindowApps.length; i++) {
            // Delete metaWindow
            thumbnail._wsWindowApps[i].metaWin.delete(global.get_current_time());

            // NOTE: bug quiting all GIMP windows
            // even tried thumbnail._wsWindowApps[i].app.request_quit();
            // Gnome Shell has same issue .. selecting quit from panel app menu only closes current Gimp window
            // Unity has same issue .. https://bugs.launchpad.net/ubuntu/+source/unity/+bug/1123593
        }
    },

    _updateWindowApps: function(metaWin, action) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _updateWindowApps");
        if (action == WindowAppsUpdateAction.ADD) {
            let index = -1;
            for (let i = 0; i < this._wsWindowApps.length; i++) {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _updateWindowApps - window button at index "+i+" is "+this._wsWindowApps[i]);
                if (this._wsWindowApps[i].metaWin == metaWin) {
                    if (_DEBUG_) global.log("myWorkspaceThumbnail: _updateWindowApps - window button found at index = "+i);
                    index = i;
                    if (this._wsWindowAppsBox) {
                        let buttonActor = this._wsWindowAppsBox.get_child_at_index(index);
                        if ((this._isMyWindow(metaWin, true) && this._isOverviewWindow(metaWin, true)) ||
                            (this._isMyWindow(metaWin, true) && this._isMinimizedWindow(metaWin, true)) ||
                            this._showWindowAppOnThisWorkspace(metaWin, true)) {
                            buttonActor.visible = true;
                        } else {
                            buttonActor.visible = false;
                        }
                    }
                    break;
                }
            }
            if (index < 0) {
                let tracker = Shell.WindowTracker.get_default();
                if (!metaWin.skip_taskbar) {

                    if (_DEBUG_) global.log("myWorkspaceThumbnail: _updateWindowApps - window button not found .. add it");
                    let app = tracker.get_window_app(metaWin);
                    if (app) {
                        if (_DEBUG_) global.log("myWorkspaceThumbnail: _updateWindowApps - window button app = "+app.get_name());
                        let button = new WindowAppIcon(app, metaWin, this);
                        if (metaWin.has_focus()) {
                            button.actor.add_style_class_name('workspacestodock-caption-windowapps-button-active');
                        }

                        if ((this._isMyWindow(metaWin, true) && this._isOverviewWindow(metaWin, true)) ||
                            (this._isMyWindow(metaWin, true) && this._isMinimizedWindow(metaWin, true)) ||
                            this._showWindowAppOnThisWorkspace(metaWin, true)) {
                            button.actor.visible = true;
                        } else {
                            button.actor.visible = false;
                        }

                        if (this._wsWindowAppsBox)
                            this._wsWindowAppsBox.add(button.actor, {x_fill: false, x_align: St.Align.START, y_fill: false, y_align: St.Align.END});

                        let winInfo = {};
                        winInfo.app = app;
                        winInfo.metaWin = metaWin;
                        winInfo.signalFocusedId = metaWin.connect('notify::appears-focused', Lang.bind(this, this._onWindowChanged, metaWin));
                        this._wsWindowApps.push(winInfo);
                    }
                }
            }
        } else if (action == WindowAppsUpdateAction.REMOVE) {
            if (_DEBUG_) global.log("myWorkspaceThumbnail: _updateWindowApps - wsWindowApps exists");
            if (metaWin.minimized) {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _updateWindowApps - metaWin minimized = "+metaWin.get_wm_class());
                // Don't remove minimized windows
            } else {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _updateWindowApps - metaWin closed = "+metaWin.get_wm_class());
                let index = -1;
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _updateWindowApps - window buttons count = "+this._wsWindowApps.length);
                for (let i = 0; i < this._wsWindowApps.length; i++) {
                    if (_DEBUG_) global.log("myWorkspaceThumbnail: _updateWindowApps - window button at index "+i+" is "+this._wsWindowApps[i].metaWin.get_wm_class());
                    if (this._wsWindowApps[i].metaWin == metaWin) {
                        if (_DEBUG_) global.log("myWorkspaceThumbnail: _updateWindowApps - window button found at index = "+i);
                        index = i;
                        break;
                    }
                }
                if (index > -1) {
                    if (_DEBUG_) global.log("myWorkspaceThumbnail: _updateWindowApps - Splicing wsWindowAppsButtons at "+index);
                    // Disconnect window focused signal
                    metaWin.disconnect(this._wsWindowApps[index].signalFocusedId);

                    // Remove button from windowApps list and windowAppsBox container
                    this._wsWindowApps.splice(index, 1);
                    if (this._wsWindowAppsBox) {
                        let buttonActor = this._wsWindowAppsBox.get_child_at_index(index);
                        if (_DEBUG_) global.log("myWorkspaceThumbnail: _updateWindowApps - Removing button at index "+index);
                        this._wsWindowAppsBox.remove_actor(buttonActor);
                        buttonActor.destroy();
                    }

                    // Remove menuItem
                    if (this._windowAppsMenuListBox) {
                        let menuItemActor = this._windowAppsMenuListBox.get_child_at_index(index);
                        if (menuItemActor) {
                            this._windowAppsMenuListBox.remove_actor(menuItemActor);
                            menuItemActor.destroy();
                        }
                    }

                }
            }
        }

        // Update window count
        this._updateWindowCount();
    },

    _updateWindowCount: function() {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _updateWindowCount");
        if (!this._wsWindowCountBox)
            return;

        let className = "";
        let win_count = this._wsWindowApps.length;
        let win_max = 4;

        if (!this._mySettings.get_boolean('workspace-caption-windowcount-image')) {
            // clear box images
            for(let i = 1; i <= win_max; i++){
                let className = 'workspacestodock-caption-windowcount-image-'+i;
                this._wsWindowCountBox.remove_style_class_name(className);
            }

            // Set label text
            if (win_count > 0) {
                this._wsWindowCount.set_text(""+win_count);
            } else {
                this._wsWindowCount.set_text("");
            }

        } else {
            // clear label text
            this._wsWindowCount.set_text("");

            // Set background image class
            if (win_count > win_max)
                win_count = win_max;

            for(let i = 1; i <= win_max; i++){
                let className = 'workspacestodock-caption-windowcount-image-'+i;
                if (i != win_count) {
                    this._wsWindowCountBox.remove_style_class_name(className);
                } else {
                    this._wsWindowCountBox.add_style_class_name(className);
                }
            }
        }
    },

    setWindowClonesReactiveState: function (state) {
        if (state == null)
            return;

        for (let i = 0; i < this._windows.length; i++) {
            let clone = this._windows[i];
            clone.actor.reactive = state;
        }
    }

});


const myThumbnailsBox = new Lang.Class({
    Name: 'workspacesToDock.myThumbnailsBox',
    Extends: WorkspaceThumbnail.ThumbnailsBox,

    _init: function(dock) {
        this._dock = dock;
        this._gsCurrentVersion = dock._gsCurrentVersion;
        this._mySettings = dock._settings;

        // override _init to remove create/destroy thumbnails when showing/hiding overview
        this.actor = new Shell.GenericContainer({ reactive: true,
                                                  style_class: 'workspace-thumbnails',
                                                  request_mode: Clutter.RequestMode.WIDTH_FOR_HEIGHT });
        this.actor.connect('get-preferred-width', Lang.bind(this, this._getPreferredWidth));
        this.actor.connect('get-preferred-height', Lang.bind(this, this._getPreferredHeight));
        this.actor.connect('allocate', Lang.bind(this, this._allocate));
        this.actor._delegate = this;

        if (this._gsCurrentVersion[1] == 10 && this._gsCurrentVersion[2] && this._gsCurrentVersion[2] == 0) {
            // When we animate the scale, we don't animate the requested size of the thumbnails, rather
            // we ask for our final size and then animate within that size. This slightly simplifies the
            // interaction with the main workspace windows (instead of constantly reallocating them
            // to a new size, they get a new size once, then use the standard window animation code
            // allocate the windows to their new positions), however it causes problems for drawing
            // the background and border wrapped around the thumbnail as we animate - we can't just pack
            // the container into a box and set style properties on the box since that box would wrap
            // around the final size not the animating size. So instead we fake the background with
            // an actor underneath the content and adjust the allocation of our children to leave space
            // for the border and padding of the background actor.
            this._background = new St.Bin({ style_class: 'workspace-thumbnails-background' });

            this.actor.add_actor(this._background);

            // Add addtional style class when workspace is fixed and set to full height
            if (this._mySettings.get_boolean('dock-fixed') && this._mySettings.get_boolean('extend-height') && this._mySettings.get_double('top-margin') == 0) {
                this._background.add_style_class_name('workspace-thumbnails-fullheight');
            }
        } else {
            // Add addtional style class when workspace is fixed and set to full height
            if (this._mySettings.get_boolean('dock-fixed') && this._mySettings.get_boolean('extend-height') && this._mySettings.get_double('top-margin') == 0) {
                this.actor.add_style_class_name('workspace-thumbnails-fullheight');
            }
        }

        let indicator = new St.Bin({ style_class: 'workspace-thumbnail-indicator' });

        // We don't want the indicator to affect drag-and-drop
        Shell.util_set_hidden_from_pick(indicator, true);

        this._indicator = indicator;
        this.actor.add_actor(indicator);

        this._dropWorkspace = -1;
        this._dropPlaceholderPos = -1;
        this._dropPlaceholder = new St.Bin({ style_class: 'placeholder' });
        this.actor.add_actor(this._dropPlaceholder);
        this._spliceIndex = -1;

        this._targetScale = 0;
        this._scale = 0;
        this._pendingScaleUpdate = false;
        this._stateUpdateQueued = false;
        this._animatingIndicator = false;
        this._indicatorY = 0; // only used when _animatingIndicator is true

        this._stateCounts = {};
        for (let key in ThumbnailState)
            this._stateCounts[ThumbnailState[key]] = 0;

        this._thumbnails = [];

        this.actor.connect('button-press-event', function() { return true; });
        this.actor.connect('button-release-event', Lang.bind(this, this._onButtonRelease));

        //Main.overview.connect('showing',
        //                      Lang.bind(this, this._createThumbnails));
        //Main.overview.connect('hidden',
        //                      Lang.bind(this, this._destroyThumbnails));

        Main.overview.connect('item-drag-begin',
                              Lang.bind(this, this._onDragBegin));
        Main.overview.connect('item-drag-end',
                              Lang.bind(this, this._onDragEnd));
        Main.overview.connect('item-drag-cancelled',
                              Lang.bind(this, this._onDragCancelled));
        Main.overview.connect('window-drag-begin',
                              Lang.bind(this, this._onDragBegin));
        Main.overview.connect('window-drag-end',
                              Lang.bind(this, this._onDragEnd));
        Main.overview.connect('window-drag-cancelled',
                              Lang.bind(this, this._onDragCancelled));

        this._settings = new Gio.Settings({ schema: OVERRIDE_SCHEMA });
        this._settings.connect('changed::dynamic-workspaces',
            Lang.bind(this, this._updateSwitcherVisibility));
    },

    // override _createThumbnails to remove global n-workspaces notification
    _createThumbnails: function() {
        if (_DEBUG_) global.log("mythumbnailsBox: _createThumbnails");
        this._switchWorkspaceNotifyId =
            global.window_manager.connect('switch-workspace',
                                          Lang.bind(this, this._activeWorkspaceChanged));
        //this._nWorkspacesNotifyId =
            //global.screen.connect('notify::n-workspaces',
                                  //Lang.bind(this, this._workspacesChanged));
        this._syncStackingId =
            Main.overview.connect('windows-restacked',
                                  Lang.bind(this, this._syncStacking));

        this._targetScale = 0;
        this._scale = 0;
        this._pendingScaleUpdate = false;
        this._stateUpdateQueued = false;

        this._stateCounts = {};
        for (let key in ThumbnailState)
            this._stateCounts[ThumbnailState[key]] = 0;

        // The "porthole" is the portion of the screen that we show in the workspaces
        this._porthole = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        if (_DEBUG_) global.log("myThumbanailsBox: _createThumbnails - portholeH = "+this._porthole.height+" portholeW = "+this._porthole.width+" portholeX = "+this._porthole.x+" porholeY = "+this._porthole.y);

        this.addThumbnails(0, global.screen.n_workspaces);

        this._updateSwitcherVisibility();
    },

    refreshThumbnails: function() {
        if (_DEBUG_) global.log("mythumbnailsBox: refreshThumbnails");
        for (let i = 0; i < this._thumbnails.length; i++) {
            this._thumbnails[i].refreshWindowClones();
            this._thumbnails[i]._activeWorkspaceChanged();
        }
    },

    // override _onButtonRelease to provide customized click actions (i.e. overview on right click)
    _onButtonRelease: function(actor, event) {
        if (_DEBUG_) global.log("mythumbnailsBox: _onButtonRelease");
        // ThumbnailsBox click events are passed on to dock handler if conditions are met
        // Helpful in cases where the 'dock-edge-visible' option is enabled. It provides more
        // area to click on to show the dock when the window is maximized.
        // Skip if 'dock-edge-visible' && 'require-click-to-show' are not enabled
        if (this._mySettings.get_boolean('dock-edge-visible') && this._mySettings.get_boolean('require-click-to-show')) {
            // Skip if window is not maximized (_hovering only true if window is maximized)
            if (this._dock._hovering) {
                // Skip if dock is not in autohide mode for instance because it is shown by intellihide
                if (this._mySettings.get_boolean('autohide') && this._dock._autohideStatus) {
                    if (this._dock.actor.hover) {
                        // Skip if dock is showing or shown
                        if (this._dock._animStatus.hidden() || this._dock._animStatus.hiding()) {
                            // pass click event on to dock handler
                            return false;
                        }
                    }
                }
            }
        }

        if (this._mySettings.get_boolean('toggle-overview')) {
            let button = event.get_button();
            if (button == 3) { //right click
                if (Main.overview.visible) {
                    Main.overview.hide(); // force normal mode
                } else {
                    Main.overview.show(); // force overview mode
                }
                // pass right-click event on allowing it to bubble up
                return false;
            }
        }

        let [stageX, stageY] = event.get_coords();
        let [r, x, y] = this.actor.transform_stage_point(stageX, stageY);

        for (let i = 0; i < this._thumbnails.length; i++) {
            let thumbnail = this._thumbnails[i]
            let [w, h] = thumbnail.actor.get_transformed_size();
            if (y >= thumbnail.actor.y && y <= thumbnail.actor.y + h) {
                //thumbnail.activate(event.time);
                thumbnail.activate(event.get_time());
                break;
            }
        }
        return true;

    },

    // override addThumbnails to provide workspace thumbnail labels
    addThumbnails: function(start, count) {
        if (_DEBUG_) global.log("mythumbnailsBox: addThumbnails");
        for (let k = start; k < start + count; k++) {
            let metaWorkspace = global.screen.get_workspace_by_index(k);
            let thumbnail = new myWorkspaceThumbnail(metaWorkspace, this);
            thumbnail.setPorthole(this._porthole.x, this._porthole.y,
                                  this._porthole.width, this._porthole.height);

            this._thumbnails.push(thumbnail);
            this.actor.add_actor(thumbnail.actor);

            if (start > 0 && this._spliceIndex == -1) {
                // not the initial fill, and not splicing via DND
                thumbnail.state = ThumbnailState.NEW;
                thumbnail.slidePosition = 1; // start slid out
                this._haveNewThumbnails = true;
            } else {
                thumbnail.state = ThumbnailState.NORMAL;
            }

            this._stateCounts[thumbnail.state]++;
        }

        this._queueUpdateStates();

        // The thumbnails indicator actually needs to be on top of the thumbnails
        this._indicator.raise_top();

        // Clear the splice index, we got the message
        this._spliceIndex = -1;
    },

    updateTaskbars: function(metaWin, action) {
        if (_DEBUG_) global.log("mythumbnailsBox: updateTaskbars");
        for (let i = 0; i < this._thumbnails.length; i++) {
            this._thumbnails[i]._updateWindowApps(metaWin, action);
        }
    },

    setPopupMenuFlag: function(showing) {
        if (_DEBUG_) global.log("mythumbnailsBox: setPopupMenuFlag");
        this._dock.setPopupMenuFlag(showing);
    },

    _updateThumbnailCaption: function(thumbnail, i, captionHeight, captionBackgroundHeight) {
        let unscale = 1/this._scale;
        let containerWidth = this._porthole.width * this._scale;
        let containerHeight = this._porthole.height * this._scale;

        if (!thumbnail._wsCaptionBackground)
            return;

        thumbnail._wsCaptionBackground.set_scale(unscale, unscale);
        thumbnail._wsCaptionBackground.set_position(0, this._porthole.height);
        thumbnail._wsCaptionBackground.set_size(containerWidth, captionBackgroundHeight);

        if (!thumbnail._wsCaptionContainer)
            return;

        thumbnail._wsCaptionContainer.set_scale(unscale, unscale);
        thumbnail._wsCaptionContainer.set_size(containerWidth, containerHeight + captionBackgroundHeight);


        if (!thumbnail._wsCaption)
            return;

        thumbnail._wsCaption.height = captionHeight; // constrains height to caption height

        if (thumbnail._wsNumber)
            thumbnail._wsNumber.set_text(""+(i+1));

        if (thumbnail._wsNumberBox)
            thumbnail._wsNumberBox.height = captionBackgroundHeight - 2;

        if (thumbnail._wsName)
            thumbnail._wsName.set_text(Meta.prefs_get_workspace_name(i));

        if (thumbnail._wsNameBox)
            thumbnail._wsNameBox.height = captionBackgroundHeight - 2;

        if (thumbnail._wsWindowCountBox)
            thumbnail._wsWindowCountBox.height = captionBackgroundHeight - 2;

        if (thumbnail._wsWindowAppsBox)
            thumbnail._wsWindowAppsBox.height = captionHeight;


        if (i == global.screen.get_active_workspace_index()) {
            if (thumbnail._wsCaptionBackground) thumbnail._wsCaptionBackground.add_style_class_name('workspacestodock-workspace-caption-background-current');
            if (thumbnail._wsCaption) thumbnail._wsCaption.add_style_class_name('workspacestodock-workspace-caption-current');
            if (thumbnail._wsNumberBox) thumbnail._wsNumberBox.add_style_class_name('workspacestodock-caption-number-current');
            if (thumbnail._wsNameBox) thumbnail._wsNameBox.add_style_class_name('workspacestodock-caption-name-current');
            if (thumbnail._wsWindowCountBox) {
                if (this._mySettings.get_boolean('workspace-caption-windowcount-image')) {
                    thumbnail._wsWindowCountBox.add_style_class_name('workspacestodock-caption-windowcount-image-current');
                } else {
                    thumbnail._wsWindowCountBox.add_style_class_name('workspacestodock-caption-windowcount-current');
                }
            }
            if (thumbnail._wsSpacerBox) thumbnail._wsSpacerBox.add_style_class_name('workspacestodock-caption-spacer-current');
        } else {
            if (thumbnail._wsCaptionBackground) thumbnail._wsCaptionBackground.remove_style_class_name('workspacestodock-workspace-caption-background-current');
            if (thumbnail._wsCaption) thumbnail._wsCaption.remove_style_class_name('workspacestodock-workspace-caption-current');
            if (thumbnail._wsNumberBox) thumbnail._wsNumberBox.remove_style_class_name('workspacestodock-caption-number-current');
            if (thumbnail._wsNameBox) thumbnail._wsNameBox.remove_style_class_name('workspacestodock-caption-name-current');
            if (thumbnail._wsWindowCountBox) {
                if (this._mySettings.get_boolean('workspace-caption-windowcount-image')) {
                    thumbnail._wsWindowCountBox.remove_style_class_name('workspacestodock-caption-windowcount-image-current');
                } else {
                    thumbnail._wsWindowCountBox.remove_style_class_name('workspacestodock-caption-windowcount-current');
                }
            }
            if (thumbnail._wsSpacerBox) thumbnail._wsSpacerBox.remove_style_class_name('workspacestodock-caption-spacer-current');
        }

    },

    _getPreferredHeight: function(actor, forWidth, alloc) {
        // Note that for getPreferredWidth/Height we cheat a bit and skip propagating
        // the size request to our children because we know how big they are and know
        // that the actors aren't depending on the virtual functions being called.

        if (this._thumbnails.length == 0)
            return;

        let themeNode;
        if (this._gsCurrentVersion[1] == 10 && this._gsCurrentVersion[2] && this._gsCurrentVersion[2] == 0) {
            // See comment about this._background in _init()
            themeNode = this._background.get_theme_node();
        } else {
            themeNode = this.actor.get_theme_node();
        }

        let spacing = themeNode.get_length('spacing');

        // passingthru67 - make room for thumbnail captions
        let captionBackgroundHeight = 0;
        if (this._mySettings.get_boolean('workspace-captions')) {
            captionBackgroundHeight = CAPTION_BACKGROUND_HEIGHT;
        }
        spacing = spacing + captionBackgroundHeight;

        let nWorkspaces = global.screen.n_workspaces;

        // passingthru67 - add 5px to totalSpacing calculation
        // otherwise scale doesn't kick in soon enough and total thumbnails height is greater than height of dock
        // why is 5px needed? spacing was already adjusted in gnome-shell.css from 7px to 27px (GS36 11px to ?)
        // does it have anything to do with a border added by St.Bin in WorkspaceThumbnails _background?
        //let totalSpacing = (nWorkspaces - 1) * spacing;
        let totalSpacing;
        if (this._mySettings.get_boolean('workspace-captions')) {
            totalSpacing = (nWorkspaces - 1) * (spacing + 5);
        } else {
            totalSpacing = (nWorkspaces - 1) * spacing;
        }

        let maxScale;
        if (this._mySettings.get_boolean('customize-thumbnail')) {
            maxScale = this._mySettings.get_double('thumbnail-size');
        } else {
            maxScale = MAX_THUMBNAIL_SCALE;
        }

        if (this._gsCurrentVersion[1] == 10 && this._gsCurrentVersion[2] && this._gsCurrentVersion[2] == 0) {
            [alloc.min_size, alloc.natural_size] =
                themeNode.adjust_preferred_height(totalSpacing,
                                                  totalSpacing + nWorkspaces * this._porthole.height * maxScale);
        } else {
            alloc.min_size = totalSpacing;
            alloc.natural_size = totalSpacing + nWorkspaces * this._porthole.height * maxScale;
        }
    },

    _getPreferredWidth: function(actor, forHeight, alloc) {
        if (this._thumbnails.length == 0)
            return;

        let themeNode;
        if (this._gsCurrentVersion[1] == 10 && this._gsCurrentVersion[2] && this._gsCurrentVersion[2] == 0) {
            // See comment about this._background in _init()
            themeNode = this._background.get_theme_node();
        } else {
            themeNode = this.actor.get_theme_node();
        }

        let spacing = this.actor.get_theme_node().get_length('spacing');

        // passingthru67 - make room for thumbnail captions
        let captionBackgroundHeight = 0;
        if (this._mySettings.get_boolean('workspace-captions')) {
            captionBackgroundHeight = CAPTION_BACKGROUND_HEIGHT;
        }
        spacing = spacing + captionBackgroundHeight;

        let nWorkspaces = global.screen.n_workspaces;

        // passingthru67 - add 5px to totalSpacing calculation
        // otherwise scale doesn't kick in soon enough and total thumbnails height is greater than height of dock
        // why is 5px needed? spacing was already adjusted in gnome-shell.css from 7px to 27px (GS36 11px to ?)
        // does it have anything to do with a border added by St.Bin in WorkspaceThumbnails _background?
        //let totalSpacing = (nWorkspaces - 1) * spacing;
        let totalSpacing;
        if (this._mySettings.get_boolean('workspace-captions')) {
            totalSpacing = (nWorkspaces - 1) * (spacing + 5);
        } else {
            totalSpacing = (nWorkspaces - 1) * spacing;
        }

        let avail = forHeight - totalSpacing;

        let scale = (avail / nWorkspaces) / this._porthole.height;
        if (this._mySettings.get_boolean('customize-thumbnail')) {
            scale = Math.min(scale, this._mySettings.get_double('thumbnail-size'));
        } else {
            scale = Math.min(scale, MAX_THUMBNAIL_SCALE);
        }

        let width = Math.round(this._porthole.width * scale);
        if (this._gsCurrentVersion[1] == 10 && this._gsCurrentVersion[2] && this._gsCurrentVersion[2] == 0) {
            [alloc.min_size, alloc.natural_size] =
                themeNode.adjust_preferred_width(width, width);
        } else {
            alloc.min_size = width;
            alloc.natural_size = width;
        }
    },

    _checkWindowsOnAllWorkspaces: function(thumbnail) {
        let refresh = false;
        if (_DEBUG_ && thumbnail._windows.length > 0) global.log("myWorkspaceThumbnail: _checkWindowsOnAllWorkspaces - windowsOnAllWorkspaces.length = "+thumbnail._windowsOnAllWorkspaces.length);
        for (let i = 0; i < thumbnail._windows.length; i++) {
            let clone = thumbnail._windows[i];
            let realWindow = clone.realWindow;
            let metaWindow = clone.metaWindow;
            let alreadyPushed = false;
            for (let j = 0; j < thumbnail._windowsOnAllWorkspaces.length; j++) {
                if (metaWindow == thumbnail._windowsOnAllWorkspaces[j]) {
                    alreadyPushed = true;
                    if (!metaWindow.is_on_all_workspaces()) {
                        if (_DEBUG_) global.log("myWorkspaceThumbnail: _checkWindowsOnAllWorkspaces - REFRESH THUMBNAILS - window removed from windowsOnAllWorkspaces");
                        thumbnail._windowsOnAllWorkspaces.splice(j, 1);
                        refresh = true;
                    }
                }
            }
            if (_DEBUG_ && alreadyPushed) global.log("myWorkspaceThumbnail: _checkWindowsOnAllWorkspaces - "+metaWindow.get_wm_class()+" in windowsOnAllWorkspaces. isMyWindow = "+ thumbnail._isMyWindow(realWindow)+", is_on_all_workspaces = "+metaWindow.is_on_all_workspaces());
            if (_DEBUG_ && !alreadyPushed) global.log("myWorkspaceThumbnail: _checkWindowsOnAllWorkspaces - "+metaWindow.get_wm_class()+" not in windowsOnAllWorkspaces. isMyWindow = "+ thumbnail._isMyWindow(realWindow)+", is_on_all_workspaces = "+metaWindow.is_on_all_workspaces());
            if (!alreadyPushed && metaWindow.is_on_all_workspaces()) {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _checkWindowsOnAllWorkspaces - REFRESH THUMBNAILS - window added to windowsOnAllWorkspaces");
                thumbnail._windowsOnAllWorkspaces.push(metaWindow);
                refresh = true;
            }
        }
        return refresh;
    },

    // override _allocate to provide area for workspaceThumbnail captions
    // also serves to update caption items
    _allocate: function(actor, box, flags) {
        let rtl = (Clutter.get_default_text_direction () == Clutter.TextDirection.RTL);

        if (this._thumbnails.length == 0) // not visible
            return;

        let themeNode, contentBox;
        if (this._gsCurrentVersion[1] == 10 && this._gsCurrentVersion[2] && this._gsCurrentVersion[2] == 0) {
            // See comment about this._background in _init()
            themeNode = this._background.get_theme_node();
            contentBox = themeNode.get_content_box(box);
        } else {
            themeNode = this.actor.get_theme_node();
        }

        let portholeWidth = this._porthole.width;
        let portholeHeight = this._porthole.height;

        let spacing;
        if (this._gsCurrentVersion[1] == 10 && this._gsCurrentVersion[2] && this._gsCurrentVersion[2] == 0) {
            spacing = this.actor.get_theme_node().get_length('spacing');
        } else {
            spacing = themeNode.get_length('spacing');
        }

        // passingthru67 - Caption area below thumbnail used to display thumbnail labels
        let captionHeight = 0;
        let captionBackgroundHeight = 0;
        if (this._mySettings.get_boolean('workspace-captions')) {
            captionHeight = CAPTION_HEIGHT;
            captionBackgroundHeight = CAPTION_BACKGROUND_HEIGHT;
        }

        spacing = spacing + captionBackgroundHeight;

        // Compute the scale we'll need once everything is updated
        let nWorkspaces = global.screen.n_workspaces;

        // passingthru67 - add 5px to totalSpacing calculation
        // otherwise newScale doesn't kick in soon enough and total thumbnails height is greater than height of dock
        // why is 5px needed? spacing was already adjusted in gnome-shell.css from 7px to 27px (GS36 11px to ?)
        // does it have anything to do with a border added by St.Bin in WorkspaceThumbnails _background?
        //let totalSpacing = (nWorkspaces - 1) * spacing;
        let totalSpacing;
        if (this._mySettings.get_boolean('workspace-captions')) {
            totalSpacing = (nWorkspaces - 1) * (spacing + 5);
        } else {
            totalSpacing = (nWorkspaces - 1) * spacing;
        }

        let avail;
        if (this._gsCurrentVersion[1] == 10 && this._gsCurrentVersion[2] && this._gsCurrentVersion[2] == 0) {
            avail = (contentBox.y2 - contentBox.y1) - totalSpacing;
        } else {
            avail = (box.y2 - box.y1) - totalSpacing;
        }

        let newScale = (avail / nWorkspaces) / portholeHeight;
        if (this._mySettings.get_boolean('customize-thumbnail')) {
            newScale = Math.min(newScale, this._mySettings.get_double('thumbnail-size'));
        } else {
            newScale = Math.min(newScale, MAX_THUMBNAIL_SCALE);
        }
        if (_DEBUG_) global.log("mythumbnailsBox: _allocate - newScale = "+newScale+" targetScale = "+this._targetScale);
        if (newScale != this._targetScale) {
            if (this._targetScale > 0) {
                // We don't do the tween immediately because we need to observe the ordering
                // in queueUpdateStates - if workspaces have been removed we need to slide them
                // out as the first thing.
                this._targetScale = newScale;
                this._pendingScaleUpdate = true;
            } else {
                this._targetScale = this._scale = newScale;
            }

            this._queueUpdateStates();
        }

        let thumbnailHeight = portholeHeight * this._scale;
        let thumbnailWidth = Math.round(portholeWidth * this._scale);
        let roundedHScale = thumbnailWidth / portholeWidth;
        if (_DEBUG_) global.log("mythumbnailsBox: _allocate - thumbnailH = "+thumbnailHeight+" thumbnailW = "+thumbnailWidth);

        let slideOffset; // X offset when thumbnail is fully slid offscreen
        if (rtl)
            slideOffset = - (thumbnailWidth + themeNode.get_padding(St.Side.LEFT));
        else
            slideOffset = thumbnailWidth + themeNode.get_padding(St.Side.RIGHT);

        let childBox = new Clutter.ActorBox();

        if (this._gsCurrentVersion[1] == 10 && this._gsCurrentVersion[2] && this._gsCurrentVersion[2] == 0) {
            // The background is horizontally restricted to correspond to the current thumbnail size
            // but otherwise covers the entire allocation
            if (rtl) {
                childBox.x1 = box.x1;
                childBox.x2 = box.x2 - ((contentBox.x2 - contentBox.x1) - thumbnailWidth);
            } else {
                childBox.x1 = box.x1 + ((contentBox.x2 - contentBox.x1) - thumbnailWidth);
                childBox.x2 = box.x2;
            }
            childBox.y1 = box.y1;
            childBox.y2 = box.y2;
            this._background.allocate(childBox, flags);
        }

        let indicatorY1 = this._indicatorY;
        let indicatorY2;
        // when not animating, the workspace position overrides this._indicatorY
        let indicatorWorkspace = !this._animatingIndicator ? global.screen.get_active_workspace() : null;
        let indicatorThemeNode = this._indicator.get_theme_node();

        let indicatorTopFullBorder = indicatorThemeNode.get_padding(St.Side.TOP) + indicatorThemeNode.get_border_width(St.Side.TOP);
        let indicatorBottomFullBorder = indicatorThemeNode.get_padding(St.Side.BOTTOM) + indicatorThemeNode.get_border_width(St.Side.BOTTOM);
        let indicatorLeftFullBorder = indicatorThemeNode.get_padding(St.Side.LEFT) + indicatorThemeNode.get_border_width(St.Side.LEFT);
        let indicatorRightFullBorder = indicatorThemeNode.get_padding(St.Side.RIGHT) + indicatorThemeNode.get_border_width(St.Side.RIGHT);

        let y;
        if (this._gsCurrentVersion[1] == 10 && this._gsCurrentVersion[2] && this._gsCurrentVersion[2] == 0) {
            y = contentBox.y1;
        } else {
            y = box.y1;
        }

        if (this._dropPlaceholderPos == -1) {
            Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this, function() {
                this._dropPlaceholder.hide();
            }));
        }

        // Passingthru67 - GS 3.10.1 moved this here but already defined above
        //let childBox = new Clutter.ActorBox();

        for (let i = 0; i < this._thumbnails.length; i++) {
            let thumbnail = this._thumbnails[i];

            if (i > 0)
                y += spacing - Math.round(thumbnail.collapseFraction * spacing);

            let x1, x2;
            if (this._gsCurrentVersion[1] == 10 && this._gsCurrentVersion[2] && this._gsCurrentVersion[2] == 0) {
                if (rtl) {
                    x1 = contentBox.x1 + slideOffset * thumbnail.slidePosition;
                    x2 = x1 + thumbnailWidth;
                } else {
                    x1 = contentBox.x2 - thumbnailWidth + slideOffset * thumbnail.slidePosition;
                    x2 = x1 + thumbnailWidth;
                }
            } else {
                if (rtl) {
                    x1 = box.x1 + slideOffset * thumbnail.slidePosition;
                    x2 = x1 + thumbnailWidth;
                } else {
                    x1 = box.x2 - thumbnailWidth + slideOffset * thumbnail.slidePosition;
                    x2 = x1 + thumbnailWidth;
                }
            }

            if (i == this._dropPlaceholderPos) {
                let [minHeight, placeholderHeight] = this._dropPlaceholder.get_preferred_height(-1);
                childBox.x1 = x1;
                childBox.x2 = x1 + thumbnailWidth;
                childBox.y1 = Math.round(y);
                childBox.y2 = Math.round(y + placeholderHeight);
                this._dropPlaceholder.allocate(childBox, flags);
                Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this, function() {
                    this._dropPlaceholder.show();
                }));
                y += placeholderHeight + spacing;
            }

            // We might end up with thumbnailHeight being something like 99.33
            // pixels. To make this work and not end up with a gap at the bottom,
            // we need some thumbnails to be 99 pixels and some 100 pixels height;
            // we compute an actual scale separately for each thumbnail.
            let y1 = Math.round(y);
            let y2 = Math.round(y + thumbnailHeight);
            let roundedVScale = (y2 - y1) / portholeHeight;

            if (thumbnail.metaWorkspace == indicatorWorkspace) {
                indicatorY1 = y1;
                indicatorY2 = y2;

                // passingthru67 - check if window-visible_on_all_workspaces state changed
                // if so, then we need to refresh thumbnails
                let refresh = this._checkWindowsOnAllWorkspaces(thumbnail);
                if (refresh) this.refreshThumbnails();
            }

            // Allocating a scaled actor is funny - x1/y1 correspond to the origin
            // of the actor, but x2/y2 are increased by the *unscaled* size.
            childBox.x1 = x1;
            childBox.x2 = x1 + portholeWidth;
            childBox.y1 = y1;
            // passingthru67 - size needs to include caption area
            //childBox.y2 = y1 + portholeHeight;
            childBox.y2 = y1 + portholeHeight + (captionBackgroundHeight/roundedVScale);

            thumbnail.actor.set_scale(roundedHScale, roundedVScale);
            thumbnail.actor.allocate(childBox, flags);

            // passingthru67 - set WorkspaceThumbnail labels
            if (this._mySettings.get_boolean('workspace-captions'))
                this._updateThumbnailCaption(thumbnail, i, captionHeight, captionBackgroundHeight);

            // We round the collapsing portion so that we don't get thumbnails resizing
            // during an animation due to differences in rounded, but leave the uncollapsed
            // portion unrounded so that non-animating we end up with the right total
            y += thumbnailHeight - Math.round(thumbnailHeight * thumbnail.collapseFraction);
        }

        if (this._gsCurrentVersion[1] == 10 && this._gsCurrentVersion[2] && this._gsCurrentVersion[2] == 0) {
            if (rtl) {
                childBox.x1 = contentBox.x1;
                childBox.x2 = contentBox.x1 + thumbnailWidth;
            } else {
                childBox.x1 = contentBox.x2 - thumbnailWidth;
                childBox.x2 = contentBox.x2;
            }
        } else {
            if (rtl) {
                childBox.x1 = box.x1;
                childBox.x2 = box.x1 + thumbnailWidth;
            } else {
                childBox.x1 = box.x2 - thumbnailWidth;
                childBox.x2 = box.x2;
            }
        }
        childBox.x1 -= indicatorLeftFullBorder;
        childBox.x2 += indicatorRightFullBorder;
        childBox.y1 = indicatorY1 - indicatorTopFullBorder;
        // passingthru67 - indicator needs to include caption
        //childBox.y2 = (indicatorY2 ? indicatorY2 : (indicatorY1 + thumbnailHeight)) + indicatorBottomFullBorder;
        childBox.y2 = (indicatorY2 ? indicatorY2 + captionBackgroundHeight : (indicatorY1 + thumbnailHeight + captionBackgroundHeight)) + indicatorBottomFullBorder;

        this._indicator.allocate(childBox, flags);
    },

    // override _activeWorkspaceChanged to eliminate errors thrown
    _activeWorkspaceChanged: function(wm, from, to, direction) {
        if (_DEBUG_) global.log("mythumbnailsBox: _activeWorkspaceChanged - thumbnail count = "+this._thumbnails.length);
        let thumbnail;
        let activeWorkspace = global.screen.get_active_workspace();
        for (let i = 0; i < this._thumbnails.length; i++) {
            if (this._thumbnails[i].metaWorkspace == activeWorkspace) {
                thumbnail = this._thumbnails[i];
                break;
            }
        }

        // passingthru67 - needed in case thumbnail is null outside of overview
        if (thumbnail == null)
            return

        // passingthru67 - needed in case thumbnail.actor is null outside of overview
        if (thumbnail.actor == null)
            return

        this._animatingIndicator = true;
        let indicatorThemeNode = this._indicator.get_theme_node();
        let indicatorTopFullBorder = indicatorThemeNode.get_padding(St.Side.TOP) + indicatorThemeNode.get_border_width(St.Side.TOP);
        this.indicatorY = this._indicator.allocation.y1 + indicatorTopFullBorder;

        Tweener.addTween(this,
                         { indicatorY: thumbnail.actor.allocation.y1,
                           time: WorkspacesView.WORKSPACE_SWITCH_TIME,
                           transition: 'easeOutQuad',
                           onComplete: function() {
                               this._animatingIndicator = false;
                               this._queueUpdateStates();
                           },
                           onCompleteScope: this
                         });
    }



});
