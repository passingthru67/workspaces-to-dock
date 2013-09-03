/* ========================================================================================================
 * myThumbnailsBox.js - thumbnailsbox object
 * --------------------------------------------------------------------------------------------------------
 *  CREDITS:  Part of this code was copied from the gnome-shell-extensions framework
 *  http://git.gnome.org/browse/gnome-shell-extensions/
  * ========================================================================================================
 */

const _DEBUG_ = false;

const Gio = imports.gi.Gio;
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
        //if (this._gsCurrentVersion[1] > 4) {
            //this.actor.add_style_class_name('app-well-app');
        //}
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
        if (thumbnail._gsCurrentVersion[1] > 4) {
            this._closeButton.add_style_class_name('window-close');
        }
        //this._closeButton.set_size(CAPTION_APP_ICON_MENU_SIZE, CAPTION_APP_ICON_MENU_SIZE);
        //this._closeButton.set_child(this._closeIcon);

        this.actor = new St.BoxLayout({reactive: true, style_class: 'popup-menu-item workspacestodock-caption-windowapps-menu-item'});
        this.actor._delegate = this;

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
        this.parent(metaWorkspace);

        this._thumbnailsBox = thumbnailsBox;
        this._gsCurrentVersion = thumbnailsBox._gsCurrentVersion;
        this._mySettings = thumbnailsBox._mySettings;
        this._wsWindowApps = [];
        this._wsWindowAppsBox = null;
        this._windowAppsMenuListBox = null;

        this._afterWindowAddedId = this.metaWorkspace.connect_after('window-added',
                                                          Lang.bind(this, this._onAfterWindowAdded));
        this._afterWindowRemovedId = this.metaWorkspace.connect_after('window-removed',
                                                           Lang.bind(this, this._onAfterWindowRemoved));

        this._switchWorkspaceNotifyId =
            global.window_manager.connect('switch-workspace',
                                          Lang.bind(this, this._activeWorkspaceChanged));

        this._menuManager = new PopupMenu.PopupMenuManager(this);

        this._initCaption();
        this.actor.connect("realize", Lang.bind(this, this._initWindowApps));
    },

    _onDestroy: function(actor) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _onDestroy");
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

    // function initializes the WorkspaceThumbnails captions
    _initCaption: function() {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _initCaption");
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
                this._menu = new PopupMenu.PopupMenu(this._wsCaptionBackground, 0.5, St.Side.LEFT);
            } else {
                this._menu = new PopupMenu.PopupMenu(this._wsCaptionBackground, 0.5, St.Side.RIGHT);
            }
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
            Main.layoutManager.addChrome(this._menu.actor);
            this._menu.actor.hide();

            // Add menu to menu manager
            this._menuManager.addMenu(this._menu);

            // Connect signals
            this._wsCaption.connect('button-release-event', Lang.bind(this, this._onWorkspaceCaptionClick, this));
        }

    },

    // function initializes the window app icons for the caption taskbar
    _initWindowApps: function() {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _initWindowApps");
        // Create initial buttons for windows on workspace
        let windows = global.get_window_actors();
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _initWindowApps - window count = "+windows.length);
        for (let i = 0; i < windows.length; i++) {
            let metaWin = windows[i].get_meta_window();
            if (!metaWin)
                continue;

            let activeWorkspace = global.screen.get_active_workspace();
            if ((windows[i].get_workspace() == this.metaWorkspace.index()) || (metaWin.is_on_all_workspaces() && this.metaWorkspace == activeWorkspace)) {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _initWindowApps - add window buttons");
                let tracker = Shell.WindowTracker.get_default();
                let app = tracker.get_window_app(metaWin);
                if (app) {
                    if (_DEBUG_) global.log("myWorkspaceThumbnail: _initWindowApps - window button app = "+app.get_name());
                    let button = new WindowAppIcon(app, metaWin, this);
                    if (metaWin.has_focus()) {
                        button.actor.add_style_pseudo_class('active');
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
        let windows = global.get_window_actors().filter(Lang.bind(this, function(actor) {
                let win = actor;
                return (win.get_meta_window() && win.get_meta_window().is_on_all_workspaces());
            }));


        for (let i = 0; i < windows.length; i++) {
            let metaWin = windows[i].get_meta_window();
            if (!metaWin)
                continue;

            let activeWorkspace = global.screen.get_active_workspace();
            if (this.metaWorkspace == activeWorkspace) {
                // Show window on active workspace
                let index = -1;
                for (let i = 0; i < this._wsWindowApps.length; i++) {
                    if (this._wsWindowApps[i].metaWin == metaWin) {
                        index = i;
                        break;
                    }
                }
                if (index > -1)
                    continue;

                let tracker = Shell.WindowTracker.get_default();
                let app = tracker.get_window_app(metaWin);
                if (app) {
                    let button = new WindowAppIcon(app, metaWin, this);
                    if (metaWin.has_focus()) {
                        button.actor.add_style_pseudo_class('active');
                    }

                    if (this._wsWindowAppsBox)
                        this._wsWindowAppsBox.add(button.actor, {x_fill: false, x_align: St.Align.START, y_fill: false, y_align: St.Align.END});

                    let winInfo = {};
                    winInfo.app = app;
                    winInfo.metaWin = metaWin;
                    winInfo.signalFocusedId = metaWin.connect('notify::appears-focused', Lang.bind(this, this._onWindowChanged, metaWin));
                    this._wsWindowApps.push(winInfo);
                }
            } else {
                // Don't show window on active workspace
                let index = -1;
                for (let i = 0; i < this._wsWindowApps.length; i++) {
                    if (this._wsWindowApps[i].metaWin == metaWin) {
                        index = i;
                        break;
                    }
                }
                if (index > -1) {
                    // Disconnect window focused signal
                    metaWin.disconnect(this._wsWindowApps[index].signalFocusedId);

                    // Remove button from windowApps list and windowAppsBox container
                    this._wsWindowApps.splice(index, 1);
                    if (this._wsWindowAppsBox) {
                        let buttonActor = this._wsWindowAppsBox.get_child_at_index(index);
                        this._wsWindowAppsBox.remove_actor(buttonActor);
                        buttonActor.destroy();
                    }
                }
            }
        }

        // Update window count
        this._updateWindowCount();
    },

    _onAfterWindowAdded: function(metaWorkspace, metaWin) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _onAfterWindowAdded");
        this._updateWindowApps(metaWin, WindowAppsUpdateAction.ADD);
    },

    _onAfterWindowRemoved: function(metaWorkspace, metaWin) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _onAfterWindowRemoved - metaWin = "+metaWin.get_wm_class()+" metaWorkspace = "+metaWorkspace.index());
        if (metaWin.is_on_all_workspaces()) {
            if (_DEBUG_) global.log("myWorkspaceThumbnail: _onAfterWindowRemoved - metaWin on all workspaces");
            let activeWorkspace = global.screen.get_active_workspace_index();
            if (activeWorkspace == metaWorkspace.index()) {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _onAfterWindowRemoved - metaWin registered in current active workspace");
                this._updateWindowApps(metaWin, WindowAppsUpdateAction.REMOVE);
            } else {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _onAfterWindowRemoved - metaWin registered elsewhere");
                this._thumbnailsBox.removeWindowApp(metaWin);
            }
        } else {
            this._updateWindowApps(metaWin, WindowAppsUpdateAction.REMOVE);
        }
    },

    _onWindowChanged: function(metaWin) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _onWindowChanged");
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
                buttonActor.add_style_pseudo_class('active');
            } else {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _onWindowChanged - button app is not focused");
                buttonActor.remove_style_pseudo_class('active');
            }
        }
    },

    _onWorkspaceCaptionClick: function(actor, event, thumbnail) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _onWorkspaceCaptionClick");
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
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _onWindowAppsButtonClick");
        let mouseButton = event.get_button();
        if (mouseButton == 1) {
            let activeWorkspace = global.screen.get_active_workspace();
            if (_DEBUG_) global.log("_myWorkspaceThumbnail: _onWindowAppsButtonClick - activeWorkspace = "+activeWorkspace);
            if (_DEBUG_) global.log("_myWorkspaceThumbnail: _onWindowAppsButtonClick - metaWorkspace = "+thumbnail.metaWorkspace);
            if (activeWorkspace != thumbnail.metaWorkspace) {
                if (_DEBUG_) global.log("_myWorkspaceThumbnail: _onWindowAppsButtonClick - activeWorkspace is metaWorkspace");
                thumbnail.activate(event.get_time());
                metaWin.activate(global.get_current_time());
            } else {
                metaWin.activate(global.get_current_time());
                if (!metaWin.has_focus())
                    metaWin.activate(global.get_current_time());
                else
                    metaWin.minimize(global.get_current_time());
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
                    break;
                }
            }
            if (index < 0) {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _updateWindowApps - window button not found .. add it");
                let tracker = Shell.WindowTracker.get_default();
                let app = tracker.get_window_app(metaWin);
                if (app) {
                    if (_DEBUG_) global.log("myWorkspaceThumbnail: _updateWindowApps - window button app = "+app.get_name());
                    let button = new WindowAppIcon(app, metaWin, this);
                    if (metaWin.has_focus()) {
                        button.actor.add_style_pseudo_class('active');
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
    }

});


const myThumbnailsBox = new Lang.Class({
    Name: 'workspacesToDock.myThumbnailsBox',
    Extends: WorkspaceThumbnail.ThumbnailsBox,

    _init: function(dock) {
        this._dock = dock;
        this._gsCurrentVersion = dock._gsCurrentVersion;
        this._mySettings = dock._settings;
        if (this._gsCurrentVersion[1] < 7) {
            this.parent();
        } else {
            // override GS38 _init to remove create/destroy thumbnails when showing/hiding overview
            this.actor = new Shell.GenericContainer({ reactive: true,
                                                      style_class: 'workspace-thumbnails',
                                                      request_mode: Clutter.RequestMode.WIDTH_FOR_HEIGHT });
            this.actor.connect('get-preferred-width', Lang.bind(this, this._getPreferredWidth));
            this.actor.connect('get-preferred-height', Lang.bind(this, this._getPreferredHeight));
            this.actor.connect('allocate', Lang.bind(this, this._allocate));
            this.actor._delegate = this;

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
        }
    },

    // override GS38 _createThumbnails to remove global n-workspaces notification
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

        this.addThumbnails(0, global.screen.n_workspaces);

        this._updateSwitcherVisibility();
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

    removeWindowApp: function(metaWin) {
        if (_DEBUG_) global.log("mythumbnailsBox: removeWindowApp");
        for (let i = 0; i < this._thumbnails.length; i++) {
            let thumbnail = this._thumbnails[i];
            thumbnail._updateWindowApps(metaWin, WindowAppsUpdateAction.REMOVE);
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

    // override _allocate to provide area for workspaceThumbnail captions
    // also serves to update caption items
    _allocate: function(actor, box, flags) {
        let rtl = (Clutter.get_default_text_direction () == Clutter.TextDirection.RTL);

        // See comment about this._background in _init()
        let themeNode = this._background.get_theme_node();
        let contentBox = themeNode.get_content_box(box);

        if (this._thumbnails.length == 0) // not visible
            return;

        let portholeWidth = this._porthole.width;
        let portholeHeight = this._porthole.height;
        let spacing = this.actor.get_theme_node().get_length('spacing');

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
        let totalSpacing = (nWorkspaces - 1) * (spacing + 5);
        let avail = (contentBox.y2 - contentBox.y1) - totalSpacing;

        let newScale = (avail / nWorkspaces) / portholeHeight;
        if (this._mySettings.get_boolean('customize-thumbnail')) {
            newScale = Math.min(newScale, this._mySettings.get_double('thumbnail-size'));
        } else {
            newScale = Math.min(newScale, MAX_THUMBNAIL_SCALE);
        }
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

        let slideOffset; // X offset when thumbnail is fully slid offscreen
        if (rtl)
            slideOffset = - (thumbnailWidth + themeNode.get_padding(St.Side.LEFT));
        else
            slideOffset = thumbnailWidth + themeNode.get_padding(St.Side.RIGHT);

        let childBox = new Clutter.ActorBox();

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

        // passingthru67 - moved here from below
        // when not animating, the workspace position overrides this._indicatorY
        let indicatorWorkspace = !this._animatingIndicator ? global.screen.get_active_workspace() : null;

        // passingthru67 - move here from below
        let y = contentBox.y1;

        // passingthru67 - conditional for gnome shell 3.4/3.6/# differences
        if (this._gsCurrentVersion[1] < 6) {
            let indicatorY = this._indicatorY;
            // when not animating, the workspace position overrides this._indicatorY
            // passingthru67 - moved above
            //let indicatorWorkspace = !this._animatingIndicator ? global.screen.get_active_workspace() : null;

            // passingthru67 - moved above
            //let y = contentBox.y1;

            if (this._dropPlaceholderPos == -1) {
                Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this, function() {
                    this._dropPlaceholder.hide();
                }));
            }

            for (let i = 0; i < this._thumbnails.length; i++) {
                let thumbnail = this._thumbnails[i];

                if (i > 0)
                    y += spacing - Math.round(thumbnail.collapseFraction * spacing);

                let x1, x2;
                if (rtl) {
                    x1 = contentBox.x1 + slideOffset * thumbnail.slidePosition;
                    x2 = x1 + thumbnailWidth;
                } else {
                    x1 = contentBox.x2 - thumbnailWidth + slideOffset * thumbnail.slidePosition;
                    x2 = x1 + thumbnailWidth;
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

                if (thumbnail.metaWorkspace == indicatorWorkspace)
                    indicatorY = y1;


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

            if (rtl) {
                childBox.x1 = contentBox.x1;
                childBox.x2 = contentBox.x1 + thumbnailWidth;
            } else {
                childBox.x1 = contentBox.x2 - thumbnailWidth;
                childBox.x2 = contentBox.x2;
            }
            childBox.y1 = indicatorY;
            // passingthru67 - indicator needs to include caption
            //childBox.y2 = childBox.y1 + thumbnailHeight;
            childBox.y2 = childBox.y1 + thumbnailHeight + captionBackgroundHeight;
            this._indicator.allocate(childBox, flags);

        } else {
            let indicatorY1 = this._indicatorY;
            let indicatorY2;
            // when not animating, the workspace position overrides this._indicatorY
            // passingthru67 - moved above
            //let indicatorWorkspace = !this._animatingIndicator ? global.screen.get_active_workspace() : null;
            let indicatorThemeNode = this._indicator.get_theme_node();

            let indicatorTopFullBorder = indicatorThemeNode.get_padding(St.Side.TOP) + indicatorThemeNode.get_border_width(St.Side.TOP);
            let indicatorBottomFullBorder = indicatorThemeNode.get_padding(St.Side.BOTTOM) + indicatorThemeNode.get_border_width(St.Side.BOTTOM);
            let indicatorLeftFullBorder = indicatorThemeNode.get_padding(St.Side.LEFT) + indicatorThemeNode.get_border_width(St.Side.LEFT);
            let indicatorRightFullBorder = indicatorThemeNode.get_padding(St.Side.RIGHT) + indicatorThemeNode.get_border_width(St.Side.RIGHT);

            // passingthru67 - moved above
            //let y = contentBox.y1;

            if (this._dropPlaceholderPos == -1) {
                Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this, function() {
                    this._dropPlaceholder.hide();
                }));
            }

            for (let i = 0; i < this._thumbnails.length; i++) {
                let thumbnail = this._thumbnails[i];

                if (i > 0)
                    y += spacing - Math.round(thumbnail.collapseFraction * spacing);

                let x1, x2;
                if (rtl) {
                    x1 = contentBox.x1 + slideOffset * thumbnail.slidePosition;
                    x2 = x1 + thumbnailWidth;
                } else {
                    x1 = contentBox.x2 - thumbnailWidth + slideOffset * thumbnail.slidePosition;
                    x2 = x1 + thumbnailWidth;
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

            if (rtl) {
                childBox.x1 = contentBox.x1;
                childBox.x2 = contentBox.x1 + thumbnailWidth;
            } else {
                childBox.x1 = contentBox.x2 - thumbnailWidth;
                childBox.x2 = contentBox.x2;
            }
            childBox.x1 -= indicatorLeftFullBorder;
            childBox.x2 += indicatorRightFullBorder;
            childBox.y1 = indicatorY1 - indicatorTopFullBorder;
            // passingthru67 - indicator needs to include caption
            //childBox.y2 = (indicatorY2 ? indicatorY2 : (indicatorY1 + thumbnailHeight)) + indicatorBottomFullBorder;
            childBox.y2 = (indicatorY2 ? indicatorY2 + captionBackgroundHeight : (indicatorY1 + thumbnailHeight + captionBackgroundHeight)) + indicatorBottomFullBorder;

            this._indicator.allocate(childBox, flags);

        }
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

        // passingthru67 - conditional for gnome shell 3.4/3.6/# differences
        if (this._gsCurrentVersion[1] < 6) {
            this._animatingIndicator = true;
            this.indicatorY = this._indicator.allocation.y1;
        } else {
            this._animatingIndicator = true;
            let indicatorThemeNode = this._indicator.get_theme_node();
            let indicatorTopFullBorder = indicatorThemeNode.get_padding(St.Side.TOP) + indicatorThemeNode.get_border_width(St.Side.TOP);
            this.indicatorY = this._indicator.allocation.y1 + indicatorTopFullBorder;
        }

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
